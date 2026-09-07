import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, ShieldX, Smartphone } from 'lucide-react'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Badge, Button, Field, Input } from '../components/ui'
import { acceptInvite, activateAccount, activateDevice, getInvite } from '../server/auth.functions'
import { roleLabel } from '../lib/domain'
import { fmtDateTime } from '../lib/format'

/**
 * Landing page behind a QR code. A QR only ever does one of three things — activate a new
 * account, add a device to an existing one, or (legacy) let someone register themselves.
 * None of them is part of the daily login, which is e-mail/username plus password.
 */
export const Route = createFileRoute('/einladung/$token')({
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: '/' })
  },
  loader: async ({ params }) => getInvite({ data: { token: params.token } }),
  component: InvitePage,
})

function InvitePage() {
  const invite = Route.useLoaderData()
  const router = useRouter()

  if (!invite.valid) {
    return (
      <AuthFrame eyebrow="QR-Code" title="QR-Code nicht mehr gültig" intro={invite.reason}>
        <div className="surface flex items-start gap-3 p-4">
          <ShieldX className="mt-0.5 size-5 shrink-0 text-ember" />
          <p className="text-[13.5px] text-fog-400">
            Bitte den Admin um einen neuen QR-Code. QR-Codes sind zeitlich begrenzt und nur einmal verwendbar — für die
            tägliche Anmeldung wird keiner gebraucht.
          </p>
        </div>
        <Button className="mt-5" block onClick={() => router.navigate({ to: '/login' })}>
          Zur Anmeldung
        </Button>
      </AuthFrame>
    )
  }

  if (invite.purpose === 'device') return <DeviceMode invite={invite} />
  if (invite.purpose === 'activation') return <ActivationMode invite={invite} />
  return <SignupMode invite={invite} />
}

type ValidInvite = Extract<Awaited<ReturnType<typeof getInvite>>, { valid: true }>

function Meta({ invite }: { invite: ValidInvite }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Badge tone="brass">Rolle: {roleLabel(invite.role)}</Badge>
      {invite.hotelName && <Badge>{invite.hotelName}</Badge>}
    </div>
  )
}

/** Employee picks their own password for the account the admin created. */
function ActivationMode({ invite }: { invite: ValidInvite }) {
  const { token } = Route.useParams()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== repeat) {
      setError('Die beiden Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    try {
      const res = await activateAccount({ data: { token, password } })
      if (!res.ok) {
        setError(res.error)
        return
      }
      await router.invalidate()
      router.navigate({ to: '/' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="Erstanmeldung"
      title={invite.personName ? `Hallo ${invite.personName}` : 'Konto aktivieren'}
      intro="Einmal ein eigenes Passwort festlegen — danach reicht E-Mail bzw. Benutzername und Passwort."
      footer={`Gültig bis ${fmtDateTime(invite.expiresAt)}. Dieser QR-Code funktioniert nur ein einziges Mal.`}
    >
      <Meta invite={invite} />

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Neues Passwort" hint="Mindestens 8 Zeichen.">
          <Input
            required
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field label="Passwort wiederholen">
          <Input
            required
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<BadgeCheck className="size-4" />}>
          Konto aktivieren
        </Button>
      </form>
    </AuthFrame>
  )
}

/**
 * Signs an additional device in. The code itself is the credential, so it is redeemed on
 * arrival — after that the device keeps its own session and never needs a code again.
 */
function DeviceMode({ invite }: { invite: ValidInvite }) {
  const { token } = Route.useParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Strict-mode mounts the effect twice; the code may only be redeemed once.
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const res = await activateDevice({ data: { token } })
        if (!res.ok) {
          setError(res.error)
          return
        }
        await router.invalidate()
        router.navigate({ to: '/' })
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [router, token])

  return (
    <AuthFrame
      eyebrow="Neues Gerät"
      title={invite.personName ? `Gerät für ${invite.personName}` : 'Gerät anmelden'}
      intro={error ? undefined : 'Das Gerät wird angemeldet …'}
      footer="Dieses Gerät bleibt angemeldet, bis du dich abmeldest."
    >
      {error ? (
        <>
          <Alert>{error}</Alert>
          <Button className="mt-5" block onClick={() => router.navigate({ to: '/login' })}>
            Zur Anmeldung
          </Button>
        </>
      ) : (
        <div className="surface flex items-start gap-3 p-4">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-brass-400" />
          <p className="text-[13.5px] text-fog-400">
            Einen Moment — im Anschluss steht die App direkt zur Verfügung.
          </p>
        </div>
      )}
    </AuthFrame>
  )
}

/** Legacy role-based QR code: the person creates their own account. */
function SignupMode({ invite }: { invite: ValidInvite }) {
  const { token } = Route.useParams()
  const router = useRouter()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await acceptInvite({ data: { token, ...form } })
      if (!res.ok) {
        setError(res.error)
        return
      }
      await router.invalidate()
      router.navigate({ to: '/' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="Registrierung per QR-Code"
      title="Zugang einrichten"
      intro={invite.label ? `Einladung: ${invite.label}` : 'Bitte die eigenen Daten eintragen.'}
      footer={`Gültig bis ${fmtDateTime(invite.expiresAt)} · noch ${invite.remainingUses} Registrierung${invite.remainingUses === 1 ? '' : 'en'} möglich.`}
    >
      <Meta invite={invite} />

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input required autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Nachname">
            <Input required autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>

        <Field label="E-Mail">
          <Input
            required
            type="email"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={set('email')}
          />
        </Field>

        <Field label="Passwort" hint="Mindestens 8 Zeichen.">
          <Input required type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>

        <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<BadgeCheck className="size-4" />}>
          Registrierung abschließen
        </Button>
      </form>
    </AuthFrame>
  )
}
