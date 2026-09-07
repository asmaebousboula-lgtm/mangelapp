import { useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Check, ChevronLeft } from 'lucide-react'
import { createTicket, getWorkspace } from '../server/tickets.functions'
import type { UploadedMedia } from '../lib/image'
import { Alert, Button, Card, Field, Input, Textarea, cx, toast } from '../components/ui'
import { PhotoUploader } from '../components/PhotoUploader'
import { AREAS, PRIORITIES, PROBLEM_PRESETS, type Area, type Priority } from '../lib/domain'

export const Route = createFileRoute('/_app/tickets/neu')({
  loader: async () => getWorkspace({ data: undefined }),
  component: NewTicketPage,
})

const PRIORITY_STYLE: Record<Priority, string> = {
  normal: 'border-ink-700 bg-ink-850 text-fog-200',
  dringend: 'border-amber-signal/50 bg-amber-signal/12 text-amber-signal',
  sehr_dringend: 'border-ember/55 bg-ember/14 text-ember',
}

function NewTicketPage() {
  const { hotels } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const router = useRouter()

  const [hotelId, setHotelId] = useState<number | null>(
    user.hotelId ?? (hotels.length === 1 ? hotels[0].id : null),
  )
  const [area, setArea] = useState<Area | ''>('')
  const [roomNumber, setRoomNumber] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [photos, setPhotos] = useState<Array<UploadedMedia>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!hotelId) return setError('Bitte ein Hotel auswählen.')
    if (!area) return setError('Bitte einen Bereich auswählen.')
    if (area === 'zimmer' && !roomNumber.trim()) return setError('Bitte die Zimmernummer angeben.')
    if (title.trim().length < 3) return setError('Bitte das Problem kurz beschreiben.')

    setBusy(true)
    try {
      const res = await createTicket({
        data: {
          hotelId,
          area,
          roomNumber: roomNumber.trim() || undefined,
          title: title.trim(),
          description: description.trim(),
          priority,
          photos: photos.map((p) => ({ key: p.key, mimeType: p.mimeType, size: p.size, name: p.name })),
        },
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success('Meldung erstellt.')
      await router.invalidate()
      navigate({ to: '/tickets/$ticketId', params: { ticketId: String(res.id) } })
    } catch {
      setError('Die Meldung konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pb-4">
      <header className="animate-rise">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="tap mb-3 inline-flex items-center gap-1 text-[13px] text-fog-400 hover:text-fog-200"
        >
          <ChevronLeft className="size-4" />
          Zurück
        </button>
        <p className="eyebrow">Schritt für Schritt</p>
        <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">Neue Meldung</h1>
        <p className="mt-1 text-[13.5px] text-fog-400">
          Datum, Uhrzeit und dein Name werden automatisch gespeichert.
        </p>
      </header>

      {/* ------------------------------------------------------------- hotel */}
      <section>
        <p className="label mb-2">Hotel</p>
        <div className="grid grid-cols-2 gap-2">
          {hotels.map((hotel) => (
            <button
              key={hotel.id}
              type="button"
              onClick={() => setHotelId(hotel.id)}
              className={cx(
                'tap rounded-xl border px-3.5 py-3 text-left transition-colors',
                hotelId === hotel.id
                  ? 'border-brass-500/70 bg-brass-500/12'
                  : 'border-ink-700 bg-ink-850 hover:border-ink-600',
              )}
            >
              <span
                className={cx(
                  'block font-display text-[15px]',
                  hotelId === hotel.id ? 'text-brass-300' : 'text-fog-100',
                )}
              >
                {hotel.shortName}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] text-fog-500">{hotel.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- area */}
      <section>
        <p className="label mb-2">Bereich</p>
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setArea(a.value)}
              className={cx(
                'tap rounded-full border px-3.5 py-2 text-[13px] transition-colors',
                area === a.value
                  ? 'border-brass-500/70 bg-brass-500/14 text-brass-300'
                  : 'border-ink-700 bg-ink-850 text-fog-300 hover:border-ink-600',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        {area && (
          <div className="animate-fade mt-3">
            <Field
              label={area === 'zimmer' ? 'Zimmernummer' : 'Nummer / Bezeichnung (optional)'}
              hint={area === 'zimmer' ? undefined : 'z. B. Aufzug 2 oder WC Lobby'}
            >
              <Input
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder={area === 'zimmer' ? '205' : ''}
                inputMode={area === 'zimmer' ? 'numeric' : 'text'}
                autoComplete="off"
              />
            </Field>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ problem */}
      <section>
        <Field label="Problem" hint="Kurz und konkret – so findet die Technik es später wieder.">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Dusche undicht"
            maxLength={140}
          />
        </Field>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PROBLEM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTitle(preset)}
              className="tap rounded-lg border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-[12px] text-fog-400 transition-colors hover:border-ink-600 hover:text-fog-200"
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Field label="Details" hint="Optional: Was genau passiert, seit wann, was wurde schon versucht?">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Wasser läuft an der Rückwand herunter, Fliese unten links locker."
              maxLength={4000}
            />
          </Field>
        </div>
      </section>

      {/* ----------------------------------------------------------- priority */}
      <section>
        <p className="label mb-2">Priorität</p>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={cx(
                'tap relative rounded-xl border px-2 py-3 text-[13px] font-medium transition-colors',
                priority === p.value
                  ? PRIORITY_STYLE[p.value]
                  : 'border-ink-800 bg-ink-900 text-fog-400 hover:border-ink-600',
              )}
            >
              {priority === p.value && <Check className="absolute right-1.5 top-1.5 size-3.5 opacity-70" />}
              {p.label}
            </button>
          ))}
        </div>
        {priority === 'sehr_dringend' && (
          <p className="mt-2 text-[12.5px] text-ember">Die Technik wird sofort benachrichtigt.</p>
        )}
      </section>

      {/* -------------------------------------------------------------- photos */}
      <section>
        <PhotoUploader
          value={photos}
          onChange={setPhotos}
          label="Foto vor Reparatur"
          hint="Kamera direkt nutzen oder aus der Galerie wählen. Bilder werden automatisch verkleinert."
          max={8}
        />
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="sticky bottom-[calc(var(--shell-pad-bottom)+0.5rem)] z-10 p-3 lg:static lg:bg-transparent lg:p-0 lg:shadow-none">
        <Button type="submit" variant="primary" size="lg" block busy={busy}>
          Meldung absenden
        </Button>
      </Card>
    </form>
  )
}
