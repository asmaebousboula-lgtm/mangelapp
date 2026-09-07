import { useMemo, useState } from 'react'
import { Link, createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router'
import { Check, ChevronDown, ChevronLeft, Play, TriangleAlert } from 'lucide-react'
import {
  commitImport,
  discardImportBatch,
  fetchImportBatch,
  setAllEntriesIncluded,
  updateImportEntry,
} from '../server/import.functions'
import { getWorkspace } from '../server/tickets.functions'
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea, cx, toast } from '../components/ui'
import { AREAS, PRIORITIES, isAdmin, type Area, type Priority } from '../lib/domain'
import { fmtDateTime } from '../lib/format'

export const Route = createFileRoute('/_app/admin/whatsapp/$batchId')({
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.user.role)) throw redirect({ to: '/' })
  },
  loader: async ({ params }) => {
    const id = Number(params.batchId)
    if (!Number.isInteger(id) || id <= 0) throw notFound()
    const [data, workspace] = await Promise.all([
      fetchImportBatch({ data: { id } }),
      getWorkspace({ data: undefined }),
    ])
    if (!data) throw notFound()
    return { ...data, hotels: workspace.hotels }
  },
  component: ImportPreviewPage,
})

function ImportPreviewPage() {
  const { batch, entries, hotels } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; flagged: number; skipped: number } | null>(null)

  const draft = batch.status === 'draft'
  const stats = useMemo(() => {
    const included = entries.filter((e) => e.include)
    return {
      included: included.length,
      review: included.filter((e) => e.needsReview).length,
      media: entries.reduce((n, e) => n + (e.mediaKeys?.length ?? 0), 0),
    }
  }, [entries])

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="animate-rise">
        <Link
          to="/admin/whatsapp"
          className="tap mb-3 inline-flex items-center gap-1 text-[13px] text-fog-400 hover:text-fog-200"
        >
          <ChevronLeft className="size-4" />
          Alle Importe
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={draft ? 'amber' : batch.status === 'imported' ? 'moss' : 'neutral'}>
            {draft ? 'Vorschau' : batch.status === 'imported' ? 'importiert' : 'verworfen'}
          </Badge>
          <span className="font-mono text-[11px] text-fog-500">{fmtDateTime(batch.createdAt)}</span>
        </div>
        <h1 className="mt-2.5 break-all font-display text-[22px] leading-tight text-fog-50 sm:text-[26px]">
          {batch.filename}
        </h1>
        <p className="mt-1 text-[13.5px] text-fog-400">
          {batch.messageCount} Nachrichten gelesen · {entries.length} Meldungen erkannt · {stats.media} Bilder ·{' '}
          {stats.included} ausgewählt
          {stats.review > 0 && <span className="text-brass-300"> · {stats.review} × Zuordnung prüfen</span>}
        </p>
      </header>

      {result && (
        <Alert tone="success">
          {result.created} Tickets angelegt
          {result.flagged > 0 ? `, davon ${result.flagged} mit „Zuordnung prüfen“` : ''}
          {result.skipped > 0 ? `, ${result.skipped} übersprungen` : ''}.{' '}
          <Link to="/tickets" search={{ review: true }} className="font-semibold text-moss underline">
            Zu den Tickets
          </Link>
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {!draft && !result && (
        <Alert tone="info">
          Dieser Import ist abgeschlossen. Die Einträge sind hier nur noch zur Nachvollziehbarkeit gespeichert – in
          WhatsApp wurde nichts verändert.
        </Alert>
      )}

      {draft && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <Button
            variant="quiet"
            size="sm"
            busy={busy === 'all'}
            onClick={async () => {
              setBusy('all')
              await setAllEntriesIncluded({ data: { batchId: batch.id, include: true } })
              await router.invalidate()
              setBusy(null)
            }}
          >
            Alle auswählen
          </Button>
          <Button
            variant="quiet"
            size="sm"
            busy={busy === 'none'}
            onClick={async () => {
              setBusy('none')
              await setAllEntriesIncluded({ data: { batchId: batch.id, include: false } })
              await router.invalidate()
              setBusy(null)
            }}
          >
            Alle abwählen
          </Button>
          <span className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              busy={busy === 'discard'}
              onClick={async () => {
                setBusy('discard')
                await discardImportBatch({ data: { id: batch.id } })
                await router.invalidate()
                setBusy(null)
                toast.success('Vorschau verworfen.')
              }}
            >
              Verwerfen
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Play className="size-4" />}
              busy={busy === 'commit'}
              disabled={stats.included === 0}
              onClick={async () => {
                setBusy('commit')
                setError(null)
                try {
                  const res = await commitImport({ data: { batchId: batch.id } })
                  if (!res.ok) {
                    setError(res.error ?? 'Import fehlgeschlagen.')
                    return
                  }
                  setResult({ created: res.created, flagged: res.flagged, skipped: res.skipped })
                  await router.invalidate()
                } finally {
                  setBusy(null)
                }
              }}
            >
              Import starten ({stats.included})
            </Button>
          </span>
        </Card>
      )}

      <div className="flex flex-col gap-2.5">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} hotels={hotels} editable={draft} />
        ))}
      </div>
    </div>
  )
}

type Entry = {
  id: number
  sortIndex: number
  reportedAt: string | Date | null
  rawTimestamp: string
  sender: string | null
  rawText: string | null
  hotelId: number | null
  area: string | null
  roomNumber: string | null
  title: string | null
  description: string | null
  priority: string
  mediaKeys: Array<{ key: string; name: string; mimeType: string; size: number }> | null
  include: boolean
  needsReview: boolean
  reviewReason: string | null
  ticketId: number | null
}

function EntryRow({
  entry,
  hotels,
  editable,
}: {
  entry: Entry
  hotels: Array<{ id: number; name: string; shortName: string }>
  editable: boolean
}) {
  const [form, setForm] = useState({
    hotelId: entry.hotelId ? String(entry.hotelId) : '',
    area: entry.area ?? '',
    roomNumber: entry.roomNumber ?? '',
    title: entry.title ?? '',
    description: entry.description ?? '',
    priority: entry.priority,
  })
  const [include, setInclude] = useState(entry.include)
  const [review, setReview] = useState({ needsReview: entry.needsReview, reason: entry.reviewReason })
  const [open, setOpen] = useState(entry.needsReview && editable)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function save(patch: Partial<typeof form> & { include?: boolean }) {
    if (!editable) return
    setState('saving')
    const next = { ...form, ...patch }
    try {
      const res = await updateImportEntry({
        data: {
          id: entry.id,
          hotelId: next.hotelId ? Number(next.hotelId) : null,
          area: next.area ? (next.area as Area) : null,
          roomNumber: next.roomNumber.trim() || null,
          title: next.title.trim(),
          description: next.description.trim(),
          priority: next.priority as Priority,
          ...(patch.include === undefined ? {} : { include: patch.include }),
        },
      })
      if (!res.ok) {
        setState('error')
        toast.error(res.error ?? 'Änderung nicht gespeichert.')
        return
      }
      setReview({ needsReview: res.needsReview, reason: (res.reviewReason as string | null) ?? null })
      setState('saved')
      setTimeout(() => setState('idle'), 1400)
    } catch {
      setState('error')
    }
  }

  return (
    <Card
      className={cx(
        'overflow-hidden',
        !include && 'opacity-55',
        review.needsReview && include && 'border-brass-500/40',
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        {editable && (
          <button
            type="button"
            onClick={() => {
              const next = !include
              setInclude(next)
              void save({ include: next })
            }}
            className={cx(
              'tap mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border transition-colors',
              include ? 'border-brass-500 bg-brass-500 text-ink-950' : 'border-ink-600 bg-ink-850 text-transparent',
            )}
            aria-label={include ? 'Nicht importieren' : 'Importieren'}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </button>
        )}

        <button type="button" onClick={() => setOpen((v) => !v)} className="tap min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[15px] text-fog-50">
              {form.area === 'zimmer' && form.roomNumber ? `Zimmer ${form.roomNumber}` : areaName(form.area)}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fog-500">
              {hotels.find((h) => h.id === Number(form.hotelId))?.shortName ?? 'kein Hotel'}
            </span>
            {review.needsReview && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-brass-300">
                <TriangleAlert className="size-3" />
                {review.reason ?? 'Zuordnung prüfen'}
              </span>
            )}
            {entry.ticketId && (
              <Link
                to="/tickets/$ticketId"
                params={{ ticketId: String(entry.ticketId) }}
                className="font-mono text-[10.5px] text-moss underline"
              >
                #{entry.ticketId}
              </Link>
            )}
          </div>
          <p className="mt-1 line-clamp-1 text-[13.5px] text-fog-200">{form.title || '—'}</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-fog-500">
            {entry.reportedAt ? fmtDateTime(entry.reportedAt) : entry.rawTimestamp || 'ohne Zeitstempel'}
            {entry.sender ? ` · ${entry.sender}` : ''}
            {entry.mediaKeys?.length ? ` · ${entry.mediaKeys.length} Bild(er)` : ''}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {state === 'saving' && <span className="font-mono text-[10px] text-fog-500">speichert…</span>}
          {state === 'saved' && <span className="font-mono text-[10px] text-moss">gespeichert</span>}
          <ChevronDown
            className={cx('size-4 text-fog-500 transition-transform', open && 'rotate-180')}
            onClick={() => setOpen((v) => !v)}
          />
        </div>
      </div>

      {open && (
        <div className="animate-fade border-t border-ink-800 bg-ink-900/50 px-3.5 py-4">
          {entry.rawText && (
            <div className="mb-4">
              <p className="label mb-1.5">Originalnachricht</p>
              <p className="whitespace-pre-wrap rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-fog-400">
                {entry.rawText}
              </p>
            </div>
          )}

          {!!entry.mediaKeys?.length && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {entry.mediaKeys.map((m) => (
                <img
                  key={m.key}
                  src={`/api/media/${m.key}`}
                  alt={m.name}
                  loading="lazy"
                  className="size-16 rounded-lg border border-ink-800 object-cover"
                />
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hotel">
              <Select
                value={form.hotelId}
                disabled={!editable}
                onChange={(e) => {
                  setForm({ ...form, hotelId: e.target.value })
                  void save({ hotelId: e.target.value })
                }}
              >
                <option value="">Nicht zugeordnet</option>
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bereich">
              <Select
                value={form.area}
                disabled={!editable}
                onChange={(e) => {
                  setForm({ ...form, area: e.target.value })
                  void save({ area: e.target.value })
                }}
              >
                <option value="">Nicht erkannt</option>
                {AREAS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Zimmer / Nr.">
              <Input
                value={form.roomNumber}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
                onBlur={() => void save({})}
              />
            </Field>
            <Field label="Priorität">
              <Select
                value={form.priority}
                disabled={!editable}
                onChange={(e) => {
                  setForm({ ...form, priority: e.target.value })
                  void save({ priority: e.target.value })
                }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <Field label="Problem">
              <Input
                value={form.title}
                disabled={!editable}
                maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                onBlur={() => void save({})}
              />
            </Field>
            <Field label="Details">
              <Textarea
                value={form.description}
                disabled={!editable}
                rows={3}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                onBlur={() => void save({})}
              />
            </Field>
          </div>
        </div>
      )}
    </Card>
  )
}

const areaName = (v: string) => AREAS.find((a) => a.value === v)?.label ?? 'Bereich offen'
