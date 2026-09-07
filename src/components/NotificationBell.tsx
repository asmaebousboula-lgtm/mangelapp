import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, BellRing } from 'lucide-react'
import { fetchNotifications, markNotificationsRead } from '../server/tickets.functions'
import { Button, Sheet, cx } from './ui'
import { fmtDateTime } from '../lib/format'

type Item = {
  id: number
  ticketId: number | null
  type: string
  title: string
  body: string
  readAt: string | Date | null
  createdAt: string | Date
}

const POLL_MS = 45_000

/**
 * In-app alerts for "sehr dringend" reports and assignments. Polls while the
 * tab is visible and mirrors new alerts to the OS notification centre when the
 * user granted permission — the groundwork for real web push later on.
 */
export function NotificationBell({ canReceive }: { canReceive: boolean }) {
  const [items, setItems] = useState<Array<Item>>([])
  const [open, setOpen] = useState(false)
  const seen = useRef<Set<number>>(new Set())
  const navigate = useNavigate()

  const load = useCallback(
    async (announce: boolean) => {
      try {
        const res = await fetchNotifications({ data: undefined })
        setItems(res.items as Array<Item>)
        if (announce && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          for (const item of res.items) {
            if (!item.readAt && !seen.current.has(item.id)) {
              new Notification(item.title, { body: item.body, tag: `hdt-${item.id}` })
            }
          }
        }
        res.items.forEach((i) => seen.current.add(i.id))
      } catch {
        /* offline or signed out — the next tick retries */
      }
    },
    [],
  )

  useEffect(() => {
    if (!canReceive) return
    void load(false)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [canReceive, load])

  const unread = items.filter((i) => !i.readAt).length

  async function openPanel() {
    setOpen(true)
    if (unread) {
      await markNotificationsRead({ data: {} })
      setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        aria-label={unread ? `${unread} neue Benachrichtigungen` : 'Benachrichtigungen'}
        className="tap relative grid size-10 place-items-center rounded-xl border border-ink-700 bg-ink-900 text-fog-300 hover:text-fog-50"
      >
        {unread ? <BellRing className="size-[18px] text-brass-300" /> : <Bell className="size-[18px]" />}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-ember px-1 font-mono text-[10px] font-bold text-ink-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Benachrichtigungen">
        {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <div className="mb-4 rounded-xl border border-ink-700 bg-ink-850 p-3.5">
            <p className="text-[13.5px] text-fog-300">
              Systemhinweise für sehr dringende Meldungen direkt auf diesem Gerät erhalten.
            </p>
            <Button
              size="sm"
              variant="primary"
              className="mt-3"
              onClick={() => void Notification.requestPermission()}
            >
              Hinweise erlauben
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-8 text-center text-[13.5px] text-fog-500">Keine Benachrichtigungen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!item.ticketId}
                  onClick={() => {
                    setOpen(false)
                    if (item.ticketId) navigate({ to: '/tickets/$ticketId', params: { ticketId: String(item.ticketId) } })
                  }}
                  className={cx(
                    'tap w-full rounded-xl border px-3.5 py-3 text-left',
                    item.readAt ? 'border-ink-700 bg-ink-900' : 'border-brass-500/45 bg-brass-500/10',
                  )}
                >
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-brass-300">{item.title}</p>
                  <p className="mt-1 text-[13.5px] text-fog-200">{item.body}</p>
                  <p className="mt-1 text-[11.5px] text-fog-500">{fmtDateTime(item.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  )
}
