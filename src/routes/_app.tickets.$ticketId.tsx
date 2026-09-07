import { useState } from 'react'
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Camera, ChevronLeft, Pencil, Send, Trash2, TriangleAlert, UserCheck, UserMinus } from 'lucide-react'
import {
  addComment,
  addPhotos,
  assignTicket,
  claimTicket,
  deletePhoto,
  fetchTicket,
  getWorkspace,
  releaseTicket,
  setTicketStatus,
  updateTicket,
} from '../server/tickets.functions'
import type { UploadedMedia } from '../lib/image'
import { PriorityBadge, StatusBadge } from '../components/badges'
import { locationLabel } from '../components/TicketCard'
import { Lightbox } from '../components/Lightbox'
import { PhotoUploader } from '../components/PhotoUploader'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  Select,
  Sheet,
  Textarea,
  cx,
  toast,
} from '../components/ui'
import { AREAS, PRIORITIES, STATUSES, canWorkTickets, isAdmin, type Area, type Priority } from '../lib/domain'
import { fmtDateTime, fmtAgo, initials } from '../lib/format'

export const Route = createFileRoute('/_app/tickets/$ticketId')({
  loader: async ({ params }) => {
    const id = Number(params.ticketId)
    if (!Number.isInteger(id) || id <= 0) throw notFound()
    const [detail, workspace] = await Promise.all([
      fetchTicket({ data: { id } }),
      getWorkspace({ data: undefined }),
    ])
    if (!detail) throw notFound()
    return { ...detail, hotels: workspace.hotels, staff: workspace.staff, config: workspace.config }
  },
  component: TicketDetailPage,
  notFoundComponent: () => (
    <Card className="p-8 text-center">
      <p className="font-display text-[18px] text-fog-100">Ticket nicht gefunden</p>
      <p className="mt-1 text-[13.5px] text-fog-400">Es wurde vielleicht gelöscht oder der Link ist falsch.</p>
    </Card>
  ),
})

function TicketDetailPage() {
  const { ticket, photos, comments, events, hotels, staff, config } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [afterOpen, setAfterOpen] = useState(false)

  const mayWork = canWorkTickets(user.role)
  const admin = isAdmin(user.role)
  const mine = ticket.assignedToId === user.id
  const before = photos.filter((p) => p.phase === 'before')
  const after = photos.filter((p) => p.phase === 'after')
  const technicians = staff.filter((s) => s.role === 'technik' || s.role === 'admin')

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key)
    setError(null)
    try {
      const res = await fn()
      if (!res.ok) {
        setError(res.error ?? 'Aktion fehlgeschlagen.')
        return false
      }
      await router.invalidate()
      return true
    } catch {
      setError('Aktion fehlgeschlagen. Bitte erneut versuchen.')
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="animate-rise">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="tap mb-3 inline-flex items-center gap-1 text-[13px] text-fog-400 hover:text-fog-200"
        >
          <ChevronLeft className="size-4" />
          Zurück
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.source === 'whatsapp' && <Badge tone="neutral">WhatsApp-Import</Badge>}
          <span className="font-mono text-[11px] text-fog-500">#{ticket.id}</span>
        </div>

        <h1 className="mt-3 font-display text-[24px] leading-tight text-fog-50 sm:text-[28px]">{ticket.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fog-400">
          <span className="font-medium text-fog-200">{locationLabel(ticket)}</span>
          <span>{ticket.hotelName}</span>
          <span>·</span>
          <span>{fmtDateTime(ticket.reportedAt)}</span>
          <span>·</span>
          <span>von {ticket.createdByName ?? ticket.externalAuthor ?? 'unbekannt'}</span>
        </div>
      </header>

      {ticket.needsReview && (
        <Alert tone="info">
          <span className="flex flex-wrap items-center gap-2">
            <TriangleAlert className="size-4 shrink-0 text-brass-300" />
            Diese Meldung stammt aus dem WhatsApp-Import – die Zuordnung sollte geprüft werden.
            {admin && (
              <button
                type="button"
                className="tap font-semibold text-brass-300 underline decoration-brass-500/40 underline-offset-2"
                onClick={() =>
                  run('review', () =>
                    updateTicket({
                      data: {
                        id: ticket.id,
                        hotelId: ticket.hotelId,
                        area: ticket.area as Area,
                        roomNumber: ticket.roomNumber,
                        title: ticket.title,
                        description: ticket.description ?? '',
                        priority: ticket.priority as Priority,
                        clearReview: true,
                      },
                    }),
                  )
                }
              >
                Zuordnung bestätigen
              </button>
            )}
          </span>
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {ticket.description && (
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-fog-200">{ticket.description}</p>
        </Card>
      )}

      {/* ------------------------------------------------------------ workflow */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cx(
                'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold',
                ticket.assignedToName ? 'bg-brass-500/15 text-brass-300' : 'bg-ink-800 text-fog-500',
              )}
            >
              {ticket.assignedToName ? initialsOf(ticket.assignedToName) : '–'}
            </span>
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog-500">Bearbeitet von</p>
              <p className="text-[14px] text-fog-100">{ticket.assignedToName ?? 'Noch niemand'}</p>
            </div>
          </div>

          {mayWork && (
            <div className="flex gap-2">
              {!ticket.assignedToId && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<UserCheck className="size-4" />}
                  busy={busy === 'claim'}
                  onClick={() => run('claim', () => claimTicket({ data: { id: ticket.id } }))}
                >
                  Übernehmen
                </Button>
              )}
              {mine && ticket.status !== 'erledigt' && (
                <Button
                  variant="quiet"
                  size="sm"
                  icon={<UserMinus className="size-4" />}
                  busy={busy === 'release'}
                  onClick={() => run('release', () => releaseTicket({ data: { id: ticket.id } }))}
                >
                  Freigeben
                </Button>
              )}
            </div>
          )}
        </div>

        {mayWork && (
          <div className="mt-4 border-t border-ink-800 pt-4">
            <p className="label mb-2">Status</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  disabled={busy === `status-${s.value}` || ticket.status === s.value}
                  onClick={async () => {
                    const ok = await run(`status-${s.value}`, () =>
                      setTicketStatus({ data: { id: ticket.id, status: s.value } }),
                    )
                    if (!ok && s.value === 'erledigt' && !after.length) setAfterOpen(true)
                  }}
                  className={cx(
                    'tap rounded-xl border px-2 py-3 text-[13px] font-medium transition-colors disabled:cursor-default',
                    ticket.status === s.value
                      ? s.value === 'erledigt'
                        ? 'border-moss/55 bg-moss/14 text-moss'
                        : s.value === 'in_bearbeitung'
                          ? 'border-steel-signal/55 bg-steel-signal/14 text-steel-signal'
                          : 'border-amber-signal/55 bg-amber-signal/14 text-amber-signal'
                      : 'border-ink-800 bg-ink-900 text-fog-400 hover:border-ink-600',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {config.requireAfterPhoto && !after.length && ticket.status !== 'erledigt' && (
              <p className="mt-2 text-[12.5px] text-fog-500">
                Zum Abschließen ist ein Foto nach der Reparatur nötig.
              </p>
            )}
          </div>
        )}

        {admin && (
          <div className="mt-4 flex flex-col gap-3 border-t border-ink-800 pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Zuweisen">
                <Select
                  value={ticket.assignedToId ? String(ticket.assignedToId) : ''}
                  onChange={(e) =>
                    run('assign', () =>
                      assignTicket({
                        data: { id: ticket.id, userId: e.target.value ? Number(e.target.value) : null },
                      }),
                    )
                  }
                >
                  <option value="">Niemand</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName} ({t.openAssigned} offen)
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
              Ticket bearbeiten
            </Button>
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------------- photos */}
      <section>
        <SectionTitle>Fotos</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <PhotoGroup
            title="Vor der Reparatur"
            tone="amber"
            photos={before}
            allPhotos={photos}
            onOpen={setLightbox}
            canDelete={admin}
            onDelete={(photoId) => run('photo', () => deletePhoto({ data: { photoId } }))}
          />
          <PhotoGroup
            title="Nach der Reparatur"
            tone="moss"
            photos={after}
            allPhotos={photos}
            onOpen={setLightbox}
            canDelete={admin}
            onDelete={(photoId) => run('photo', () => deletePhoto({ data: { photoId } }))}
            empty="Noch kein Foto nach der Reparatur."
          />
        </div>

        {mayWork && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Camera className="size-4" />} onClick={() => setAfterOpen(true)}>
              Foto nach Reparatur
            </Button>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ comments */}
      <section>
        <SectionTitle>Kommentare</SectionTitle>
        <Card className="divide-y divide-ink-800">
          {comments.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-fog-500">
              Noch keine Kommentare. Notiere hier Zwischenstände oder Rückfragen.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3 px-4 py-3.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] font-bold text-fog-300">
                  {initialsOf(c.authorName ?? '?')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13.5px] font-semibold text-fog-100">{c.authorName ?? 'Unbekannt'}</span>
                    <span className="font-mono text-[10.5px] text-fog-500">{fmtDateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-fog-300">{c.body}</p>
                </div>
              </div>
            ))
          )}
          <CommentComposer
            onSubmit={async (body) => {
              const ok = await run('comment', () => addComment({ data: { id: ticket.id, body } }))
              if (ok) toast.success('Kommentar gespeichert.')
              return ok
            }}
          />
        </Card>
      </section>

      {/* --------------------------------------------------------------- events */}
      <section>
        <SectionTitle>Verlauf</SectionTitle>
        <Card className="p-4">
          <ol className="flex flex-col gap-0">
            {events.map((ev, i) => (
              <li key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', eventDot(ev.type))} />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-ink-800" />}
                </div>
                <div className="pb-4">
                  <p className="text-[13.5px] text-fog-200">{ev.message}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-fog-500">
                    {ev.actorName ?? 'System'} · {fmtDateTime(ev.createdAt)} · {fmtAgo(ev.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {lightbox !== null && photos.length > 0 && (
        <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} />
      )}

      <AfterPhotoSheet
        open={afterOpen}
        onClose={() => setAfterOpen(false)}
        ticketId={ticket.id}
        onSaved={async () => {
          await router.invalidate()
          setAfterOpen(false)
        }}
      />

      {admin && (
        <EditSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          ticket={ticket}
          hotels={hotels}
          onSaved={async () => {
            await router.invalidate()
            setEditOpen(false)
            toast.success('Ticket aktualisiert.')
          }}
        />
      )}
    </div>
  )
}

const initialsOf = (name: string) => {
  const [a, b] = name.trim().split(/\s+/)
  return initials(a ?? '', b ?? '')
}

function eventDot(type: string) {
  if (type === 'status') return 'bg-steel-signal'
  if (type === 'claimed') return 'bg-brass-500'
  if (type === 'photo') return 'bg-moss'
  if (type === 'comment') return 'bg-fog-500'
  if (type === 'imported') return 'bg-ember'
  return 'bg-ink-600'
}

function PhotoGroup({
  title,
  tone,
  photos,
  allPhotos,
  onOpen,
  canDelete,
  onDelete,
  empty = 'Kein Foto vorhanden.',
}: {
  title: string
  tone: 'amber' | 'moss'
  photos: Array<{ id: number; blobKey: string; phase: string; uploadedByName: string | null; createdAt: string | Date }>
  allPhotos: Array<{ id: number }>
  onOpen: (index: number) => void
  canDelete: boolean
  onDelete: (photoId: number) => void
  empty?: string
}) {
  return (
    <Card className="p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cx('size-1.5 rounded-full', tone === 'amber' ? 'bg-amber-signal' : 'bg-moss')} />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog-400">{title}</p>
        <span className="ml-auto font-mono text-[11px] text-fog-500">{photos.length}</span>
      </div>
      {photos.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-fog-500">{empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-ink-800">
              <button
                type="button"
                onClick={() => onOpen(allPhotos.findIndex((a) => a.id === p.id))}
                className="tap size-full"
                aria-label={`${title} öffnen`}
                title={`${p.uploadedByName ?? 'Unbekannt'} · ${fmtDateTime(p.createdAt)}`}
              >
                <img
                  src={`/api/media/${p.blobKey}`}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
              {/* Attribution stays visible on the tile — the admin should not have to open
                  each photo to see who uploaded it. */}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink-950/85 to-transparent px-1.5 pb-1 pt-4 text-[10px] leading-none text-fog-300">
                {p.uploadedByName ?? 'Unbekannt'}
              </span>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  className="tap absolute right-1 top-1 grid size-7 place-items-center rounded-md bg-ink-950/80 text-fog-300 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  aria-label="Foto löschen"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function CommentComposer({ onSubmit }: { onSubmit: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="flex items-end gap-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!body.trim()) return
        setBusy(true)
        const ok = await onSubmit(body.trim())
        setBusy(false)
        if (ok) setBody('')
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Kommentar hinzufügen…"
        maxLength={2000}
        className="flex-1"
      />
      <Button type="submit" variant="primary" icon={<Send className="size-4" />} busy={busy} disabled={!body.trim()}>
        <span className="sr-only sm:not-sr-only">Senden</span>
      </Button>
    </form>
  )
}

function AfterPhotoSheet({
  open,
  onClose,
  ticketId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  ticketId: number
  onSaved: () => Promise<void>
}) {
  const [media, setMedia] = useState<Array<UploadedMedia>>([])
  const [busy, setBusy] = useState(false)

  return (
    <Sheet open={open} onClose={onClose} title="Foto nach Reparatur">
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] text-fog-400">
          Dokumentiere das Ergebnis – so ist später nachvollziehbar, was erledigt wurde.
        </p>
        <PhotoUploader value={media} onChange={setMedia} label="Nach der Reparatur" max={8} />
        <Button
          variant="primary"
          block
          busy={busy}
          disabled={!media.length}
          onClick={async () => {
            setBusy(true)
            try {
              const res = await addPhotos({
                data: {
                  id: ticketId,
                  phase: 'after',
                  photos: media.map((m) => ({ key: m.key, mimeType: m.mimeType, size: m.size, name: m.name })),
                },
              })
              if (!res.ok) {
                toast.error(res.error ?? 'Upload fehlgeschlagen.')
                return
              }
              setMedia([])
              toast.success('Fotos gespeichert.')
              await onSaved()
            } finally {
              setBusy(false)
            }
          }}
        >
          {media.length ? `${media.length} Foto${media.length > 1 ? 's' : ''} speichern` : 'Foto auswählen'}
        </Button>
      </div>
    </Sheet>
  )
}

function EditSheet({
  open,
  onClose,
  ticket,
  hotels,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  ticket: {
    id: number
    hotelId: number
    area: string
    roomNumber: string | null
    title: string
    description: string | null
    priority: string
    needsReview: boolean
  }
  hotels: Array<{ id: number; name: string }>
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    hotelId: ticket.hotelId,
    area: ticket.area,
    roomNumber: ticket.roomNumber ?? '',
    title: ticket.title,
    description: ticket.description ?? '',
    priority: ticket.priority,
    clearReview: ticket.needsReview,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet open={open} onClose={onClose} title={`Ticket #${ticket.id} bearbeiten`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const res = await updateTicket({
              data: {
                id: ticket.id,
                hotelId: form.hotelId,
                area: form.area as Area,
                roomNumber: form.roomNumber.trim() || null,
                title: form.title.trim(),
                description: form.description.trim(),
                priority: form.priority as Priority,
                clearReview: form.clearReview,
              },
            })
            if (!res.ok) {
              setError(res.error ?? 'Speichern fehlgeschlagen.')
              return
            }
            await onSaved()
          } catch {
            setError('Speichern fehlgeschlagen.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Hotel">
          <Select value={String(form.hotelId)} onChange={(e) => setForm({ ...form, hotelId: Number(e.target.value) })}>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bereich">
            <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
              {AREAS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zimmer / Nr.">
            <Input value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />
          </Field>
        </div>
        <Field label="Problem">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} />
        </Field>
        <Field label="Details">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
          />
        </Field>
        <Field label="Priorität">
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        {ticket.needsReview && (
          <label className="flex items-start gap-2.5 text-[13.5px] text-fog-300">
            <input
              type="checkbox"
              checked={form.clearReview}
              onChange={(e) => setForm({ ...form, clearReview: e.target.checked })}
              className="mt-0.5 size-4 accent-[var(--color-brass-500)]"
            />
            Zuordnung ist geprüft – Markierung entfernen
          </label>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" block onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" block busy={busy}>
            Speichern
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
