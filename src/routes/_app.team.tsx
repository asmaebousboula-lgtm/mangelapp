import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  Copy,
  KeyRound,
  LogOut,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react'
import {
  createStaff,
  createStaffQr,
  deleteStaff,
  listInvites,
  listStaff,
  resetStaffPassword,
  revokeInvite,
  revokeStaffSessions,
  updateStaff,
} from '../server/admin.functions'
import { getWorkspace } from '../server/tickets.functions'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Select,
  Sheet,
  Toggle,
  cx,
  toast,
} from '../components/ui'
import {
  ROLES,
  invitePurposeLabel,
  isAdmin,
  loginName,
  normalizeStatus,
  roleLabel,
  userStatusLabel,
  type Role,
} from '../lib/domain'
import { fmtDate, fmtDateTime, initials } from '../lib/format'

export const Route = createFileRoute('/_app/team')({
  loader: async ({ context }) => {
    const workspace = await getWorkspace({ data: undefined })
    if (!isAdmin(context.user.role)) {
      return { admin: false as const, hotels: workspace.hotels, directory: workspace.staff }
    }
    const [staff, invites] = await Promise.all([listStaff({ data: undefined }), listInvites({ data: undefined })])
    return { admin: true as const, hotels: workspace.hotels, directory: workspace.staff, staff, invites }
  },
  component: TeamPage,
})

type StaffRow = Awaited<ReturnType<typeof listStaff>>[number]
type QrResult = {
  purpose: string
  personName: string
  url: string
  code: string
  qrSvg: string
  expiresAt: string | Date
}

function TeamPage() {
  const data = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [qr, setQr] = useState<QrResult | null>(null)

  if (!data.admin) {
    return (
      <div className="flex flex-col gap-6 pb-4">
        <header className="animate-rise">
          <p className="eyebrow">Team</p>
          <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">Mitarbeiter</h1>
          <p className="mt-1 text-[13.5px] text-fog-400">
            Wer gerade wie viele Meldungen in Bearbeitung hat. Konten legt ein Admin an.
          </p>
        </header>
        <Card className="divide-y divide-ink-800">
          {data.directory.map((person) => (
            <div key={person.id} className="flex items-center gap-3 px-4 py-3.5">
              <Avatar first={person.firstName} last={person.lastName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] text-fog-100">
                  {person.firstName} {person.lastName}
                </p>
                <p className="text-[12px] text-fog-500">{roleLabel(person.role)}</p>
              </div>
              {person.openAssigned > 0 && <Badge tone="steel">{person.openAssigned} offen</Badge>}
            </div>
          ))}
        </Card>
      </div>
    )
  }

  const invites = data.invites
  const accounts = data.staff.filter((s) => normalizeStatus(s.status) !== 'deleted')
  const archived = data.staff.filter((s) => normalizeStatus(s.status) === 'deleted')
  const activeCount = accounts.filter((s) => normalizeStatus(s.status) === 'active').length
  const openQr = invites.filter((i) => i.state === 'active')
  const current = data.staff.find((s) => s.id === editing) ?? null

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Verwaltung</p>
          <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">Mitarbeiter</h1>
          <p className="mt-1 text-[13.5px] text-fog-400">
            {activeCount} aktive Konten · {openQr.length} offene QR-Codes
          </p>
        </div>
        <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
          Konto anlegen
        </Button>
      </header>

      <Card className="flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brass-400" />
        <p className="text-[13px] leading-relaxed text-fog-400">
          Jeder Mitarbeiter hat ein dauerhaftes eigenes Konto und meldet sich mit E-Mail oder Benutzername und Passwort
          an. Ein QR-Code wird nur für die Erstanmeldung oder ein zusätzliches Gerät gebraucht — nicht für die tägliche
          Anmeldung.
        </p>
      </Card>

      <section>
        <SectionTitle>Konten</SectionTitle>
        <Card className="divide-y divide-ink-800">
          {accounts.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => setEditing(person.id)}
              className="tap flex w-full items-center gap-3 px-4 py-3.5 text-left first:rounded-t-[13px] last:rounded-b-[13px] hover:bg-ink-850/60"
            >
              <Avatar
                first={person.firstName}
                last={person.lastName}
                muted={normalizeStatus(person.status) !== 'active'}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[14.5px] text-fog-100">
                  {person.firstName} {person.lastName}
                  {person.id === user.id && <span className="font-mono text-[10px] text-fog-500">(du)</span>}
                </p>
                <p className="truncate text-[12px] text-fog-500">
                  {loginName(person)}
                  {person.activeDevices > 0 && ` · ${person.activeDevices} Gerät${person.activeDevices === 1 ? '' : 'e'}`}
                  {person.mustChangePassword && ' · Passwortwechsel offen'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={person.role === 'admin' ? 'brass' : person.role === 'technik' ? 'steel' : 'neutral'}>
                  {roleLabel(person.role)}
                </Badge>
                {normalizeStatus(person.status) !== 'active' ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ember">deaktiviert</span>
                ) : (
                  <span className="font-mono text-[10px] text-fog-500">{person.hotelName ?? 'alle Hotels'}</span>
                )}
              </div>
            </button>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>QR-Codes</SectionTitle>
        {invites.length === 0 ? (
          <EmptyState
            icon={<QrCode className="size-6" />}
            title="Kein QR-Code erstellt"
            body="QR-Codes werden pro Konto erstellt — für die Erstanmeldung oder ein weiteres Gerät. Konto öffnen und dort erzeugen."
          />
        ) : (
          <Card className="divide-y divide-ink-800">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] text-fog-100">
                    {invite.personName || invite.label || roleLabel(invite.role)}
                    <span className="font-mono text-[11px] text-fog-500">{invite.code}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-fog-500">
                    {invitePurposeLabel(invite.purpose)}
                    {invite.hotelName ? ` · ${invite.hotelName}` : ''} · {invite.usedCount}/{invite.maxUses} genutzt ·
                    gültig bis {fmtDateTime(invite.expiresAt)}
                  </p>
                </div>
                <Badge
                  tone={
                    invite.state === 'active'
                      ? 'moss'
                      : invite.state === 'used'
                        ? 'neutral'
                        : invite.state === 'expired'
                          ? 'amber'
                          : 'ember'
                  }
                >
                  {inviteStateLabel(invite.state)}
                </Badge>
                {invite.state === 'active' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await revokeInvite({ data: { id: invite.id } })
                      await router.invalidate()
                      toast.success('QR-Code widerrufen.')
                    }}
                    className="tap grid size-8 shrink-0 place-items-center rounded-lg text-fog-500 hover:text-ember"
                    aria-label="QR-Code widerrufen"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {archived.length > 0 && (
        <section>
          <SectionTitle>Gelöschte Konten</SectionTitle>
          <Card className="divide-y divide-ink-800">
            {archived.map((person) => (
              <div key={person.id} className="flex items-center gap-3 px-4 py-3.5">
                <Avatar first={person.firstName} last={person.lastName} muted />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] text-fog-400">
                    {person.firstName} {person.lastName}
                  </p>
                  <p className="text-[12px] text-fog-500">
                    {person.createdTickets} Meldungen bleiben dieser Person zugeordnet
                  </p>
                </div>
                <Badge>{userStatusLabel(person.status)}</Badge>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-[12px] text-fog-500">
            Anmeldung ist unmöglich, der Name bleibt nur erhalten, damit Meldungen, Fotos und Kommentare weiter
            zugeordnet sind.
          </p>
        </section>
      )}

      <CreateStaffSheet
        open={createOpen}
        hotels={data.hotels}
        onClose={() => setCreateOpen(false)}
        onCreated={async (id) => {
          setCreateOpen(false)
          await router.invalidate()
          setEditing(id)
        }}
      />

      {current && (
        <StaffSheet
          key={current.id}
          person={current}
          hotels={data.hotels}
          isSelf={current.id === user.id}
          onClose={() => setEditing(null)}
          onQr={setQr}
          onChanged={() => router.invalidate()}
          onClosed={async () => {
            await router.invalidate()
            setEditing(null)
          }}
        />
      )}

      {qr && <QrSheet result={qr} onClose={() => setQr(null)} />}
    </div>
  )
}

const inviteStateLabel = (s: string) =>
  ({ active: 'offen', used: 'eingelöst', expired: 'abgelaufen', revoked: 'widerrufen' })[s] ?? s

function Avatar({ first, last, muted }: { first: string; last: string; muted?: boolean }) {
  return (
    <span
      className={cx(
        'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold',
        muted ? 'bg-ink-800 text-fog-500' : 'bg-brass-500/15 text-brass-300',
      )}
    >
      {initials(first, last)}
    </span>
  )
}

/* ------------------------------------------------------------- new account */

/** Random but readable, so the admin can dictate it over the phone if needed. */
function suggestPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function CreateStaffSheet({
  open,
  hotels,
  onClose,
  onCreated,
}: {
  open: boolean
  hotels: Array<{ id: number; name: string; shortName: string }>
  onClose: () => void
  onCreated: (id: number) => Promise<void>
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', username: '', phone: '' })
  const [role, setRole] = useState<Role>('rezeption')
  const [hotelId, setHotelId] = useState('')
  const [password, setPassword] = useState(suggestPassword)
  const [mustChange, setMustChange] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <Sheet open={open} onClose={onClose} title="Konto anlegen">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          if (!form.email.trim() && !form.username.trim()) {
            setError('Bitte eine E-Mail-Adresse oder einen Benutzernamen angeben.')
            return
          }
          setBusy(true)
          try {
            const res = await createStaff({
              data: {
                firstName: form.firstName,
                lastName: form.lastName,
                email: form.email.trim() || null,
                username: form.username.trim() || null,
                phone: form.phone.trim() || null,
                password,
                role,
                hotelId: hotelId ? Number(hotelId) : null,
                mustChangePassword: mustChange,
              },
            })
            if (!res.ok) {
              setError(res.error)
              return
            }
            toast.success('Konto angelegt.')
            await onCreated(res.id)
          } catch {
            setError('Konto konnte nicht angelegt werden.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input required value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Nachname">
            <Input required value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>

        <Field label="E-Mail" hint="Optional, wenn ein Benutzername vergeben wird.">
          <Input type="email" inputMode="email" autoComplete="off" value={form.email} onChange={set('email')} />
        </Field>

        <Field label="Benutzername" hint="Für Kollegen ohne Firmen-E-Mail, z. B. „m.mustermann“.">
          <Input autoCapitalize="none" spellCheck={false} autoComplete="off" value={form.username} onChange={set('username')} />
        </Field>

        <Field label="Telefon" hint="Optional.">
          <Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />
        </Field>

        <Field label="Rolle" hint="Bestimmt, was die Person in der App sehen und tun darf.">
          <div className="flex flex-col gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={cx(
                  'tap rounded-xl border px-3.5 py-3 text-left transition-colors',
                  role === r.value
                    ? 'border-brass-500/70 bg-brass-500/12'
                    : 'border-ink-700 bg-ink-850 hover:border-ink-600',
                )}
              >
                <span className="flex items-center gap-2">
                  {r.value === 'admin' && <ShieldCheck className="size-4 text-brass-300" />}
                  <span
                    className={cx('font-display text-[15px]', role === r.value ? 'text-brass-300' : 'text-fog-100')}
                  >
                    {r.label}
                  </span>
                </span>
                <span className="mt-0.5 block text-[12px] text-fog-500">{r.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Hotel" hint="Optional – nur als Zuordnung, der Zugriff bleibt gruppenweit.">
          <Select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            <option value="">Keine Zuordnung</option>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Startpasswort" hint="Mindestens 8 Zeichen. Weitergeben oder direkt einen QR-Code erzeugen.">
          <div className="flex gap-2">
            <Input
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <Button type="button" variant="secondary" onClick={() => setPassword(suggestPassword())}>
              Neu
            </Button>
          </div>
        </Field>

        <Toggle
          checked={mustChange}
          onChange={setMustChange}
          label="Passwortwechsel verlangen"
          hint="Die Person legt bei der ersten Anmeldung ein eigenes Passwort fest."
        />

        <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<UserPlus className="size-4" />}>
          Konto anlegen
        </Button>
      </form>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ QR code */

function QrSheet({ result, onClose }: { result: QrResult; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={`${invitePurposeLabel(result.purpose)} · ${result.personName}`}>
      <div className="flex flex-col gap-4">
        <div
          className="mx-auto w-full max-w-[260px] rounded-2xl bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: result.qrSvg }}
        />
        <div className="text-center">
          <p className="text-[13.5px] text-fog-300">
            {result.purpose === 'device'
              ? 'Auf dem neuen Gerät scannen — es wird sofort angemeldet und bleibt es.'
              : 'Scannen lassen: die Person legt ihr eigenes Passwort fest und ist danach angemeldet.'}
          </p>
          <p className="mt-1 font-mono text-[11px] text-fog-500">
            Code {result.code} · gültig bis {fmtDateTime(result.expiresAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.url)
              toast.success('Link kopiert.')
            } catch {
              toast.error('Kopieren nicht möglich.')
            }
          }}
          className="tap flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-left"
        >
          <Copy className="size-4 shrink-0 text-fog-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fog-300">{result.url}</span>
        </button>
        <p className="text-[12px] text-fog-500">
          Einmalig verwendbar und zeitlich begrenzt. Für die tägliche Anmeldung wird kein QR-Code gebraucht.
        </p>
        <Button variant="primary" block onClick={onClose}>
          Fertig
        </Button>
      </div>
    </Sheet>
  )
}

/* --------------------------------------------------------- staff management */

function StaffSheet({
  person,
  hotels,
  isSelf,
  onClose,
  onQr,
  onChanged,
  onClosed,
}: {
  person: StaffRow
  hotels: Array<{ id: number; name: string }>
  isSelf: boolean
  onClose: () => void
  onQr: (r: QrResult) => void
  onChanged: () => void
  onClosed: () => Promise<void>
}) {
  const [form, setForm] = useState({
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email ?? '',
    username: person.username ?? '',
    phone: person.phone ?? '',
  })
  const [role, setRole] = useState(person.role)
  const [status, setStatus] = useState<'active' | 'inactive'>(
    normalizeStatus(person.status) === 'active' ? 'active' : 'inactive',
  )
  const [hotelId, setHotelId] = useState(person.hotelId ? String(person.hotelId) : '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function qr(purpose: 'activation' | 'device') {
    setBusy(purpose)
    setError(null)
    try {
      const res = await createStaffQr({ data: { userId: person.id, purpose, validHours: 48 } })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onChanged()
      onQr(res)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open onClose={onClose} title={`${person.firstName} ${person.lastName}`}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 divide-x divide-ink-800 rounded-xl border border-ink-800 bg-ink-900/60">
          <MiniStat value={person.createdTickets} label="gemeldet" />
          <MiniStat value={person.activeDevices} label="angemeldete Geräte" />
          <MiniStat value={person.lastLoginAt ? fmtDate(person.lastLoginAt) : '–'} label="letzter Login" small />
        </div>

        <p className="text-[12.5px] text-fog-500">
          Anmeldung als {loginName(person)} · Konto seit {fmtDate(person.createdAt)}
          {person.mustChangePassword && ' · Passwortwechsel steht noch aus'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Nachname">
            <Input value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>

        <Field label="E-Mail">
          <Input type="email" inputMode="email" autoComplete="off" value={form.email} onChange={set('email')} />
        </Field>

        <Field label="Benutzername" hint="E-Mail oder Benutzername – eines von beiden muss gesetzt sein.">
          <Input autoCapitalize="none" spellCheck={false} autoComplete="off" value={form.username} onChange={set('username')} />
        </Field>

        <Field label="Telefon">
          <Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />
        </Field>

        <Field label="Rolle">
          <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Hotel">
          <Select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            <option value="">Keine Zuordnung</option>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Status"
          hint={
            isSelf
              ? 'Das eigene Konto kann nicht deaktiviert werden.'
              : 'Deaktivieren sperrt die Anmeldung und meldet alle Geräte ab. Meldungen bleiben zugeordnet.'
          }
        >
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            disabled={isSelf}
          >
            <option value="active">Aktiv</option>
            <option value="inactive">Deaktiviert</option>
          </Select>
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <Button
          variant="primary"
          block
          busy={busy === 'save'}
          onClick={async () => {
            setBusy('save')
            setError(null)
            try {
              const res = await updateStaff({
                data: {
                  id: person.id,
                  firstName: form.firstName,
                  lastName: form.lastName,
                  email: form.email.trim() || null,
                  username: form.username.trim() || null,
                  phone: form.phone.trim() || null,
                  role: role as Role,
                  status,
                  hotelId: hotelId ? Number(hotelId) : null,
                },
              })
              if (!res.ok) {
                setError(res.error ?? 'Speichern fehlgeschlagen.')
                return
              }
              toast.success('Konto aktualisiert.')
              await onClosed()
            } finally {
              setBusy(null)
            }
          }}
        >
          Speichern
        </Button>

        <div className="flex flex-col gap-2 border-t border-ink-800 pt-5">
          <p className="text-[13px] text-fog-300">QR-Code erzeugen</p>
          <p className="text-[12px] text-fog-500">
            Nur für die Einrichtung: Erstanmeldung ohne bekanntes Passwort oder ein zusätzliches Gerät. Jeder Code gilt
            48 Stunden und funktioniert genau einmal.
          </p>
          <div className="mt-1 flex gap-2">
            <Button
              variant="secondary"
              block
              icon={<QrCode className="size-4" />}
              busy={busy === 'activation'}
              disabled={normalizeStatus(person.status) !== 'active'}
              onClick={() => qr('activation')}
            >
              Erstanmeldung
            </Button>
            <Button
              variant="secondary"
              block
              icon={<Smartphone className="size-4" />}
              busy={busy === 'device'}
              disabled={normalizeStatus(person.status) !== 'active'}
              onClick={() => qr('device')}
            >
              Neues Gerät
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-ink-800 pt-5">
          <Field label="Neues Passwort setzen" hint="Mindestens 8 Zeichen. Alle Geräte werden dabei abgemeldet.">
            <div className="flex gap-2">
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort vergeben"
                autoComplete="off"
              />
              <Button type="button" variant="secondary" onClick={() => setPassword(suggestPassword())}>
                Neu
              </Button>
            </div>
          </Field>
          <Button
            variant="secondary"
            block
            icon={<KeyRound className="size-4" />}
            busy={busy === 'pw'}
            disabled={password.length < 8}
            onClick={async () => {
              setBusy('pw')
              setError(null)
              try {
                await resetStaffPassword({ data: { id: person.id, password, mustChangePassword: true } })
                setPassword('')
                onChanged()
                toast.success('Passwort gesetzt, alle Geräte abgemeldet.')
              } finally {
                setBusy(null)
              }
            }}
          >
            Passwort übernehmen
          </Button>

          {person.activeDevices > 0 && (
            <Button
              variant="quiet"
              icon={<LogOut className="size-4" />}
              busy={busy === 'sessions'}
              onClick={async () => {
                setBusy('sessions')
                try {
                  await revokeStaffSessions({ data: { id: person.id } })
                  onChanged()
                  toast.success('Alle Geräte abgemeldet.')
                } finally {
                  setBusy(null)
                }
              }}
            >
              Alle Geräte abmelden ({person.activeDevices})
            </Button>
          )}
        </div>

        {!isSelf && (
          <div className="border-t border-ink-800 pt-5">
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-fog-300">
                  Konto löschen? Die Anmeldung wird zerstört. Meldungen, Fotos und Kommentare bleiben dieser Person
                  zugeordnet — das Konto erscheint dann unter „Gelöschte Konten“.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" block onClick={() => setConfirmDelete(false)}>
                    Abbrechen
                  </Button>
                  <Button
                    variant="danger"
                    block
                    busy={busy === 'del'}
                    onClick={async () => {
                      setBusy('del')
                      setError(null)
                      try {
                        const res = await deleteStaff({ data: { id: person.id } })
                        if (!res.ok) {
                          setError(res.error ?? 'Löschen fehlgeschlagen.')
                          setConfirmDelete(false)
                          return
                        }
                        toast.success(
                          res.mode === 'removed' ? 'Konto entfernt.' : 'Konto gelöscht, Verlauf bleibt zugeordnet.',
                        )
                        await onClosed()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="quiet" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                Konto löschen
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function MiniStat({ value, label, small }: { value: string | number; label: string; small?: boolean }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className={cx('font-display text-fog-50 tabular-nums', small ? 'text-[13px]' : 'text-[19px]')}>{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-fog-500">{label}</p>
    </div>
  )
}
