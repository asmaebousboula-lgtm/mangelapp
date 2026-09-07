import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db, ensureSeeded } from './db.server.js'
import {
  hotels,
  notifications,
  rooms,
  ticketComments,
  ticketEvents,
  ticketPhotos,
  tickets,
  users,
} from '../../db/schema.js'
import type { SessionUser } from './auth.server.js'

const creator = alias(users, 'creator')
const assignee = alias(users, 'assignee')

export type TicketFilters = {
  q?: string
  hotelId?: number | null
  status?: Array<string>
  priority?: Array<string>
  area?: Array<string>
  assignedToId?: number | null
  roomNumber?: string | null
  needsReview?: boolean
  source?: string | null
  from?: string | null
  to?: string | null
  limit?: number
  offset?: number
}

const startOfBerlinToday = sql`date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin'`

function buildWhere(f: TicketFilters) {
  const conds = []
  if (f.hotelId) conds.push(eq(tickets.hotelId, f.hotelId))
  if (f.status?.length) conds.push(inArray(tickets.status, f.status))
  if (f.priority?.length) conds.push(inArray(tickets.priority, f.priority))
  if (f.area?.length) conds.push(inArray(tickets.area, f.area))
  if (f.assignedToId) conds.push(eq(tickets.assignedToId, f.assignedToId))
  if (f.source) conds.push(eq(tickets.source, f.source))
  if (f.needsReview) conds.push(eq(tickets.needsReview, true))
  if (f.roomNumber) conds.push(sql`lower(${tickets.roomNumber}) = ${f.roomNumber.trim().toLowerCase()}`)
  if (f.from) conds.push(gte(tickets.reportedAt, new Date(f.from)))
  if (f.to) conds.push(lte(tickets.reportedAt, new Date(`${f.to.slice(0, 10)}T23:59:59.999Z`)))

  const q = f.q?.trim()
  if (q) {
    const like = `%${q}%`
    const numeric = /^\d+$/.test(q)
    const parts = [
      ilike(tickets.title, like),
      ilike(tickets.description, like),
      ilike(tickets.roomNumber, like),
      ilike(tickets.externalAuthor, like),
      ilike(hotels.name, like),
      ilike(hotels.shortName, like),
      sql`concat(${creator.firstName}, ' ', ${creator.lastName}) ILIKE ${like}`,
      sql`concat(${assignee.firstName}, ' ', ${assignee.lastName}) ILIKE ${like}`,
    ]
    if (numeric) parts.push(eq(tickets.id, Number(q)))
    conds.push(or(...parts))
  }
  return conds.length ? and(...conds) : undefined
}

const listSelection = {
  id: tickets.id,
  hotelId: tickets.hotelId,
  hotelName: hotels.name,
  hotelShort: hotels.shortName,
  hotelSlug: hotels.slug,
  area: tickets.area,
  roomNumber: tickets.roomNumber,
  title: tickets.title,
  description: tickets.description,
  priority: tickets.priority,
  status: tickets.status,
  source: tickets.source,
  needsReview: tickets.needsReview,
  externalAuthor: tickets.externalAuthor,
  reportedAt: tickets.reportedAt,
  updatedAt: tickets.updatedAt,
  completedAt: tickets.completedAt,
  createdById: tickets.createdById,
  createdByName: sql<string | null>`nullif(trim(concat(${creator.firstName}, ' ', ${creator.lastName})), '')`,
  assignedToId: tickets.assignedToId,
  assignedToName: sql<string | null>`nullif(trim(concat(${assignee.firstName}, ' ', ${assignee.lastName})), '')`,
  photoCount: sql<number>`(select count(*)::int from ${ticketPhotos} where ${ticketPhotos.ticketId} = ${tickets.id})`,
  afterPhotoCount: sql<number>`(select count(*)::int from ${ticketPhotos} where ${ticketPhotos.ticketId} = ${tickets.id} and ${ticketPhotos.phase} = 'after')`,
  commentCount: sql<number>`(select count(*)::int from ${ticketComments} where ${ticketComments.ticketId} = ${tickets.id})`,
  thumbKey: sql<string | null>`(select ${ticketPhotos.blobKey} from ${ticketPhotos} where ${ticketPhotos.ticketId} = ${tickets.id} order by ${ticketPhotos.phase} desc, ${ticketPhotos.id} asc limit 1)`,
}

export type TicketListItem = Awaited<ReturnType<typeof listTickets>>['items'][number]

export async function listTickets(filters: TicketFilters) {
  await ensureSeeded()
  const where = buildWhere(filters)
  const limit = Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0

  const items = await db
    .select(listSelection)
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .leftJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedToId))
    .where(where)
    .orderBy(
      // Open work first, then by urgency, then newest.
      sql`case ${tickets.status} when 'offen' then 0 when 'in_bearbeitung' then 1 else 2 end`,
      sql`case ${tickets.priority} when 'sehr_dringend' then 0 when 'dringend' then 1 else 2 end`,
      desc(tickets.reportedAt),
    )
    .limit(limit)
    .offset(offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .leftJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedToId))
    .where(where)

  return { items, total, limit, offset }
}

export async function getTicketDetail(id: number) {
  await ensureSeeded()
  const rows = await db
    .select(listSelection)
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .leftJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedToId))
    .where(eq(tickets.id, id))
    .limit(1)

  const ticket = rows[0]
  if (!ticket) return null

  const [photos, comments, events] = await Promise.all([
    db
      .select({
        id: ticketPhotos.id,
        blobKey: ticketPhotos.blobKey,
        phase: ticketPhotos.phase,
        mimeType: ticketPhotos.mimeType,
        byteSize: ticketPhotos.byteSize,
        createdAt: ticketPhotos.createdAt,
        uploadedById: ticketPhotos.uploadedById,
        uploadedByName: sql<string | null>`nullif(trim(concat(${users.firstName}, ' ', ${users.lastName})), '')`,
      })
      .from(ticketPhotos)
      .leftJoin(users, eq(users.id, ticketPhotos.uploadedById))
      .where(eq(ticketPhotos.ticketId, id))
      .orderBy(asc(ticketPhotos.id)),
    db
      .select({
        id: ticketComments.id,
        body: ticketComments.body,
        createdAt: ticketComments.createdAt,
        userId: ticketComments.userId,
        authorName: sql<string | null>`coalesce(nullif(trim(concat(${users.firstName}, ' ', ${users.lastName})), ''), ${ticketComments.authorName})`,
        authorRole: users.role,
      })
      .from(ticketComments)
      .leftJoin(users, eq(users.id, ticketComments.userId))
      .where(eq(ticketComments.ticketId, id))
      .orderBy(asc(ticketComments.createdAt), asc(ticketComments.id)),
    db
      .select({
        id: ticketEvents.id,
        type: ticketEvents.type,
        message: ticketEvents.message,
        createdAt: ticketEvents.createdAt,
        actorName: sql<string | null>`coalesce(nullif(trim(concat(${users.firstName}, ' ', ${users.lastName})), ''), ${ticketEvents.actorName})`,
      })
      .from(ticketEvents)
      .leftJoin(users, eq(users.id, ticketEvents.userId))
      .where(eq(ticketEvents.ticketId, id))
      .orderBy(asc(ticketEvents.createdAt), asc(ticketEvents.id)),
  ])

  return { ticket, photos, comments, events }
}

export async function logEvent(
  ticketId: number,
  actor: SessionUser | null,
  type: string,
  message: string,
  meta?: unknown,
  at?: Date,
) {
  await db.insert(ticketEvents).values({
    ticketId,
    userId: actor?.id ?? null,
    actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : null,
    type,
    message,
    meta: (meta ?? null) as never,
    ...(at ? { createdAt: at } : {}),
  })
}

export async function ensureRoom(hotelId: number, number: string | null | undefined) {
  const trimmed = number?.trim()
  if (!trimmed) return
  await db.insert(rooms).values({ hotelId, number: trimmed }).onConflictDoNothing()
}

/** Alerts every technician/admin about a brand-new "sehr dringend" report. */
export async function notifyUrgent(ticketId: number, title: string, hotelName: string, exceptUserId?: number) {
  const targets = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['technik', 'admin']), eq(users.status, 'active')))
  const rows = targets
    .filter((t) => t.id !== exceptUserId)
    .map((t) => ({
      userId: t.id,
      ticketId,
      type: 'urgent_ticket',
      title: `Sehr dringend · ${hotelName}`,
      body: title,
    }))
  if (rows.length) await db.insert(notifications).values(rows)
}

export async function notifyAssignmentChange(
  ticketId: number,
  title: string,
  targetUserId: number | null,
  message: string,
) {
  if (!targetUserId) return
  await db.insert(notifications).values({ userId: targetUserId, ticketId, type: 'assigned', title: message, body: title })
}

export async function dashboardStats() {
  await ensureSeeded()

  const [totals] = await db
    .select({
      open: sql<number>`count(*) filter (where ${tickets.status} = 'offen')::int`,
      inProgress: sql<number>`count(*) filter (where ${tickets.status} = 'in_bearbeitung')::int`,
      doneToday: sql<number>`count(*) filter (where ${tickets.status} = 'erledigt' and ${tickets.completedAt} >= ${startOfBerlinToday})::int`,
      critical: sql<number>`count(*) filter (where ${tickets.priority} = 'sehr_dringend' and ${tickets.status} <> 'erledigt')::int`,
      urgent: sql<number>`count(*) filter (where ${tickets.priority} = 'dringend' and ${tickets.status} <> 'erledigt')::int`,
      needsReview: sql<number>`count(*) filter (where ${tickets.needsReview} = true)::int`,
      total: sql<number>`count(*)::int`,
      newToday: sql<number>`count(*) filter (where ${tickets.reportedAt} >= ${startOfBerlinToday})::int`,
    })
    .from(tickets)

  const perHotel = await db
    .select({
      hotelId: hotels.id,
      slug: hotels.slug,
      name: hotels.name,
      shortName: hotels.shortName,
      open: sql<number>`count(${tickets.id}) filter (where ${tickets.status} = 'offen')::int`,
      inProgress: sql<number>`count(${tickets.id}) filter (where ${tickets.status} = 'in_bearbeitung')::int`,
      doneToday: sql<number>`count(${tickets.id}) filter (where ${tickets.status} = 'erledigt' and ${tickets.completedAt} >= ${startOfBerlinToday})::int`,
      critical: sql<number>`count(${tickets.id}) filter (where ${tickets.priority} = 'sehr_dringend' and ${tickets.status} <> 'erledigt')::int`,
    })
    .from(hotels)
    .leftJoin(tickets, eq(tickets.hotelId, hotels.id))
    .where(eq(hotels.active, true))
    .groupBy(hotels.id, hotels.slug, hotels.name, hotels.shortName, hotels.sortOrder)
    .orderBy(asc(hotels.sortOrder), asc(hotels.name))

  const perArea = await db
    .select({ area: tickets.area, open: sql<number>`count(*)::int` })
    .from(tickets)
    .where(ne(tickets.status, 'erledigt'))
    .groupBy(tickets.area)
    .orderBy(desc(sql`count(*)`))
    .limit(6)

  const topRooms = await db
    .select({
      hotelShort: hotels.shortName,
      hotelId: tickets.hotelId,
      roomNumber: tickets.roomNumber,
      total: sql<number>`count(*)::int`,
      openCount: sql<number>`count(*) filter (where ${tickets.status} <> 'erledigt')::int`,
    })
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .where(and(isNotNull(tickets.roomNumber), ne(tickets.roomNumber, '')))
    .groupBy(tickets.hotelId, hotels.shortName, tickets.roomNumber)
    .having(sql`count(*) > 1`)
    .orderBy(desc(sql`count(*)`))
    .limit(6)

  const recent = await db
    .select(listSelection)
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .leftJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedToId))
    .where(ne(tickets.status, 'erledigt'))
    .orderBy(
      sql`case ${tickets.priority} when 'sehr_dringend' then 0 when 'dringend' then 1 else 2 end`,
      desc(tickets.reportedAt),
    )
    .limit(6)

  return { totals, perHotel, perArea, topRooms, recent }
}

export async function roomHistory(hotelId: number | null, number: string) {
  await ensureSeeded()
  const conds = [sql`lower(${tickets.roomNumber}) = ${number.trim().toLowerCase()}`]
  if (hotelId) conds.push(eq(tickets.hotelId, hotelId))
  const items = await db
    .select(listSelection)
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .leftJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedToId))
    .where(and(...conds))
    .orderBy(desc(tickets.reportedAt))
  return items
}

export async function listRoomsWithCounts(hotelId: number | null, q: string | null) {
  await ensureSeeded()
  const conds = []
  if (hotelId) conds.push(eq(rooms.hotelId, hotelId))
  if (q?.trim()) conds.push(ilike(rooms.number, `%${q.trim()}%`))

  return db
    .select({
      id: rooms.id,
      hotelId: rooms.hotelId,
      hotelShort: hotels.shortName,
      hotelName: hotels.name,
      number: rooms.number,
      total: sql<number>`(select count(*)::int from ${tickets} where ${tickets.hotelId} = ${rooms.hotelId} and lower(${tickets.roomNumber}) = lower(${rooms.number}))`,
      openCount: sql<number>`(select count(*)::int from ${tickets} where ${tickets.hotelId} = ${rooms.hotelId} and lower(${tickets.roomNumber}) = lower(${rooms.number}) and ${tickets.status} <> 'erledigt')`,
      lastReportedAt: sql<string | null>`(select max(${tickets.reportedAt})::text from ${tickets} where ${tickets.hotelId} = ${rooms.hotelId} and lower(${tickets.roomNumber}) = lower(${rooms.number}))`,
    })
    .from(rooms)
    .innerJoin(hotels, eq(hotels.id, rooms.hotelId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(hotels.sortOrder), asc(sql`length(${rooms.number})`), asc(rooms.number))
    .limit(400)
}

export async function activeHotels() {
  await ensureSeeded()
  return db
    .select({ id: hotels.id, slug: hotels.slug, name: hotels.name, shortName: hotels.shortName, active: hotels.active })
    .from(hotels)
    .where(eq(hotels.active, true))
    .orderBy(asc(hotels.sortOrder), asc(hotels.name))
}

export async function staffDirectory() {
  await ensureSeeded()
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      hotelId: users.hotelId,
      openAssigned: sql<number>`(select count(*)::int from ${tickets} where ${tickets.assignedToId} = ${users.id} and ${tickets.status} <> 'erledigt')`,
    })
    .from(users)
    .where(eq(users.status, 'active'))
    .orderBy(asc(users.firstName), asc(users.lastName))
}

export async function countTickets(where: TicketFilters) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tickets)
    .innerJoin(hotels, eq(hotels.id, tickets.hotelId))
    .leftJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assignedToId))
    .where(buildWhere(where))
  return row?.total ?? 0
}
