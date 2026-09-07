import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Building2, Plus } from 'lucide-react'
import { fetchSettings, listAllHotels, saveSettings, upsertHotel } from '../server/admin.functions'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  Sheet,
  Toggle,
  cx,
  toast,
} from '../components/ui'
import { isAdmin } from '../lib/domain'

export const Route = createFileRoute('/_app/admin/einstellungen')({
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.user.role)) throw redirect({ to: '/' })
  },
  loader: async () => {
    const [hotels, settings] = await Promise.all([
      listAllHotels({ data: undefined }),
      fetchSettings({ data: undefined }),
    ])
    return { hotels, settings }
  },
  component: SettingsPage,
})

type HotelRow = {
  id: number
  slug: string
  name: string
  shortName: string
  sortOrder: number
  active: boolean
  ticketCount: number
}

function SettingsPage() {
  const { hotels, settings } = Route.useLoaderData()
  const router = useRouter()
  const [config, setConfig] = useState(settings.config)
  const [editing, setEditing] = useState<HotelRow | 'new' | null>(null)

  async function patchConfig(patch: Partial<typeof config>) {
    const next = { ...config, ...patch }
    setConfig(next)
    const res = await saveSettings({ data: patch })
    if (res.ok) toast.success('Einstellung gespeichert.')
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="animate-rise">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">Einstellungen</h1>
        <p className="mt-1 text-[13.5px] text-fog-400">Hotels der Gruppe und Regeln für den Ticket-Ablauf.</p>
      </header>

      <section>
        <SectionTitle>Ablauf</SectionTitle>
        <Card className="flex flex-col gap-4 p-4">
          <Toggle
            checked={config.requireAfterPhoto}
            onChange={(v) => void patchConfig({ requireAfterPhoto: v })}
            label="Foto nach Reparatur ist Pflicht"
            hint="Ein Ticket kann erst auf „Erledigt“ gesetzt werden, wenn ein Nachher-Foto vorliegt."
          />
          <div className="border-t border-ink-800" />
          <Toggle
            checked={config.notifyUrgent}
            onChange={(v) => void patchConfig({ notifyUrgent: v })}
            label="Sofort-Benachrichtigung bei „Sehr dringend“"
            hint="Technik und Admins erhalten die Meldung unmittelbar in der App."
          />
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Hotel
            </Button>
          }
        >
          Hotels
        </SectionTitle>
        <Card className="divide-y divide-ink-800">
          {hotels.map((hotel) => (
            <button
              key={hotel.id}
              type="button"
              onClick={() => setEditing(hotel)}
              className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left first:rounded-t-[13px] last:rounded-b-[13px] hover:bg-ink-850/60"
            >
              <span
                className={cx(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  hotel.active ? 'bg-brass-500/12 text-brass-300' : 'bg-ink-800 text-fog-500',
                )}
              >
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] text-fog-100">{hotel.name}</p>
                <p className="font-mono text-[11.5px] text-fog-500">
                  {hotel.shortName} · {hotel.slug} · {hotel.ticketCount} Tickets
                </p>
              </div>
              {!hotel.active && <Badge tone="neutral">inaktiv</Badge>}
            </button>
          ))}
        </Card>
        <p className="mt-2 text-[12px] text-fog-500">
          Weitere Hotels lassen sich jederzeit ergänzen – bestehende Tickets bleiben unverändert.
        </p>
      </section>

      {editing && (
        <HotelSheet
          key={editing === 'new' ? 'new' : editing.id}
          hotel={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await router.invalidate()
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function HotelSheet({
  hotel,
  onClose,
  onSaved,
}: {
  hotel: HotelRow | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    name: hotel?.name ?? '',
    shortName: hotel?.shortName ?? '',
    slug: hotel?.slug ?? '',
    sortOrder: String(hotel?.sortOrder ?? 100),
    active: hotel?.active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet open onClose={onClose} title={hotel ? hotel.name : 'Hotel hinzufügen'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const res = await upsertHotel({
              data: {
                id: hotel?.id,
                slug: form.slug.trim().toLowerCase(),
                name: form.name.trim(),
                shortName: form.shortName.trim(),
                sortOrder: Number(form.sortOrder) || 100,
                active: form.active,
              },
            })
            if (!res.ok) {
              setError(res.error ?? 'Speichern fehlgeschlagen.')
              return
            }
            toast.success(hotel ? 'Hotel aktualisiert.' : 'Hotel hinzugefügt.')
            await onSaved()
          } catch {
            setError('Bitte Eingaben prüfen: Kürzel nur Kleinbuchstaben, Zahlen und Bindestriche.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Name" hint="Wie das Hotel in Listen erscheint.">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Hotel Unique Dortmund"
            maxLength={80}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kurzname" hint="Für Filter und Karten.">
            <Input
              value={form.shortName}
              onChange={(e) => setForm({ ...form, shortName: e.target.value })}
              placeholder="Unique"
              maxLength={30}
            />
          </Field>
          <Field label="Kürzel (URL)" hint="klein, ohne Leerzeichen">
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="unique"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
        </div>
        <Field label="Sortierung" hint="Kleinere Zahlen erscheinen zuerst.">
          <Input
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            inputMode="numeric"
          />
        </Field>
        <Toggle
          checked={form.active}
          onChange={(v) => setForm({ ...form, active: v })}
          label="Aktiv"
          hint="Inaktive Hotels stehen bei neuen Meldungen nicht zur Auswahl."
        />
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
