import { useRef, useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { FileArchive, FileText, MessageSquareText, Upload } from 'lucide-react'
import { unzipSync } from 'fflate'
import { createImportBatch, discardImportBatch, listImportBatches } from '../server/import.functions'
import { getWorkspace } from '../server/tickets.functions'
import { compressImage, uploadMedia, type UploadedMedia } from '../lib/image'
import { buildDrafts, parseChat } from '../lib/whatsapp'
import { Alert, Badge, Button, Card, Field, SectionTitle, Select, cx, toast } from '../components/ui'
import { fmtDateTime } from '../lib/format'
import { isAdmin } from '../lib/domain'

const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  pdf: 'application/pdf',
}

export const Route = createFileRoute('/_app/admin/whatsapp/')({
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.user.role)) throw redirect({ to: '/' })
  },
  loader: async () => {
    const [batches, workspace] = await Promise.all([
      listImportBatches({ data: undefined }),
      getWorkspace({ data: undefined }),
    ])
    return { batches, hotels: workspace.hotels }
  },
  component: ImportPage,
})

type Progress = { step: string; done: number; total: number } | null

function ImportPage() {
  const { batches, hotels } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [hotelId, setHotelId] = useState(hotels[0] ? String(hotels[0].id) : '')
  const [progress, setProgress] = useState<Progress>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    if (!hotelId) {
      setError('Bitte zuerst ein Standard-Hotel wählen.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const isZip = /\.zip$/i.test(file.name)
      const { chatText, files } = isZip ? await readZip(file) : { chatText: await file.text(), files: new Map() }

      if (!chatText.trim()) {
        setError('In der Datei wurde kein WhatsApp-Chatverlauf gefunden.')
        return
      }

      setProgress({ step: 'Chat wird analysiert', done: 0, total: 1 })
      const messages = parseChat(chatText)
      const drafts = buildDrafts(messages, {
        hotelSlugs: hotels.map((h) => h.slug),
        defaultHotelSlug: hotels.find((h) => h.id === Number(hotelId))?.slug ?? null,
      })
      if (!drafts.length) {
        setError('Es konnten keine Meldungen aus dem Chat gelesen werden.')
        return
      }

      // Upload only the attachments the drafts actually reference, one at a
      // time so no single request comes close to the function payload limit.
      const wanted = new Set(drafts.flatMap((d) => d.attachmentNames))
      const uploads = new Map<string, UploadedMedia>()
      const uploadable = [...wanted].filter((name) => files.has(name) && mediaTypeOf(name))
      let done = 0
      setProgress({ step: 'Bilder werden übertragen', done, total: uploadable.length })

      for (const name of uploadable) {
        const bytes = files.get(name)!
        const mimeType = mediaTypeOf(name)!
        try {
          const asFile = new File([bytes as BlobPart], name, { type: mimeType })
          const prepared = mimeType.startsWith('image/') ? await compressImage(asFile) : null
          const uploaded = await uploadMedia(
            prepared ? new Blob([prepared.blob], { type: prepared.mimeType }) : asFile,
            name,
            'import',
          )
          uploads.set(name, uploaded)
        } catch {
          // A single unreadable attachment must not stop the whole import.
        }
        done += 1
        setProgress({ step: 'Bilder werden übertragen', done, total: uploadable.length })
      }

      setProgress({ step: 'Vorschau wird erstellt', done: 1, total: 1 })
      const bySlug = new Map(hotels.map((h) => [h.slug, h.id]))
      const res = await createImportBatch({
        data: {
          filename: file.name,
          defaultHotelId: Number(hotelId),
          messageCount: messages.filter((m) => !m.system).length,
          entries: drafts.map((d) => ({
            sortIndex: d.sortIndex,
            reportedAt: d.reportedAt,
            rawTimestamp: d.rawTimestamp,
            sender: d.sender,
            rawText: d.rawText,
            hotelId: d.hotelSlug ? (bySlug.get(d.hotelSlug) ?? null) : null,
            area: d.area,
            roomNumber: d.roomNumber,
            title: d.title,
            description: d.description,
            priority: d.priority,
            media: d.attachmentNames
              .map((n) => uploads.get(n))
              .filter((m): m is UploadedMedia => !!m)
              .map((m) => ({ key: m.key, name: m.name, mimeType: m.mimeType, size: m.size })),
            include: d.include,
            needsReview: d.needsReview,
            reviewReason: d.reviewReason,
          })),
        },
      })

      await router.invalidate()
      navigate({ to: '/admin/whatsapp/$batchId', params: { batchId: String(res.batchId) } })
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Die Datei konnte nicht gelesen werden (${err.message}).`
          : 'Die Datei konnte nicht gelesen werden.',
      )
    } finally {
      setBusy(false)
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="animate-rise">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">WhatsApp-Chat importieren</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-fog-400">
          Lade den exportierten Chatverlauf hoch – als ZIP mit Medien oder als reine Textdatei. Die App erkennt Datum,
          Uhrzeit, Absender, Zimmernummer, Hotel und Problem und zeigt dir eine Vorschau zur Korrektur. Erst danach
          werden Tickets angelegt. Aus WhatsApp wird nichts gelöscht.
        </p>
      </header>

      <Card className="p-4">
        <Field
          label="Standard-Hotel"
          hint="Wird verwendet, wenn im Text kein Hotel erkennbar ist. Diese Meldungen werden als „Zuordnung prüfen“ markiert."
        >
          <Select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.txt,application/zip,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={cx(
              'tap flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-ink-600 bg-ink-900/60 px-4 py-10 text-center transition-colors',
              busy ? 'opacity-60' : 'hover:border-brass-500/60 hover:bg-brass-500/[0.05]',
            )}
          >
            <Upload className="size-6 text-brass-400" />
            <span className="font-display text-[15.5px] text-fog-100">Datei auswählen</span>
            <span className="text-[12.5px] text-fog-500">
              WhatsApp → Chat → Mehr → Chat exportieren → „Medien einschließen“
            </span>
          </button>
        </div>

        {progress && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[12.5px] text-fog-400">
              <span>{progress.step}</span>
              <span className="font-mono tabular-nums">
                {progress.total > 1 ? `${progress.done}/${progress.total}` : ''}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-brass-500 transition-[width] duration-300"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 20}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-fog-500">
          <span className="flex items-center gap-1.5">
            <FileArchive className="size-3.5" /> ZIP mit Medien
          </span>
          <span className="flex items-center gap-1.5">
            <FileText className="size-3.5" /> _chat.txt ohne Medien
          </span>
        </div>
      </Card>

      <section>
        <SectionTitle>Importe</SectionTitle>
        {batches.length === 0 ? (
          <Card className="px-4 py-8 text-center text-[13px] text-fog-500">Noch kein Chat importiert.</Card>
        ) : (
          <Card className="divide-y divide-ink-800">
            {batches.map((batch) => (
              <div key={batch.id} className="flex items-center gap-3 px-4 py-3.5">
                <MessageSquareText className="size-4 shrink-0 text-fog-500" />
                <Link
                  to="/admin/whatsapp/$batchId"
                  params={{ batchId: String(batch.id) }}
                  className="tap min-w-0 flex-1"
                >
                  <p className="truncate text-[14px] text-fog-100">{batch.filename}</p>
                  <p className="mt-0.5 text-[12px] text-fog-500">
                    {batch.entryCount} Meldungen · {batch.mediaCount} Bilder · {fmtDateTime(batch.createdAt)}
                    {batch.defaultHotel ? ` · ${batch.defaultHotel}` : ''}
                  </p>
                </Link>
                <Badge
                  tone={batch.status === 'imported' ? 'moss' : batch.status === 'draft' ? 'amber' : 'neutral'}
                >
                  {batch.status === 'imported' ? 'importiert' : batch.status === 'draft' ? 'Vorschau' : 'verworfen'}
                </Badge>
                {batch.status === 'draft' && (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={async () => {
                      await discardImportBatch({ data: { id: batch.id } })
                      await router.invalidate()
                      toast.success('Vorschau verworfen – in WhatsApp bleibt alles unverändert.')
                    }}
                  >
                    Verwerfen
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  )
}

const mediaTypeOf = (name: string) => MEDIA_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? null

/** Unpacks a WhatsApp export in the browser: chat text plus attachment bytes. */
async function readZip(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const unpacked = unzipSync(buffer)
  const files = new Map<string, Uint8Array>()
  let chatText = ''

  for (const [path, bytes] of Object.entries(unpacked)) {
    const name = path.split('/').pop() ?? path
    if (!name) continue
    if (/\.txt$/i.test(name)) {
      const text = new TextDecoder('utf-8').decode(bytes)
      if (text.length > chatText.length) chatText = text
      continue
    }
    files.set(name, bytes)
  }
  return { chatText, files }
}
