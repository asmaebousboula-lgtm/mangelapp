import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import {
  DoorOpen,
  Ellipsis,
  Gauge,
  KeyRound,
  LogOut,
  MessageCircleMore,
  Plus,
  ScrollText,
  Settings2,
  Users,
} from 'lucide-react'
import { APP_NAME, APP_SUBTITLE, loginName, roleLabel } from '../lib/domain'
import { fullName, initials } from '../lib/format'
import { Alert, Button, Field, Input, Sheet, cx, toast } from './ui'
import { AuthFrame } from './AuthFrame'
import { NotificationBell } from './NotificationBell'
import { changeOwnPassword, logout } from '../server/auth.functions'
import type { SessionUser } from '../server/auth.server'

type NavItem = { to: string; label: string; icon: typeof Gauge; adminOnly?: boolean }

const PRIMARY_NAV: Array<NavItem> = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/tickets', label: 'Tickets', icon: ScrollText },
  { to: '/raeume', label: 'Räume', icon: DoorOpen },
  { to: '/team', label: 'Mitarbeiter', icon: Users },
]

const ADMIN_NAV: Array<NavItem> = [
  { to: '/admin/whatsapp', label: 'WhatsApp Import', icon: MessageCircleMore, adminOnly: true },
  { to: '/admin/einstellungen', label: 'Einstellungen', icon: Settings2, adminOnly: true },
]

function Brandmark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'grid size-9 shrink-0 place-items-center rounded-[10px] border border-brass-700 bg-gradient-to-br from-brass-400 to-brass-500 font-display text-[13px] font-extrabold text-ink-950',
        className,
      )}
      aria-hidden
    >
      HD
    </span>
  )
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  // Accounts that were handed a password by an admin have to replace it before they can
  // work — the app itself stays out of reach until they do.
  if (user.mustChangePassword) return <PasswordGate user={user} />
  return <Shell user={user}>{children}</Shell>
}

function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isAdmin = user.role === 'admin'
  const nav = [...PRIMARY_NAV, ...(isAdmin ? ADMIN_NAV : [])]

  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

  return (
    <div className="relative z-10 min-h-dvh lg:flex">
      {/* ---------------------------------------------------- desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-ink-800 bg-ink-900/60 px-4 py-6 backdrop-blur lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <Brandmark />
          <span className="leading-none">
            <span className="block font-display text-[15px] font-extrabold tracking-tight text-fog-50">{APP_NAME}</span>
            <span className="mt-0.5 block font-mono text-[10px] tracking-[0.24em] text-brass-400">{APP_SUBTITLE}</span>
          </span>
        </Link>

        <Link to="/tickets/neu" className="mb-6">
          <Button variant="primary" size="md" block icon={<Plus className="size-4" />}>
            Neue Meldung
          </Button>
        </Link>

        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cx(
                'tap flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[14px]',
                active(item.to)
                  ? 'bg-ink-800 font-medium text-fog-50 shadow-[inset_2px_0_0_var(--color-brass-400)]'
                  : 'text-fog-400 hover:bg-ink-850 hover:text-fog-100',
              )}
            >
              <item.icon className={cx('size-[18px]', active(item.to) && 'text-brass-300')} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="tap flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-left hover:border-ink-600"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brass-500/20 font-mono text-[12px] font-bold text-brass-300">
              {initials(user.firstName, user.lastName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-fog-100">{fullName(user)}</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-fog-500">
                {roleLabel(user.role)}
              </span>
            </span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ------------------------------------------------------- mobile topbar */}
        <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 lg:h-16 lg:px-8">
            <Link to="/" className="flex items-center gap-2.5 lg:hidden">
              <Brandmark className="size-8 rounded-lg text-[12px]" />
              <span className="leading-none">
                <span className="block font-display text-[13.5px] font-extrabold tracking-tight text-fog-50">
                  {APP_NAME}
                </span>
                <span className="mt-[3px] block font-mono text-[9px] tracking-[0.22em] text-brass-400">
                  {APP_SUBTITLE}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <NotificationBell canReceive={user.role === 'technik' || user.role === 'admin'} />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Menü"
                className="tap grid size-10 place-items-center rounded-xl border border-ink-700 bg-ink-900 font-mono text-[12px] font-bold text-brass-300 lg:hidden"
              >
                {initials(user.firstName, user.lastName)}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[var(--shell-pad-bottom)] pt-4 lg:px-8 lg:pb-10 lg:pt-6">
          {children}
        </main>

        {/* --------------------------------------------------- mobile bottom bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-5 items-end px-2 pt-1.5">
            <TabLink to="/" label="Start" icon={Gauge} active={active('/')} />
            <TabLink to="/tickets" label="Tickets" icon={ScrollText} active={pathname === '/tickets'} />
            <Link
              to="/tickets/neu"
              aria-label="Neue Meldung"
              className="tap mx-auto -mt-4 grid size-14 place-items-center rounded-2xl border border-brass-300 bg-gradient-to-b from-brass-300 to-brass-500 text-ink-950 shadow-[0_10px_28px_-10px_rgba(184,150,79,0.85)]"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </Link>
            <TabLink to="/raeume" label="Räume" icon={DoorOpen} active={active('/raeume')} />
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="tap flex flex-col items-center gap-1 py-2 text-fog-500"
            >
              <Ellipsis className="size-[21px]" />
              <span className="text-[10.5px]">Mehr</span>
            </button>
          </div>
        </nav>
      </div>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        user={user}
        onPassword={() => {
          setMoreOpen(false)
          setPwOpen(true)
        }}
      />
      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

function TabLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string
  label: string
  icon: typeof Gauge
  active: boolean
}) {
  return (
    <Link
      to={to}
      className={cx('tap flex flex-col items-center gap-1 py-2', active ? 'text-brass-300' : 'text-fog-500')}
    >
      <Icon className="size-[21px]" />
      <span className="text-[10.5px]">{label}</span>
    </Link>
  )
}

function MoreSheet({
  open,
  onClose,
  user,
  onPassword,
}: {
  open: boolean
  onClose: () => void
  user: SessionUser
  onPassword: () => void
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const isAdmin = user.role === 'admin'

  const links = [
    { to: '/team', label: 'Mitarbeiter', icon: Users },
    ...(isAdmin
      ? [
          { to: '/admin/whatsapp', label: 'WhatsApp Import', icon: MessageCircleMore },
          { to: '/admin/einstellungen', label: 'Einstellungen', icon: Settings2 },
        ]
      : []),
  ]

  return (
    <Sheet open={open} onClose={onClose} title={fullName(user)}>
      <p className="eyebrow mb-4">
        {roleLabel(user.role)} · {loginName(user)}
      </p>

      <div className="flex flex-col gap-1.5">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            onClick={onClose}
            className="tap flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-[14px] text-fog-100 hover:border-ink-600"
          >
            <l.icon className="size-[18px] text-brass-300" />
            {l.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={onPassword}
          className="tap flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-left text-[14px] text-fog-100 hover:border-ink-600"
        >
          <KeyRound className="size-[18px] text-brass-300" />
          Passwort ändern
        </button>
      </div>

      <Button
        variant="danger"
        block
        className="mt-5"
        busy={busy}
        icon={<LogOut className="size-4" />}
        onClick={async () => {
          setBusy(true)
          await logout({ data: undefined })
          await router.invalidate()
          navigate({ to: '/login' })
        }}
      >
        Abmelden
      </Button>
    </Sheet>
  )
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      const res = await changeOwnPassword({ data: { current, next } })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success('Passwort geändert.')
      setCurrent('')
      setNext('')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Passwort ändern"
      footer={
        <Button variant="primary" block busy={busy} onClick={() => void submit()}>
          Speichern
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Aktuelles Passwort">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Neues Passwort" hint="Mindestens 8 Zeichen.">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Sheet>
  )
}

/**
 * Blocking first-login step. Deliberately not a Sheet: there is nothing to dismiss it to,
 * the only ways out are a new password or signing out again.
 */
function PasswordGate({ user }: { user: SessionUser }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (next !== repeat) {
      setError('Die beiden Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    try {
      const res = await changeOwnPassword({ data: { current, next } })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success('Passwort gesetzt.')
      await router.invalidate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="Erstanmeldung"
      title={`Hallo ${fullName(user)}`}
      intro="Bitte das vom Admin vergebene Passwort einmal durch ein eigenes ersetzen."
      footer="Danach bleibst du auf diesem Gerät angemeldet, bis du dich abmeldest. Andere Geräte werden abgemeldet."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Passwort vom Admin">
          <Input
            required
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>

        <Field label="Neues Passwort" hint="Mindestens 8 Zeichen.">
          <Input
            required
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>

        <Field label="Neues Passwort wiederholen">
          <Input
            required
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block busy={busy} icon={<KeyRound className="size-4" />}>
          Passwort speichern
        </Button>

        <Button
          type="button"
          variant="quiet"
          block
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            await logout({ data: undefined })
            await router.invalidate()
            navigate({ to: '/login' })
          }}
        >
          Abmelden
        </Button>
      </form>
    </AuthFrame>
  )
}
