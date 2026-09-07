import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db.server.js'
import { hotels, notifications, ticketComments, ticketPhotos, tickets } from '../../db/schema.js'
import { requireRole, requireUser } from './auth.server.js'
import {
  activeHotels,
  dashboardStats,
  ensureRoom,
  getTicketDetail,
  listRoomsWithCounts,
  listTickets,
  logEvent,
  notifyAssignmentChange,
  notifyUrgent,
  roomHistory,
  staffDirectory,
} from './tickets.server.js'
import { getConfig } from './settings.server.js'
import { AREAS, PRIORITIES, STATUSES } from '../lib/domain.js'
import { isValidMediaKey } from './media.server.js'

const areaValues = AREAS.map((a) => a.value) as [string, ...Array<string>]
const priorityValues = PRIORITIES.map((p) => p.value) as [string, ...Array<string>]
const statusValues = STATUSES.map((s) => s.value) as [string, ...Array<string>]

const photoInput = z.object({
  key: z.string().refine(isValidMediaKey, 'Ungültiger Bildverweis.'),
  mimeType: z.string().max(80),
  size: z.number().int().nonnegative().default(0),
  name: z.string().max(160).optional(),
})

/* -------------------------------------------------------------------- reads */

export const getWorkspace = createServerFn({ method: 'POST' }).handler(async () => {
  await requireUser()
  const [hotelList, staff, config] = await Promise.all([activeHotels(), staffDirectory(), getConfig()])
  return { hotels: hotelList, staff, config }
})

const filterInput = z.object({
  q: z.string().max(120).optional(),
  hotelId: z.number().int().nullable().optional(),
  status: z.array(z.enum(statusValues)).optional(),
  priority: z.array(z.enum(priorityValues)).optional(),
  area: z.array(z.enum(areaValues)).optional(),
  assignedToId: z.number().int().nullable().optional(),
  roomNumber: z.string().max(20).nullable().optional(),
  needsReview: z.boolean().optional(),
  source: z.string().max(20).nullable().optional(),
  from: z.string().max(30).nullable().optional(),
  to: z.string().max(30).nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})

export const fetchTickets = createServerFn({ method: 'POST' })
  .inputValidator(filterInput)
  .handler(async ({ data }) => {
    await requireUser()
    return listTickets(data)
  })

export const fetchTicket = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const me = await requireUser()
    const detail = await getTicketDetail(data.id)
    if (!detail) return null
    return { ...detail, me }
  })

export const fetchDashboard = createServerFn({ method: 'POST' }).handler(async () => {
  await requireUser()
  return dashboardStats()
})

export const fetchRooms = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ hotelId: z.number().int().nullable().optional(), q: z.string().max(40).nullable().optional() }))
  .handler(async ({ data }) => {
    await requireUser()
    return listRoomsWithCounts(data.hotelId ?? null, data.q ?? null)
  })

export const fetchRoomHistory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ hotelId: z.number().int().nullable().optional(), number: z.string().min(1).max(20) }))
  .handler(async ({ data }) => {
    await requireUser()
    return roomHistory(data.hotelId ?? null, data.number)
  })

/* ---------------------------------------------------------------- mutations */

export const createTicket = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      hotelId: z.number().int().positive('Bitte ein Hotel auswählen.'),
      area: z.enum(areaValues),
      roomNumber: z.string().trim().max(20).optional(),
      title: z.string().trim().min(3, 'Bitte das Problem kurz beschreiben.').max(140),
      description: z.string().trim().max(4000).default(''),
      priority: z.enum(priorityValues).default('normal'),
      photos: z.array(photoInput).max(12).default([]),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser()
    const config = await getConfig()

    if (data.area === 'zimmer' && !data.roomNumber?.trim()) {
      return { ok: false as const, error: 'Für den Bereich „Zimmer“ ist eine Zimmernummer nötig.' }
    }
    const hotel = await db
      .select({ id: hotels.id, name: hotels.name })
      .from(hotels)
      .where(and(eq(hotels.id, data.hotelId), eq(hotels.active, true)))
      .limit(1)
    if (!hotel.length) return { ok: false as const, error: 'Unbekanntes Hotel.' }

    const now = new Date()
    const [ticket] = await db
      .insert(tickets)
      .values({
        hotelId: data.hotelId,
        area: data.area,
        roomNumber: data.roomNumber?.trim() || null,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: 'offen',
        createdById: me.id,
        source: 'app',
        reportedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tickets.id })

    await ensureRoom(data.hotelId, data.roomNumber)
    await logEvent(ticket.id, me, 'created', 'Ticket erstellt', { priority: data.priority })

    if (data.photos.length) {
      await db.insert(ticketPhotos).values(
        data.photos.map((p) => ({
          ticketId: ticket.id,
          blobKey: p.key,
          phase: 'before',
          mimeType: p.mimeType,
          byteSize: p.size,
          originalName: p.name ?? null,
          uploadedById: me.id,
        })),
      )
      await logEvent(
        ticket.id,
        me,
        'photo',
        `${data.photos.length} Foto${data.photos.length > 1 ? 's' : ''} vor Reparatur hochgeladen`,
      )
    }

    if (data.priority === 'sehr_dringend' && config.notifyUrgent) {
      await notifyUrgent(ticket.id, data.title, hotel[0].name, me.id)
    }

    return { ok: true as const, id: ticket.id }
  })

export const claimTicket = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const me = await requireRole('technik', 'admin')
    const updated = await db
      .update(tickets)
      .set({
        assignedToId: me.id,
        status: sql`case when ${tickets.status} = 'offen' then 'in_bearbeitung' else ${tickets.status} end`,
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.id, data.id), isNull(tickets.assignedToId)))
      .returning({ id: tickets.id, status: tickets.status })

    if (!updated.length) {
      return { ok: false as const, error: 'Dieses Ticket wurde inzwischen von jemand anderem übernommen.' }
    }
    await logEvent(data.id, me, 'claimed', `Übernommen von ${me.firstName} ${me.lastName}`)
    await logEvent(data.id, me, 'status', 'Status geändert zu „In Bearbeitung“')
    return { ok: true as const }
  })

export const releaseTicket = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const me = await requireRole('technik', 'admin')
    await db
      .update(tickets)
      .set({ assignedToId: null, status: 'offen', updatedAt: new Date() })
      .where(eq(tickets.id, data.id))
    await logEvent(data.id, me, 'released', 'Bearbeitung zurückgegeben, Ticket ist wieder offen')
    return { ok: true as const }
  })

export const assignTicket = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive(), userId: z.number().int().positive().nullable() }))
  .handler(async ({ data }) => {
    const me = await requireRole('admin')
    await db.update(tickets).set({ assignedToId: data.userId, updatedAt: new Date() }).where(eq(tickets.id, data.id))
    const rows = await db.select({ title: tickets.title }).from(tickets).where(eq(tickets.id, data.id)).limit(1)
    await logEvent(data.id, me, 'claimed', data.userId ? 'Zuweisung geändert' : 'Zuweisung entfernt')
    if (data.userId && rows[0]) {
      await notifyAssignmentChange(data.id, rows[0].title, data.userId, 'Dir wurde ein Ticket zugewiesen')
    }
    return { ok: true as const }
  })

export const setTicketStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive(), status: z.enum(statusValues) }))
  .handler(async ({ data }) => {
    const me = await requireRole('technik', 'admin')
    const config = await getConfig()

    const rows = await db
      .select({ status: tickets.status, assignedToId: tickets.assignedToId })
      .from(tickets)
      .where(eq(tickets.id, data.id))
      .limit(1)
    if (!rows.length) return { ok: false as const, error: 'Ticket nicht gefunden.' }
    if (rows[0].status === data.status) return { ok: true as const }

    if (data.status === 'erledigt' && config.requireAfterPhoto) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ticketPhotos)
        .where(and(eq(ticketPhotos.ticketId, data.id), eq(ticketPhotos.phase, 'after')))
      if (!n) {
        return {
          ok: false as const,
          error: 'Bitte zuerst ein Foto nach der Reparatur hochladen.',
          needsAfterPhoto: true,
        }
      }
    }

    const now = new Date()
    await db
      .update(tickets)
      .set({
        status: data.status,
        updatedAt: now,
        completedAt: data.status === 'erledigt' ? now : null,
        assignedToId: rows[0].assignedToId ?? (data.status !== 'offen' ? me.id : null),
      })
      .where(eq(tickets.id, data.id))

    const label = STATUSES.find((s) => s.value === data.status)?.label ?? data.status
    await logEvent(data.id, me, 'status', `Status geändert zu „${label}“`)
    return { ok: true as const }
  })

export const addComment = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive(), body: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data }) => {
    const me = await requireUser()
    await db.insert(ticketComments).values({ ticketId: data.id, userId: me.id, body: data.body })
    await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, data.id))
    await logEvent(data.id, me, 'comment', 'Kommentar hinzugefügt')
    return { ok: true as const }
  })

export const addPhotos = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number().int().positive(),
      phase: z.enum(['before', 'after']),
      photos: z.array(photoInput).min(1).max(12),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireUser()
    const rows = await db
      .select({ createdById: tickets.createdById })
      .from(tickets)
      .where(eq(tickets.id, data.id))
      .limit(1)
    if (!rows.length) return { ok: false as const, error: 'Ticket nicht gefunden.' }

    const isTech = me.role === 'technik' || me.role === 'admin'
    if (data.phase === 'after' && !isTech) {
      return { ok: false as const, error: 'Nachher-Fotos dürfen nur von der Technik hochgeladen werden.' }
    }
    if (!isTech && rows[0].createdById !== me.id) {
      return { ok: false as const, error: 'Nur die Technik darf Fotos zu fremden Meldungen hinzufügen.' }
    }

    await db.insert(ticketPhotos).values(
      data.photos.map((p) => ({
        ticketId: data.id,
        blobKey: p.key,
        phase: data.phase,
        mimeType: p.mimeType,
        byteSize: p.size,
        originalName: p.name ?? null,
        uploadedById: me.id,
      })),
    )
    await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, data.id))
    await logEvent(
      data.id,
      me,
      'photo',
      `${data.photos.length} Foto${data.photos.length > 1 ? 's' : ''} ${data.phase === 'after' ? 'nach' : 'vor'} Reparatur hochgeladen`,
    )
    return { ok: true as const }
  })

export const updateTicket = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number().int().positive(),
      hotelId: z.number().int().positive(),
      area: z.enum(areaValues),
      roomNumber: z.string().trim().max(20).nullable().optional(),
      title: z.string().trim().min(3).max(140),
      description: z.string().trim().max(4000),
      priority: z.enum(priorityValues),
      clearReview: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireRole('technik', 'admin')
    if (data.area === 'zimmer' && !data.roomNumber?.trim()) {
      return { ok: false as const, error: 'Für den Bereich „Zimmer“ ist eine Zimmernummer nötig.' }
    }
    await db
      .update(tickets)
      .set({
        hotelId: data.hotelId,
        area: data.area,
        roomNumber: data.roomNumber?.trim() || null,
        title: data.title,
        description: data.description,
        priority: data.priority,
        needsReview: data.clearReview ? false : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, data.id))
    await ensureRoom(data.hotelId, data.roomNumber ?? undefined)
    await logEvent(data.id, me, 'edited', 'Ticketdaten bearbeitet')
    return { ok: true as const }
  })

export const deletePhoto = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ photoId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const me = await requireRole('technik', 'admin')
    const rows = await db
      .select({ ticketId: ticketPhotos.ticketId })
      .from(ticketPhotos)
      .where(eq(ticketPhotos.id, data.photoId))
      .limit(1)
    if (!rows.length) return { ok: false as const, error: 'Foto nicht gefunden.' }
    await db.delete(ticketPhotos).where(eq(ticketPhotos.id, data.photoId))
    await logEvent(rows[0].ticketId, me, 'photo', 'Foto entfernt')
    return { ok: true as const }
  })

/* ---------------------------------------------------------- notifications */

export const fetchNotifications = createServerFn({ method: 'POST' }).handler(async () => {
  const me = await requireUser()
  const items = await db
    .select({
      id: notifications.id,
      ticketId: notifications.ticketId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, me.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30)
  return { items, unread: items.filter((i) => !i.readAt).length }
})

export const markNotificationsRead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ ids: z.array(z.number().int().positive()).max(60).optional() }))
  .handler(async ({ data }) => {
    const me = await requireUser()
    const where = data.ids?.length
      ? and(eq(notifications.userId, me.id), sql`${notifications.id} = any(${data.ids})`)
      : and(eq(notifications.userId, me.id), isNull(notifications.readAt))
    await db.update(notifications).set({ readAt: new Date() }).where(where)
    return { ok: true as const }
  })
