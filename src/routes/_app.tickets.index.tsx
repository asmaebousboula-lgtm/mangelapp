import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Inbox, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { z } from 'zod'
import { fetchTickets, getWorkspace } from '../server/tickets.functions'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  SegmentedControl,
  Sheet,
  Toggle,
  cx,
} from '../components/ui'
import { TicketCard, TicketCardSkeleton } from '../components/TicketCard'
import { AREAS, PRIORITIES, STATUSES, areaLabel, priorityLabel } from '../lib/domain'

const PAGE = 25

const searchSchema = z.object({
  q: z.string().optional(),
  hotel: z.string().optional(),
  status: z.enum(['offen', 'in_bearbeitung', 'erledigt']).optional(),
  priority: z.enum(['normal', 'dringend', 'sehr_dringend']).optional(),
  area: z.string().optional(),
  mine: z.boolean().optional(),
  review: z.boolean().optional(),
  from: z.string().optional(),
  page: z.number().optional(),
})

export type TicketSearch = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_app/tickets/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, context }) => {
    const workspace = await getWorkspace({ data: undefined })
    const hotel = workspace.hotels.find((h) => h.slug === deps.hotel)
    const result = await fetchTickets({
      data: {
        q: deps.q || undefined,
        hotelId: hotel?.id ?? null,
        status: deps.status ? [deps.status] : undefined,
        priority: deps.priority ? [deps.priority] : undefined,
        area: deps.area ? [deps.area] : undefined,
        assignedToId: deps.mine ? context.user.id : null,
        needsReview: deps.review || undefined,
        from: deps.from || null,
        limit: Math.min((deps.page ?? 1) * PAGE, 200),
      },
    })
    return { ...result, hotels: workspace.hotels }
  },
  component: TicketsPage,
})

function TicketsPage() {
  const { items, total, limit, hotels } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [filtersOpen, setFiltersOpen] = useState(false)

  const set = (patch: Partial<TicketSearch>) =>
    navigate({
      search: (prev) => {
        const next = { ...prev, ...patch, page: undefined }
        for (const key of Object.keys(next) as Array<keyof TicketSearch>) {
          const v = next[key]
          if (v === '' || v === false || v === undefined) delete next[key]
        }
        return next
      },
      replace: true,
    })

  const activeFilters = [search.priority, search.area, search.mine ? 'mine' : null, search.review ? 'review' : null]
    .filter(Boolean).length

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Meldungen</p>
          <h1 className="mt-1.5 font-display text-[26px] leading-tight text-fog-50">Tickets</h1>
        </div>
        <Link to="/tickets/neu" className="hidden sm:block">
          <Button variant="primary" icon={<Plus className="size-4" />}>
            Neue Meldung
          </Button>
        </Link>
      </header>

      <SearchBox value={search.q ?? ''} onChange={(q) => set({ q })} />

      <div className="flex flex-col gap-3">
        <SegmentedControl
          value={search.hotel ?? 'alle'}
          onChange={(v) => set({ hotel: v === 'alle' ? undefined : v })}
          options={[
            { value: 'alle', label: 'Alle Hotels' },
            ...hotels.map((h) => ({ value: h.slug, label: h.shortName })),
          ]}
        />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SegmentedControl
              value={search.status ?? 'alle'}
              onChange={(v) => set({ status: v === 'alle' ? undefined : (v as TicketSearch['status']) })}
              options={[
                { value: 'alle', label: 'Alle' },
                ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
              ]}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={cx(
              'tap relative grid size-11 shrink-0 place-items-center rounded-xl border transition-colors',
              activeFilters > 0
                ? 'border-brass-500/60 bg-brass-500/12 text-brass-300'
                : 'border-ink-700 bg-ink-850 text-fog-400 hover:text-fog-200',
            )}
            aria-label="Weitere Filter"
          >
            <SlidersHorizontal className="size-[18px]" />
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-brass-500 font-mono text-[10px] font-bold text-ink-950">
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeFilters > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-2">
          {search.priority && (
            <Chip label={priorityLabel(search.priority)} onClear={() => set({ priority: undefined })} />
          )}
          {search.area && <Chip label={areaLabel(search.area)} onClear={() => set({ area: undefined })} />}
          {search.mine && <Chip label="Mir zugewiesen" onClear={() => set({ mine: undefined })} />}
          {search.review && <Chip label="Zuordnung prüfen" onClear={() => set({ review: undefined })} />}
        </div>
      )}

      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fog-500">
        {total} {total === 1 ? 'Ticket' : 'Tickets'}
        {search.from && ' · heute'}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title="Keine Meldungen gefunden"
          body="Passe Suche oder Filter an – oder erfasse eine neue Meldung."
          action={
            <Link to="/tickets/neu">
              <Button variant="primary">Neue Meldung</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}

      {total > items.length && (
        <div className="pt-1 text-center">
          <Button
            variant="secondary"
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: Math.floor(limit / PAGE) + 1 }) })}
          >
            Weitere {Math.min(PAGE, total - items.length)} laden
          </Button>
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter">
        <div className="flex flex-col gap-6">
          <div>
            <p className="label mb-2">Priorität</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <FilterPill
                  key={p.value}
                  active={search.priority === p.value}
                  onClick={() =>
                    set({ priority: search.priority === p.value ? undefined : (p.value as TicketSearch['priority']) })
                  }
                >
                  {p.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">Bereich</p>
            <div className="flex flex-wrap gap-2">
              {AREAS.map((a) => (
                <FilterPill
                  key={a.value}
                  active={search.area === a.value}
                  onClick={() => set({ area: search.area === a.value ? undefined : a.value })}
                >
                  {a.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-ink-800 pt-5">
            <Toggle
              checked={!!search.mine}
              onChange={(v) => set({ mine: v || undefined })}
              label="Nur mir zugewiesen"
            />
            <Toggle
              checked={!!search.review}
              onChange={(v) => set({ review: v || undefined })}
              label="Nur „Zuordnung prüfen“"
              hint="Aus dem WhatsApp-Import übernommene Meldungen"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              block
              onClick={() => {
                navigate({ search: {}, replace: true })
                setFiltersOpen(false)
              }}
            >
              Zurücksetzen
            </Button>
            <Button variant="primary" block onClick={() => setFiltersOpen(false)}>
              Fertig
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="tap">
      <Badge tone="brass">
        <span className="flex items-center gap-1.5">
          {label}
          <X className="size-3" />
        </span>
      </Badge>
    </button>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'tap rounded-full border px-3.5 py-2 text-[13px] transition-colors',
        active
          ? 'border-brass-500/60 bg-brass-500/14 text-brass-300'
          : 'border-ink-700 bg-ink-850 text-fog-300 hover:border-ink-600',
      )}
    >
      {children}
    </button>
  )
}

/** Debounced so typing a room number does not fire a request per keystroke. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])

  useEffect(() => {
    if (!dirty.current || draft === value) return
    const id = setTimeout(() => {
      dirty.current = false
      onChange(draft.trim())
    }, 320)
    return () => clearTimeout(id)
  }, [draft, value, onChange])

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fog-500" />
      <Input
        value={draft}
        onChange={(e) => {
          dirty.current = true
          setDraft(e.target.value)
        }}
        placeholder="Zimmer, Problem, Hotel, Mitarbeiter…"
        className="pl-11 pr-10"
        inputMode="search"
        aria-label="Tickets durchsuchen"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            dirty.current = false
            setDraft('')
            onChange('')
          }}
          className="tap absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-fog-500 hover:text-fog-200"
          aria-label="Suche löschen"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function TicketsPending() {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <TicketCardSkeleton key={i} />
      ))}
    </div>
  )
}
