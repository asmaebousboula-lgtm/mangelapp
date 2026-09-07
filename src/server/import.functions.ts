import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, ensureSeeded } from './db.server.js'
import { hotels, importBatches, importEntries, ticketComments, ticketPhotos, tickets } from '../../db/schema.js'
import { requireAdmin } from './auth.server.js'
import { ensureRoom, logEvent } from './tickets.server.js'
import { isValidMediaKey } from './media.server.js'
import { AREAS, PRIORITIES } from '../lib/domain.js'
import { buildDrafts, parseChat } from '../lib/whatsapp.js'

const areaValues = AREAS.map((a) => a.value) as [string, ...Array<string>]
const priorityValues = PRIORITIES.map((p) => p.value) as [string, ...Array<string>]

const mediaSchema = z.object({
  key: z.string().refine(isValidMediaKey, 'Ungültiger Medienverweis.'),
  name: z.string().max(200).default(''),
  mimeType: z.string().max(80).default('image/jpeg'),
  size: z.number().int().nonnegative().default(0),
})

const draftSchema = z.object({
  sortIndex: z.number().int().nonnegative(),
  reportedAt: z.string().nullable().optional(),
  rawTimestamp: z.string().max(60).default(''),
  sender: z.string().max(120).nullable().optional(),
  rawText: z.string().max(8000).default(''),
  hotelId: z.number().int().positive().nullable().optional(),
  area: z.enum(areaValues).nullable().optional(),
  roomNumber: z.string().max(20).nullable().optional(),
  title: z.string().max(160).default(''),
  description: z.string().max(8000).default(''),
  priority: z.enum(priorityValues).default('normal'),
  media: z.array(mediaSchema).max(20).default([]),
  include: z.boolean().default(true),
  needsReview: z.boolean().default(false),
  reviewReason: z.string().max(200).nullable().optional(),
})

/** Server-side parse for a plain `_chat.txt` upload (no media in the file). */
export const parseChatText = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      content: z.string().max(6_000_000),
      defaultHotelId: z.number().int().positive().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    const hotelList = await db.select({ id: hotels.id, slug: hotels.slug }).from(hotels).where(eq(hotels.active, true))
    const bySlug = new Map(hotelList.map((h) => [h.slug, h.id]))
    const defaultSlug = hotelList.find((h) => h.id === data.defaultHotelId)?.slug ?? null

    const messages = parseChat(data.content)
    const drafts = buildDrafts(messages, { hotelSlugs: hotelList.map((h) => h.slug), defaultHotelSlug: defaultSlug })

    return {
      messageCount: messages.filter((m) => !m.system).length,
      drafts: drafts.map((d) => ({
        ...d,
        hotelId: d.hotelSlug ? (bySlug.get(d.hotelSlug) ?? null) : null,
      })),
    }
  })

/** Persists the editable preview. Media must already be uploaded to Blobs. */
export const createImportBatch = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      filename: z.string().trim().min(1).max(200),
      defaultHotelId: z.number().int().positive(),
      messageCount: z.number().int().nonnegative().default(0),
      entries: z.array(draftSchema).min(1).max(2000),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    await ensureSeeded()

    const [batch] = await db
      .insert(importBatches)
      .values({
        filename: data.filename,
        status: 'draft',
        messageCount: data.messageCount,
        mediaCount: data.entries.reduce((n, e) => n + e.media.length, 0),
        defaultHotelId: data.defaultHotelId,
        createdById: me.id,
      })
      .returning({ id: importBatches.id })

    // Chunked insert keeps a large export well under statement size limits.
    const rows = data.entries.map((e) => ({
      batchId: batch.id,
      sortIndex: e.sortIndex,
      reportedAt: e.reportedAt ? new Date(e.reportedAt) : null,
      rawTimestamp: e.rawTimestamp,
      sender: e.sender ?? null,
      rawText: e.rawText,
      hotelId: e.hotelId ?? null,
      area: e.area ?? null,
      roomNumber: e.roomNumber ?? null,
      title: e.title || null,
      description: e.description || null,
      priority: e.priority,
      mediaKeys: e.media as never,
      include: e.include,
      needsReview: e.needsReview,
      reviewReason: e.reviewReason ?? null,
    }))
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(importEntries).values(rows.slice(i, i + 200))
    }

    return { ok: true as const, batchId: batch.id }
  })

export const listImportBatches = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAdmin()
  await ensureSeeded()
  return db
    .select({
      id: importBatches.id,
      filename: importBatches.filename,
      status: importBatches.status,
      messageCount: importBatches.messageCount,
      mediaCount: importBatches.mediaCount,
      defaultHotel: hotels.shortName,
      createdAt: importBatches.createdAt,
      importedAt: importBatches.importedAt,
      entryCount: sql<number>`(select count(*)::int from ${importEntries} where ${importEntries.batchId} = ${importBatches.id})`,
      ticketCount: sql<number>`(select count(*)::int from ${importEntries} where ${importEntries.batchId} = ${importBatches.id} and ${importEntries.ticketId} is not null)`,
    })
    .from(importBatches)
    .leftJoin(hotels, eq(hotels.id, importBatches.defaultHotelId))
    .orderBy(desc(importBatches.createdAt))
    .limit(20)
})

export const fetchImportBatch = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const rows = await db
      .select({
        id: importBatches.id,
        filename: importBatches.filename,
        status: importBatches.status,
        messageCount: importBatches.messageCount,
        mediaCount: importBatches.mediaCount,
        defaultHotelId: importBatches.defaultHotelId,
        createdAt: importBatches.createdAt,
        importedAt: importBatches.importedAt,
      })
      .from(importBatches)
      .where(eq(importBatches.id, data.id))
      .limit(1)
    if (!rows.length) return null

    const entries = await db
      .select()
      .from(importEntries)
      .where(eq(importEntries.batchId, data.id))
      .orderBy(asc(importEntries.sortIndex))
    return { batch: rows[0], entries }
  })

export const updateImportEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number().int().positive(),
      hotelId: z.number().int().positive().nullable().optional(),
      area: z.enum(areaValues).nullable().optional(),
      roomNumber: z.string().trim().max(20).nullable().optional(),
      title: z.string().trim().max(160).optional(),
      description: z.string().trim().max(8000).optional(),
      priority: z.enum(priorityValues).optional(),
      include: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    const { id, ...patch } = data
    const rows = await db
      .select({ batchStatus: importBatches.status })
      .from(importEntries)
      .innerJoin(importBatches, eq(importBatches.id, importEntries.batchId))
      .where(eq(importEntries.id, id))
      .limit(1)
    if (!rows.length) return { ok: false as const, error: 'Eintrag nicht gefunden.' }
    if (rows[0].batchStatus !== 'draft') return { ok: false as const, error: 'Dieser Import ist abgeschlossen.' }

    const next: Record<string, unknown> = { ...patch }
    // Re-evaluate the "Zuordnung prüfen" flag after a manual correction.
    const merged = await db.select().from(importEntries).where(eq(importEntries.id, id)).limit(1)
    const e = { ...merged[0], ...patch }
    const reasons: Array<string> = []
    if (!e.hotelId) reasons.push('Hotel unklar')
    if (!e.area) reasons.push('Bereich unklar')
    if (e.area === 'zimmer' && !e.roomNumber) reasons.push('Zimmernummer fehlt')
    if (!e.title?.trim()) reasons.push('Titel fehlt')
    const needsReview = reasons.length > 0
    const reviewReason = reasons.length ? reasons.join(' · ') : null
    next.needsReview = needsReview
    next.reviewReason = reviewReason

    await db.update(importEntries).set(next).where(eq(importEntries.id, id))
    return { ok: true as const, needsReview, reviewReason }
  })

export const setAllEntriesIncluded = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ batchId: z.number().int().positive(), include: z.boolean() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.update(importEntries).set({ include: data.include }).where(eq(importEntries.batchId, data.batchId))
    return { ok: true as const }
  })

/** Turns the reviewed preview rows into real tickets. Nothing is deleted. */
export const commitImport = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ batchId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    const batchRows = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, data.batchId))
      .limit(1)
    const batch = batchRows[0]
    if (!batch) return { ok: false as const, error: 'Import nicht gefunden.' }
    if (batch.status === 'imported') return { ok: false as const, error: 'Dieser Import wurde bereits ausgeführt.' }

    const entries = await db
      .select()
      .from(importEntries)
      .where(and(eq(importEntries.batchId, data.batchId), eq(importEntries.include, true)))
      .orderBy(asc(importEntries.sortIndex))

    let created = 0
    let flagged = 0

    for (const entry of entries) {
      if (entry.ticketId) continue
      const hotelId = entry.hotelId ?? batch.defaultHotelId
      if (!hotelId) continue

      const needsReview = entry.needsReview || !entry.hotelId || !entry.area
      const reportedAt = entry.reportedAt ?? new Date()
      const title = (entry.title || entry.rawText || 'Meldung aus WhatsApp').slice(0, 140)

      const [ticket] = await db
        .insert(tickets)
        .values({
          hotelId,
          area: entry.area ?? 'sonstiges',
          roomNumber: entry.roomNumber || null,
          title,
          description: entry.description || entry.rawText || '',
          priority: entry.priority,
          status: 'offen',
          createdById: null,
          source: 'whatsapp',
          needsReview,
          externalAuthor: entry.sender,
          reportedAt,
          createdAt: reportedAt,
          updatedAt: new Date(),
        })
        .returning({ id: tickets.id })

      await ensureRoom(hotelId, entry.roomNumber ?? undefined)

      const media = (entry.mediaKeys ?? []) as Array<{ key: string; name: string; mimeType: string; size: number }>
      const images = media.filter((m) => m.mimeType.startsWith('image/'))
      if (images.length) {
        await db.insert(ticketPhotos).values(
          images.map((m) => ({
            ticketId: ticket.id,
            blobKey: m.key,
            phase: 'before',
            mimeType: m.mimeType,
            byteSize: m.size,
            originalName: m.name || null,
            uploadedById: me.id,
          })),
        )
      }

      if (entry.rawText?.trim()) {
        await db.insert(ticketComments).values({
          ticketId: ticket.id,
          userId: null,
          authorName: entry.sender ? `${entry.sender} (WhatsApp)` : 'WhatsApp',
          body: entry.rawText,
          createdAt: reportedAt,
        })
      }

      await logEvent(
        ticket.id,
        me,
        'imported',
        `Aus WhatsApp-Export „${batch.filename}“ importiert${entry.sender ? ` · Absender: ${entry.sender}` : ''}`,
        { batchId: batch.id, rawTimestamp: entry.rawTimestamp },
        reportedAt,
      )

      await db.update(importEntries).set({ ticketId: ticket.id }).where(eq(importEntries.id, entry.id))
      created += 1
      if (needsReview) flagged += 1
    }

    await db
      .update(importBatches)
      .set({ status: 'imported', importedAt: new Date() })
      .where(eq(importBatches.id, data.batchId))

    return { ok: true as const, created, flagged, skipped: entries.length - created }
  })

export const discardImportBatch = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    // The preview is dropped; already-created tickets and uploaded media stay.
    await db.update(importBatches).set({ status: 'discarded' }).where(eq(importBatches.id, data.id))
    return { ok: true as const }
  })
