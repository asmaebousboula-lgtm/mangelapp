import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { AuthFrame } from '../components/AuthFrame'
import { Alert, Button, Field, Input } from '../components/ui'
import { login } from '../server/auth.functions'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: '/' })
    if (context.session.needsBootstrap) throw redirect({ to: '/setup' })
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await login({ data: { identifier, password } })
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
      eyebrow="Anmeldung"
      title="Willkommen zurück"
      intro="Mit dem persönlichen Mitarbeiterkonto anmelden."
      footer="Angemeldet bleibst du auf diesem Gerät, bis du dich abmeldest. Noch kein Konto? Der Admin legt es im Bereich „Mitarbeiter“ an."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field label="E-Mail oder Benutzername" htmlFor="identifier" hint="Beides funktioniert – je nachdem, was der Admin hinterlegt hat.">
          <Input
            id="identifier"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@hdhotels.de"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Field>

        <Field label="Passwort" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<ArrowRight className="size-4" />}>
          Anmelden
        </Button>
      </form>
    </AuthFrame>
  )
}
