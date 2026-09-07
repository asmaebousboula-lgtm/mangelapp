import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Field, Input } from '../components/ui'
import { bootstrapAdmin } from '../server/auth.functions'

/**
 * One-time first-run page. It disappears the moment the first account exists,
 * so there is never an open registration route.
 */
export const Route = createFileRoute('/setup')({
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: '/' })
    if (!context.session.needsBootstrap) throw redirect({ to: '/login' })
  },
  component: SetupPage,
})

function SetupPage() {
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
      const res = await bootstrapAdmin({ data: form })
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
      eyebrow="Erste Einrichtung"
      title="Admin-Konto anlegen"
      intro="Dieses Konto verwaltet Häuser, Mitarbeiter und Einladungen. Danach ist eine Registrierung nur noch per QR-Einladung möglich."
    >
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
          <Input required type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>

        <Field label="Passwort" hint="Mindestens 8 Zeichen.">
          <Input required type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>

        <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<ShieldCheck className="size-4" />}>
          Einrichtung abschließen
        </Button>
      </form>
    </AuthFrame>
  )
}
