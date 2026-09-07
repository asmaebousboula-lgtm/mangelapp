import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowUpRight, CircleDot, Clock4, Flame, ScanSearch, TriangleAlert } from 'lucide-react'
import { fetchDashboard } from '../server/tickets.functions'
import { Badge, Button, Card, EmptyState, SectionTitle, cx } from '../components/ui'
import { TicketCard } from '../components/TicketCard'
import { areaLabel } from '../lib/domain'
import { fmtDay } from '../lib/format'

export const Route = createFileRoute('/_app/')({
  loader: async () => fetchDashboard({ data: undefined }),
  component: DashboardPage,
})

const TILES = [
  { key: 'open', label: 'Offene Meldungen', icon: CircleDot, tone: 'amber' },
  { key: 'inProgress', label: 'In Bearbeitung', icon: Clock4, tone: 'steel' },
  { key: 'doneToday', label: 'Heute erledigt', icon: ScanSearch, tone: 'moss' },
  { key: 'critical', label: 'Sehr dringend', icon: Flame, tone: 'ember' },
] as const

const RULE: Record<string, string> = {
  amber: 'bg-amber-signal',
  steel: 'bg-steel-signal',
  moss: 'bg-moss',
  ember: 'bg-ember',
}

const TEXT: Record<string, string> = {
  amber: 'text-amber-signal',
  steel: 'text-steel-signal',
  moss: 'text-moss',
  ember: 'text-ember',
}

function DashboardPage() {
  const { totals, perHotel, perArea, topRooms, recent } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const maxHotelOpen = Math.max(1, ...perHotel.map((h) => h.open + h.inProgress))
  // Berlin-local calendar day, so "heute erledigt" links match the tile count.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })

  return (
    <div className="flex flex-col gap-8 pb-4">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{fmtDay(new Date())}</p>
          <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50 sm:text-[30px]">
            Hallo {user.firstName}
          </h1>
          <p className="mt-1 text-[13.5px] text-fog-400">
            {totals.newToday} neue Meldung{totals.newToday === 1 ? '' : 'en'} heute · {totals.total} Tickets insgesamt
          </p>
        </div>
        <Link to="/tickets" className="hidden sm:block">
          <Button variant="quiet" size="sm" icon={<ArrowUpRight className="size-3.5" />}>
            Alle Tickets
          </Button>
        </Link>
      </header>

      {/* ------------------------------------------------------------- KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map((tile, i) => (
          <Link
            key={tile.key}
            to="/tickets"
            search={
              tile.key === 'open'
                ? { status: 'offen' as const }
                : tile.key === 'inProgress'
                  ? { status: 'in_bearbeitung' as const }
                  : tile.key === 'doneToday'
                    ? { status: 'erledigt' as const, from: today }
                    : { priority: 'sehr_dringend' as const }
            }
            className="surface tap animate-rise relative overflow-hidden px-4 pb-4 pt-5 hover:border-ink-600"
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <span className={cx('absolute inset-x-0 top-0 h-[2px]', RULE[tile.tone])} />
            <tile.icon className={cx('size-4', TEXT[tile.tone])} />
            <p className="mt-3 font-display text-[34px] leading-none tracking-[-0.03em] text-fog-50 tabular-nums">
              {totals[tile.key]}
            </p>
            <p className="mt-2 text-[12.5px] leading-tight text-fog-400">{tile.label}</p>
          </Link>
        ))}
      </div>

      {totals.needsReview > 0 && user.role === 'admin' && (
        <Link
          to="/tickets"
          search={{ review: true }}
          className="surface tap flex items-center gap-3 border-brass-500/40 bg-brass-500/[0.07] px-4 py-3.5 hover:border-brass-500/70"
        >
          <TriangleAlert className="size-[18px] shrink-0 text-brass-300" />
          <p className="flex-1 text-[13.5px] text-fog-200">
            <span className="font-semibold text-brass-300">{totals.needsReview}</span> importierte Meldungen brauchen
            eine geprüfte Zuordnung.
          </p>
          <ArrowUpRight className="size-4 text-fog-500" />
        </Link>
      )}

      {/* -------------------------------------------------------- per hotel */}
      <section>
        <SectionTitle>Nach Hotel</SectionTitle>
        <Card className="divide-y divide-ink-800">
          {perHotel.map((hotel) => {
            const active = hotel.open + hotel.inProgress
            return (
              <Link
                key={hotel.hotelId}
                to="/tickets"
                search={{ hotel: hotel.slug }}
                className="tap block px-4 py-4 first:rounded-t-[13px] last:rounded-b-[13px] hover:bg-ink-850/60"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[15px] text-fog-50">{hotel.name}</span>
                  <span className="shrink-0 font-mono text-[12px] text-fog-400 tabular-nums">
                    {hotel.open} offen
                  </span>
                </div>

                {/* Honest stacked bar: open vs. in progress, shared scale. */}
                <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-ink-800">
                  <span
                    className="bg-amber-signal transition-[width] duration-500"
                    style={{ width: `${(hotel.open / maxHotelOpen) * 100}%` }}
                  />
                  <span
                    className="bg-steel-signal transition-[width] duration-500"
                    style={{ width: `${(hotel.inProgress / maxHotelOpen) * 100}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fog-500">
                  <span>{hotel.inProgress} in Bearbeitung</span>
                  <span>{hotel.doneToday} heute erledigt</span>
                  {hotel.critical > 0 && <span className="text-ember">{hotel.critical} sehr dringend</span>}
                  {active === 0 && <span className="text-moss">Alles abgearbeitet</span>}
                </div>
              </Link>
            )
          })}
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ----------------------------------------------------- open by area */}
        <section>
          <SectionTitle>Offen nach Bereich</SectionTitle>
          {perArea.length === 0 ? (
            <Card className="px-4 py-8 text-center text-[13px] text-fog-500">Keine offenen Meldungen.</Card>
          ) : (
            <Card className="p-4">
              <ul className="flex flex-col gap-3">
                {perArea.map((row) => {
                  const max = Math.max(...perArea.map((r) => r.open))
                  return (
                    <li key={row.area} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3">
                      <span className="truncate text-[13px] text-fog-300">{areaLabel(row.area)}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-ink-800">
                        <span
                          className="block h-full rounded-full bg-brass-500/80"
                          style={{ width: `${(row.open / max) * 100}%` }}
                        />
                      </span>
                      <span className="text-right font-mono text-[12px] text-fog-400 tabular-nums">{row.open}</span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </section>

        {/* -------------------------------------------------- repeat offenders */}
        <section>
          <SectionTitle
            action={
              <Link to="/raeume" className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-brass-400">
                Räume
              </Link>
            }
          >
            Häufige Problemstellen
          </SectionTitle>
          {topRooms.length === 0 ? (
            <Card className="px-4 py-8 text-center text-[13px] text-fog-500">
              Noch kein Raum mit mehreren Meldungen.
            </Card>
          ) : (
            <Card className="divide-y divide-ink-800">
              {topRooms.map((room) => (
                <Link
                  key={`${room.hotelId}-${room.roomNumber}`}
                  to="/raeume"
                  search={{ room: room.roomNumber ?? '' }}
                  className="tap flex items-center gap-3 px-4 py-3 hover:bg-ink-850/60"
                >
                  <span className="font-display text-[14.5px] text-fog-50">Zimmer {room.roomNumber}</span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fog-500">
                    {room.hotelShort}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {room.openCount > 0 && <Badge tone="amber">{room.openCount} offen</Badge>}
                    <span className="font-mono text-[12px] text-fog-400 tabular-nums">{room.total}×</span>
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------ active tickets */}
      <section>
        <SectionTitle
          action={
            <Link to="/tickets" className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-brass-400">
              Alle ansehen
            </Link>
          }
        >
          Dringlichste offene Tickets
        </SectionTitle>
        {recent.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="size-6" />}
            title="Keine offenen Meldungen"
            body="Sobald die Rezeption ein Problem meldet, erscheint es hier."
            action={
              <Link to="/tickets/neu">
                <Button variant="primary">Neue Meldung</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {recent.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
