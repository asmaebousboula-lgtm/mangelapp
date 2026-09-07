import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'

/** Everything below this pathless layout requires a signed-in staff account. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) {
      throw redirect({ to: context.session.needsBootstrap ? '/setup' : '/login' })
    }
    return { user: context.session.user }
  },
  component: AppLayout,
})

function AppLayout() {
  const { user } = Route.useRouteContext()
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  )
}
