import { createServerFn } from '@tanstack/react-start'
import { aliasedTable, and, asc, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import QRCode from 'qrcode'
import { getRequestHost, getRequestProtocol } from '@tanstack/react-start/server'
import { db, ensureSeeded } from './db.server.js'
import {
  appSettings,
  hotels,
  importBatches,
  invites,
  sessions,
  ticketComments,
  ticketEvents,
  ticketPhotos,
  tickets,
  users,
} from '../../db/schema.js'
import {
  hashPassword,
  inviteTokenHash,
  newInviteCode,
  newInviteToken,
  requireAdmin,
  revokeUserSessions,
} from './auth.server.js'
import { DEFAULT_CONFIG, getConfig, saveConfig } from './settings.server.js'
import { fullName } from '../lib/format.js'

const roleEnum = z.enum(['admin', 'technik', 'rezeption'])

/** Admins may switch an account between these two; `deleted` only happens via deleteStaff. */
const statusEnum = z.enum(['active', 'inactive'])

const nameSchema = z.string().trim().min(2, 'Bitte den vollständigen Namen eingeben.').max(60)
const emailSchema = z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail-Adresse eingeben.')
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,29}$/,
    'Benutzername: 3–30 Zeichen, nur a–z, 0–9, Punkt, Unterstrich oder Bindestrich.',
  )
const passwordSchema = z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen haben.')
const phoneSchema = z.string().trim().max(40)

/**
 * Both login handles are unique where present. Checked before writing so the admin gets a
 * German message instead of a constraint violation.
 */
async function loginHandleTaken(email: string | null, username: string | null, exceptId?: number) {
  const conditions = [
    email ? eq(sql`lower(${users.email})`, email) : null,
    username ? eq(sql`lower(${users.username})`, username) : null,
  ].filter(Boolean)
  if (!conditions.length) return null
  const rows = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(
      exceptId
        ? and(or(...(conditions as Array<any>)), ne(users.id, exceptId))
        : or(...(conditions as Array<any>)),
    )
    .limit(1)
  const clash = rows[0]
  if (!clash) return null
  return clash.email && clash.email === email
    ? 'Diese E-Mail-Adresse wird bereits verwendet.'
    : 'Dieser Benutzername wird bereits verwendet.'
}

function siteOrigin() {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  return `${getRequestProtocol()}://${getRequestHost()}`
}

/* ------------------------------------------------------------------- users */

export const listStaff = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAdmin()
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      hotelId: users.hotelId,
      hotelName: hotels.shortName,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      deactivatedAt: users.deactivatedAt,
      createdTickets: sql<number>`(select count(*)::int from ${tickets} where ${tickets.createdById} = ${users.id})`,
      openAssigned: sql<number>`(select count(*)::int from ${tickets} where ${tickets.assignedToId} = ${users.id} and ${tickets.status} <> 'erledigt')`,
      // How many devices are currently signed in — the admin's handle on "stays logged in".
      activeDevices: sql<number>`(select count(*)::int from ${sessions} where ${sessions.userId} = ${users.id} and ${sessions.expiresAt} > now())`,
      // Whether an unused activation/device QR is still outstanding for this account.
      openQrCodes: sql<number>`(select count(*)::int from ${invites} where ${invites.userId} = ${users.id} and ${invites.revokedAt} is null and ${invites.expiresAt} > now() and ${invites.usedCount} < ${invites.maxUses})`,
    })
    .from(users)
    .leftJoin(hotels, eq(hotels.id, users.hotelId))
    // active → inactive → deleted, then alphabetical; the status strings themselves would
    // sort 'deleted' in front of 'inactive'.
    .orderBy(
      sql`case ${users.status} when 'active' then 0 when 'deleted' then 2 else 1 end`,
      asc(users.firstName),
      asc(users.lastName),
    )
  return rows
})

/**
 * Creates a permanent account for one employee. The admin sets an initial password and, by
 * default, `mustChangePassword`, so the employee replaces it on first sign-in — or skips the
 * password entirely by scanning an activation QR (see `createStaffQr`).
 */
export const createStaff = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      firstName: nameSchema,
      lastName: nameSchema,
      email: emailSchema.nullable().optional(),
      username: usernameSchema.nullable().optional(),
      phone: phoneSchema.nullable().optional(),
      password: passwordSchema,
      role: roleEnum,
      hotelId: z.number().int().positive().nullable().optional(),
      mustChangePassword: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    await ensureSeeded()
    const email = data.email ?? null
    const username = data.username ?? null
    if (!email && !username) {
      return { ok: false as const, error: 'Bitte eine E-Mail-Adresse oder einen Benutzernamen angeben.' }
    }
    const taken = await loginHandleTaken(email, username)
    if (taken) return { ok: false as const, error: taken }

    const [created] = await db
      .insert(users)
      .values({
        email,
        username,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? null,
        passwordHash: hashPassword(data.password),
        role: data.role,
        hotelId: data.hotelId ?? null,
        status: 'active',
        mustChangePassword: data.mustChangePassword,
      })
      .returning({ id: users.id })
    return { ok: true as const, id: created.id }
  })

/** Edits an account. Deactivating it signs every device of that person out right away. */
export const updateStaff = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number().int().positive(),
      firstName: nameSchema.optional(),
      lastName: nameSchema.optional(),
      email: emailSchema.nullable().optional(),
      username: usernameSchema.nullable().optional(),
      phone: phoneSchema.nullable().optional(),
      role: roleEnum.optional(),
      status: statusEnum.optional(),
      hotelId: z.number().int().positive().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    if (data.id === me.id && data.role && data.role !== 'admin') {
      return { ok: false as const, error: 'Die eigene Admin-Rolle kann nicht entfernt werden.' }
    }
    if (data.id === me.id && data.status === 'inactive') {
      return { ok: false as const, error: 'Das eigene Konto kann nicht deaktiviert werden.' }
    }

    const rows = await db
      .select({ email: users.email, username: users.username, status: users.status, role: users.role })
      .from(users)
      .where(eq(users.id, data.id))
      .limit(1)
    const current = rows[0]
    if (!current) return { ok: false as const, error: 'Konto nicht gefunden.' }
    if (current.status === 'deleted') {
      return { ok: false as const, error: 'Gelöschte Konten können nicht mehr bearbeitet werden.' }
    }

    const { id, ...patch } = data
    const email = 'email' in data ? (data.email ?? null) : current.email
    const username = 'username' in data ? (data.username ?? null) : current.username
    if (!email && !username) {
      return { ok: false as const, error: 'Bitte eine E-Mail-Adresse oder einen Benutzernamen angeben.' }
    }
    const taken = await loginHandleTaken(email, username, id)
    if (taken) return { ok: false as const, error: taken }

    // Never lock the group out of its own admin area.
    if ((data.role && data.role !== 'admin') || data.status === 'inactive') {
      if (current.role === 'admin' && !(await hasAnotherActiveAdmin(id))) {
        return { ok: false as const, error: 'Es muss mindestens ein aktiver Admin bestehen bleiben.' }
      }
    }

    await db
      .update(users)
      .set({
        ...patch,
        ...('email' in data ? { email } : {}),
        ...('username' in data ? { username } : {}),
        ...(data.status ? { deactivatedAt: data.status === 'inactive' ? new Date() : null } : {}),
      })
      .where(eq(users.id, id))

    if (data.status === 'inactive') await revokeUserSessions(id)
    return { ok: true as const }
  })

/** Hands out a new password. Every signed-in device has to authenticate again afterwards. */
export const resetStaffPassword = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number().int().positive(),
      password: passwordSchema,
      mustChangePassword: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    await db
      .update(users)
      .set({ passwordHash: hashPassword(data.password), mustChangePassword: data.mustChangePassword })
      .where(and(eq(users.id, data.id), ne(users.status, 'deleted')))
    await revokeUserSessions(data.id)
    return { ok: true as const }
  })

/** Signs one employee out on all of their devices without touching the password. */
export const revokeStaffSessions = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    await revokeUserSessions(data.id)
    return { ok: true as const }
  })

async function hasAnotherActiveAdmin(exceptId: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), ne(users.id, exceptId)))
  return (row?.n ?? 0) > 0
}

/** Everything that would lose its author if the row were physically removed. */
async function historyCount(userId: number) {
  const rows = await db
    .select({
      n: sql<number>`(
      (select count(*) from ${tickets} where ${tickets.createdById} = ${userId} or ${tickets.assignedToId} = ${userId})
      + (select count(*) from ${ticketPhotos} where ${ticketPhotos.uploadedById} = ${userId})
      + (select count(*) from ${ticketComments} where ${ticketComments.userId} = ${userId})
      + (select count(*) from ${ticketEvents} where ${ticketEvents.userId} = ${userId})
      + (select count(*) from ${importBatches} where ${importBatches.createdById} = ${userId})
    )::int`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0]?.n ?? 0
}

/**
 * Deletes an account. A person who never worked in the app is removed for real; as soon as
 * there are tickets, photos, comments or events behind the name, the row is archived instead
 * (`status = 'deleted'`): login destroyed, e-mail and username released for re-use, but the
 * name kept so every entry stays attributed to whoever made it.
 */
export const deleteStaff = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    if (data.id === me.id) return { ok: false as const, error: 'Das eigene Konto kann nicht gelöscht werden.' }

    const rows = await db
      .select({ role: users.role, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, data.id))
      .limit(1)
    const person = rows[0]
    if (!person) return { ok: false as const, error: 'Konto nicht gefunden.' }
    if (person.role === 'admin' && !(await hasAnotherActiveAdmin(data.id))) {
      return { ok: false as const, error: 'Es muss mindestens ein aktiver Admin bestehen bleiben.' }
    }

    // Sessions and notifications cascade; pending QR codes must not survive the account.
    await revokeUserSessions(data.id)
    await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.userId, data.id), isNull(invites.revokedAt)))

    if ((await historyCount(data.id)) === 0) {
      // No attribution to protect — drop the references that have no ON DELETE rule, then
      // remove the row entirely.
      await db.update(invites).set({ createdById: null }).where(eq(invites.createdById, data.id))
      await db.update(importBatches).set({ createdById: null }).where(eq(importBatches.createdById, data.id))
      await db.update(appSettings).set({ updatedById: null }).where(eq(appSettings.updatedById, data.id))
      await db.delete(users).where(eq(users.id, data.id))
      return { ok: true as const, mode: 'removed' as const, name: fullName(person) }
    }

    await db
      .update(users)
      .set({
        status: 'deleted',
        email: null,
        username: null,
        // Unusable value: the hash format check in verifyPassword rejects it outright.
        passwordHash: `deleted$${newInviteToken()}`,
        mustChangePassword: false,
        deactivatedAt: new Date(),
      })
      .where(eq(users.id, data.id))
    return { ok: true as const, mode: 'archived' as const, name: fullName(person) }
  })

/* ----------------------------------------------------------------- invites */

/**
 * Builds a QR code for one specific account. This is the *only* way new QR codes are
 * created: they onboard a person or an additional device and are then used up. Nobody ever
 * needs one for the daily login.
 */
export const createStaffQr = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      userId: z.number().int().positive(),
      purpose: z.enum(['activation', 'device']),
      validHours: z.number().int().min(1).max(720).default(48),
    }),
  )
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        hotelId: users.hotelId,
      })
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1)
    const person = rows[0]
    if (!person) return { ok: false as const, error: 'Konto nicht gefunden.' }
    if (person.status !== 'active') {
      return { ok: false as const, error: 'Für ein deaktiviertes Konto kann kein QR-Code erstellt werden.' }
    }

    // A fresh code replaces any outstanding one of the same kind for this person.
    await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.userId, person.id), eq(invites.purpose, data.purpose), isNull(invites.revokedAt)))

    const token = newInviteToken()
    const code = newInviteCode()
    const expiresAt = new Date(Date.now() + data.validHours * 3600_000)

    const [invite] = await db
      .insert(invites)
      .values({
        code,
        tokenHash: inviteTokenHash(token),
        purpose: data.purpose,
        userId: person.id,
        role: person.role,
        hotelId: person.hotelId,
        label: fullName(person),
        maxUses: 1,
        expiresAt,
        createdById: me.id,
      })
      .returning({ id: invites.id })

    const url = `${siteOrigin()}/einladung/${token}`
    const qrSvg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#14161a', light: '#ffffff' },
    })

    return {
      ok: true as const,
      id: invite.id,
      purpose: data.purpose,
      personName: fullName(person),
      url,
      code,
      qrSvg,
      expiresAt,
    }
  })

export const listInvites = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAdmin()
  const person = aliasedTable(users, 'invite_person')
  const rows = await db
    .select({
      id: invites.id,
      code: invites.code,
      purpose: invites.purpose,
      userId: invites.userId,
      personName: sql<string | null>`nullif(trim(coalesce(${person.firstName}, '') || ' ' || coalesce(${person.lastName}, '')), '')`,
      role: invites.role,
      label: invites.label,
      hotelName: hotels.shortName,
      maxUses: invites.maxUses,
      usedCount: invites.usedCount,
      expiresAt: invites.expiresAt,
      revokedAt: invites.revokedAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .leftJoin(hotels, eq(hotels.id, invites.hotelId))
    .leftJoin(person, eq(person.id, invites.userId))
    .orderBy(desc(invites.createdAt))
    .limit(40)

  const now = Date.now()
  return rows.map((r) => ({
    ...r,
    state: r.revokedAt
      ? ('revoked' as const)
      : r.usedCount >= r.maxUses
        ? ('used' as const)
        : new Date(r.expiresAt).getTime() < now
          ? ('expired' as const)
          : ('active' as const),
  }))
})

export const revokeInvite = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireAdmin()
    await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.id, data.id), isNull(invites.revokedAt)))
    return { ok: true as const }
  })

export const countOpenInvites = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAdmin()
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invites)
    .where(and(isNull(invites.revokedAt), gt(invites.expiresAt, new Date()), sql`${invites.usedCount} < ${invites.maxUses}`))
  return row?.n ?? 0
})

/* ------------------------------------------------------------------ hotels */

export const listAllHotels = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAdmin()
  await ensureSeeded()
  return db
    .select({
      id: hotels.id,
      slug: hotels.slug,
      name: hotels.name,
      shortName: hotels.shortName,
      sortOrder: hotels.sortOrder,
      active: hotels.active,
      ticketCount: sql<number>`(select count(*)::int from ${tickets} where ${tickets.hotelId} = ${hotels.id})`,
    })
    .from(hotels)
    .orderBy(asc(hotels.sortOrder), asc(hotels.name))
})

export const upsertHotel = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number().int().positive().optional(),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9-]{2,30}$/, 'Kürzel: nur Kleinbuchstaben, Zahlen und Bindestriche.'),
      name: z.string().trim().min(3).max(80),
      shortName: z.string().trim().min(2).max(30),
      sortOrder: z.number().int().min(0).max(999).default(100),
      active: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin()
    if (data.id) {
      await db
        .update(hotels)
        .set({ slug: data.slug, name: data.name, shortName: data.shortName, sortOrder: data.sortOrder, active: data.active })
        .where(eq(hotels.id, data.id))
      return { ok: true as const, id: data.id }
    }
    const existing = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.slug, data.slug)).limit(1)
    if (existing.length) return { ok: false as const, error: 'Dieses Kürzel wird bereits verwendet.' }
    const [created] = await db.insert(hotels).values(data).returning({ id: hotels.id })
    return { ok: true as const, id: created.id }
  })

/* ---------------------------------------------------------------- settings */

export const fetchSettings = createServerFn({ method: 'POST' }).handler(async () => {
  await requireAdmin()
  return { config: await getConfig(), defaults: DEFAULT_CONFIG }
})

export const saveSettings = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requireAfterPhoto: z.boolean().optional(), notifyUrgent: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const me = await requireAdmin()
    const config = await saveConfig(data, me.id)
    return { ok: true as const, config }
  })
