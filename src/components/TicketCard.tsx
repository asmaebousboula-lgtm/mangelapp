import { Link } from '@tanstack/react-router'
import { Camera, MessageSquare, TriangleAlert, UserCheck } from 'lucide-react'
import { PriorityBadge, StatusBadge } from './badges'
import { cx } from './ui'
import { areaLabel } from '../lib/domain'
import { fmtAgo } from '../lib/format'

export type TicketCardData = {
  id: number
  title: string
  area: string
  roomNumber: string | null
  hotelShort: string
  hotelName: string
  status: string
  priority: string
  assignedToName: string | null
  createdByName: string | null
  externalAuthor: string | null
  source: string
  needsReview: boolean
  reportedAt: string | Date
  photoCount: number
  commentCount: number
  thumbKey: string | null
}

export function locationLabel(t: { area: string; roomNumber: string | null }) {
  if (t.area === 'zimmer') return t.roomNumber ? `Zimmer ${t.roomNumber}` : 'Zimmer'
  return t.roomNumber ? `${areaLabel(t.area)} ${t.roomNumber}` : areaLabel(t.area)
}

export function TicketCard({ ticket, className }: { ticket: TicketCardData; className?: string }) {
  // Reporter and technician are shown side by side; the person who reported a defect stays
  // visible even after someone claimed it.
  const reporter = ticket.createdByName ?? ticket.externalAuthor

  return (
    <Link
      to="/tickets/$ticketId"
      params={{ ticketId: String(ticket.id) }}
      className={cx(
        'surface tap group block overflow-hidden px-4 py-3.5 hover:border-ink-600',
        `rail-${ticket.status}`,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[15.5px] font-bold text-fog-50">{locationLabel(ticket)}</span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fog-500">
              {ticket.hotelShort}
            </span>
            {ticket.needsReview && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-brass-300">
                <TriangleAlert className="size-3" />
                Zuordnung prüfen
              </span>
            )}
          </div>

          <p className="mt-1 line-clamp-2 text-[14.5px] leading-snug text-fog-200 group-hover:text-fog-50">
            {ticket.title}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="font-mono text-[10.5px] text-fog-500">#{ticket.id}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fog-500">
            <span>{fmtAgo(ticket.reportedAt)}</span>
            {reporter && <span>von {reporter}</span>}
            {ticket.assignedToName && (
              <span className="inline-flex items-center gap-1 text-fog-400">
                <UserCheck className="size-3.5" />
                {ticket.assignedToName}
              </span>
            )}
            {ticket.photoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" />
                {ticket.photoCount}
              </span>
            )}
            {ticket.commentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3.5" />
                {ticket.commentCount}
              </span>
            )}
            {ticket.source === 'whatsapp' && <span className="text-brass-500">WhatsApp</span>}
          </div>
        </div>

        {ticket.thumbKey && (
          <img
            src={`/api/media/${ticket.thumbKey}`}
            alt=""
            loading="lazy"
            className="size-[68px] shrink-0 rounded-xl border border-ink-700 object-cover"
          />
        )}
      </div>
    </Link>
  )
}

export function TicketCardSkeleton() {
  return (
    <div className="surface px-4 py-3.5">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton mt-2.5 h-4 w-full rounded" />
      <div className="skeleton mt-2.5 h-5 w-24 rounded" />
    </div>
  )
}
