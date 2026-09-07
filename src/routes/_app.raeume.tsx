import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DoorClosed, Search, X } from 'lucide-react'
import { z } from 'zod'
import { fetchRoomHistory, fetchRooms, getWorkspace } from '../server/tickets.functions'
import { Badge, Card, EmptyState, Input, SectionTitle, SegmentedControl, cx } from '../components/ui'
import { TicketCard } from '../components/TicketCard'
import { fmtDate, fmtAgo } from '../lib/format'

const searchSchema = z.object({
  hotel: z.string().optional(),
  room: z.string().optional(),
})

type RoomSearch = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_app/raeume')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const workspace = await getWorkspace({ data: undefined })
    const hotel = workspace.hotels.find((h) => h.slug === deps.hotel)
    const [rooms, history] = await Promise.all([
      fetchRooms({ data: { hotelId: hotel?.id ?? null, q: null } }),
      deps.room?.trim()
        ? fetchRoomHistory({ data: { hotelId: hotel?.id ?? null, number: deps.room.trim() } })
        : Promise.resolve([]),
    ])
    return { rooms, history, hotels: workspace.hotels }
  },
  component: RoomsPage,
})

function RoomsPage() {
  const { rooms, history, hotels } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [query, setQuery] = useState(search.room ?? '')
  const dirty = useRef(false)

  const set = (patch: Partial<RoomSearch>) =>
    navigate({
      search: (prev) => {
        const next = { ...prev, ...patch }
        for (const key of Object.keys(next) as Array<keyof RoomSearch>) {
          if (!next[key]) delete next[key]
        }
        return next
      },
      replace: true,
    })

  useEffect(() => {
    if (!dirty.current) setQuery(search.room ?? '')
  }, [search.room])

  useEffect(() => {
    if (!dirty.current) return
    const id = setTimeout(() => {
      dirty.current = false
      set({ room: query.trim() || undefined })
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const filtered = query.trim()
    ? rooms.filter((r) => r.number.toLowerCase().includes(query.trim().toLowerCase()))
    : rooms

  const openInHistory = history.filter((t) => t.status !== 'erledigt').length
  const activeRoom = search.room?.trim()

  return (
    <div className="flex flex-col gap-6 pb-4">
      <header className="animate-rise">
        <p className="eyebrow">Historie</p>
        <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">Räume</h1>
        <p className="mt-1 text-[13.5px] text-fog-400">
          Suche eine Zimmernummer, um alle technischen Meldungen dieses Raums zu sehen – so fallen wiederkehrende
          Probleme auf.
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fog-500" />
        <Input
          value={query}
          onChange={(e) => {
            dirty.current = true
            setQuery(e.target.value)
          }}
          placeholder="Zimmernummer, z. B. 205"
          inputMode="text"
          className="pl-11 pr-10"
          aria-label="Zimmer suchen"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              dirty.current = false
              setQuery('')
              set({ room: undefined })
            }}
            className="tap absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-fog-500 hover:text-fog-200"
            aria-label="Suche löschen"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <SegmentedControl
        value={search.hotel ?? 'alle'}
        onChange={(v) => set({ hotel: v === 'alle' ? undefined : v })}
        options={[
          { value: 'alle', label: 'Alle Hotels' },
          ...hotels.map((h) => ({ value: h.slug, label: h.shortName })),
        ]}
      />

      {/* --------------------------------------------------------- room history */}
      {activeRoom && (
        <section className="animate-fade">
          <SectionTitle>Zimmer {activeRoom}</SectionTitle>
          {history.length === 0 ? (
            <Card className="px-4 py-8 text-center">
              <p className="text-[13.5px] text-fog-400">
                Für „{activeRoom}“ gibt es noch keine Meldungen{search.hotel ? ' in diesem Hotel' : ''}.
              </p>
            </Card>
          ) : (
            <>
              <Card className="mb-3 grid grid-cols-3 divide-x divide-ink-800">
                <Stat value={history.length} label="Meldungen" />
                <Stat value={openInHistory} label="offen" tone={openInHistory > 0 ? 'amber' : undefined} />
                <Stat value={fmtDate(history[0].reportedAt)} label="letzte Meldung" small />
              </Card>
              {history.length >= 3 && (
                <p className="mb-3 text-[12.5px] text-brass-300">
                  {history.length} Meldungen in diesem Raum – möglicherweise ein wiederkehrendes Problem.
                </p>
              )}
              <div className="flex flex-col gap-2.5">
                {history.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ room grid */}
      <section>
        <SectionTitle
          action={
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fog-500">
              {filtered.length} {filtered.length === 1 ? 'Raum' : 'Räume'}
            </span>
          }
        >
          {activeRoom ? 'Weitere Räume' : 'Erfasste Räume'}
        </SectionTitle>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<DoorClosed className="size-6" />}
            title="Noch keine Räume erfasst"
            body="Räume entstehen automatisch, sobald eine Meldung mit Zimmernummer angelegt wird."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  dirty.current = false
                  setQuery(room.number)
                  const slug = hotels.find((h) => h.id === room.hotelId)?.slug
                  set({ room: room.number, hotel: search.hotel ?? slug })
                }}
                className={cx(
                  'surface tap px-3.5 py-3 text-left transition-colors hover:border-ink-600',
                  activeRoom?.toLowerCase() === room.number.toLowerCase() && 'border-brass-500/60 bg-brass-500/[0.07]',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[16px] text-fog-50">{room.number}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fog-500">
                    {room.hotelShort}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {room.openCount > 0 ? (
                    <Badge tone="amber">{room.openCount} offen</Badge>
                  ) : (
                    <span className="font-mono text-[11px] text-fog-500">{room.total}× gemeldet</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-fog-500">
                  {room.lastReportedAt ? fmtAgo(room.lastReportedAt) : 'keine Meldung'}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({
  value,
  label,
  tone,
  small,
}: {
  value: string | number
  label: string
  tone?: 'amber'
  small?: boolean
}) {
  return (
    <div className="px-3 py-3.5 text-center">
      <p
        className={cx(
          'font-display leading-none tabular-nums',
          small ? 'text-[15px]' : 'text-[24px]',
          tone === 'amber' ? 'text-amber-signal' : 'text-fog-50',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] text-fog-500">{label}</p>
    </div>
  )
}
