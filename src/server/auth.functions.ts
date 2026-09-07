import { createServerFn } from '@tanstack/react-start'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, ensureSeeded } from './db.server.js'
import { hotels, invites, users } from '../../db/schema.js'
import {
  createSession,
  currentUser,
  destroyCurrentSession,
  findUserByIdentifier,
  hashPassword,
  inviteTokenHash,
  needsBootstrap,
  requireUser,
  revokeOtherSessions,
  verifyPassword,
} from './auth.server.js'
import { canSignIn } from '../lib/domain.js'

const emailSchema = z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail-Adresse eingeben.')
const passwordSchema = z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen haben.')
const nameSchema = z.string().trim().min(2, 'Bitte den vollständigen Namen eingeben.').max(60)

const WRONG_CREDENTIALS = 'E-Mail/Benutzername oder Passwort ist falsch.'
const DEACTIVATED = 'Dieses Konto ist deaktiviert. Bitte den Admin kontaktieren.'

/** Session + bootstrap state for the root route. */
export const getSession = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await currentUser()
  if (user) return { user, needsBootstrap: false }
  return { user: null, needsBootstrap: await needsBootstrap() }
})

/**
 * Password login with either the e-mail address or the username. This is the only routine
 * sign-in path — QR codes are for onboarding a person or a device, never for daily use.
 */
export const login = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    await ensureSeeded()
    const user = await findUserByIdentifier(data.identifier)
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      return { ok: false as const, error: WRONG_CREDENTIALS }
    }
    if (!canSignIn(user.status)) return { ok: false as const, error: DEACTIVATED }

    await createSession(user.id)
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    return { ok: true as const, role: user.role, mustChangePassword: user.mustChangePassword }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await destroyCurrentSession()
  return { ok: true as const }
})

/** One-time bootstrap: creates the very first admin while no account exists. */
export const bootstrapAdmin = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      firstName: nameSchema,
      lastName: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    }),
  )
  .handler(async ({ data }) => {
    if (!(await needsBootstrap())) {
      return { ok: false as const, error: 'Es existiert bereits ein Konto. Bitte anmelden.' }
    }
    const [created] = await db
      .insert(users)
      .values({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: hashPassword(data.password),
        role: 'admin',
        status: 'active',
      })
      .returning({ id: users.id })
    await createSession(created.id)
    return { ok: true as const }
  })

/**
 * Loads a usable invitation together with the account it belongs to. Returns null for
 * anything revoked, expired or already used up, so callers never have to re-check that.
 */
async function loadInvite(token: string) {
  await ensureSeeded()
  const rows = await db
    .select({
      id: invites.id,
      purpose: invites.purpose,
      userId: invites.userId,
      role: invites.role,
      label: invites.label,
      hotelId: invites.hotelId,
      hotelName: hotels.name,
      maxUses: invites.maxUses,
      usedCount: invites.usedCount,
      expiresAt: invites.expiresAt,
      personFirstName: users.firstName,
      personLastName: users.lastName,
      personStatus: users.status,
      personMustChange: users.mustChangePassword,
    })
    .from(invites)
    .leftJoin(hotels, eq(hotels.id, invites.hotelId))
    .leftJoin(users, eq(users.id, invites.userId))
    .where(
      and(
        eq(invites.tokenHash, inviteTokenHash(token)),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        sql`${invites.usedCount} < ${invites.maxUses}`,
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

const INVALID_INVITE = 'Dieser QR-Code ist ungültig, abgelaufen oder bereits benutzt.'

/** Marks one use of an invitation. Returns false if someone else got there first. */
async function consumeInvite(id: number) {
  const consumed = await db
    .update(invites)
    .set({ usedCount: sql`${invites.usedCount} + 1` })
    .where(and(eq(invites.id, id), sql`${invites.usedCount} < ${invites.maxUses}`))
    .returning({ id: invites.id })
  return consumed.length > 0
}

/** Public: describes what the QR code behind this token is for. */
export const getInvite = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: z.string().min(6) }))
  .handler(async ({ data }) => {
    const invite = await loadInvite(data.token)
    if (!invite) return { valid: false as const, reason: INVALID_INVITE }
    // A QR code for an account that has meanwhile been deactivated or deleted is worthless.
    if (invite.userId && !canSignIn(invite.personStatus ?? '')) {
      return { valid: false as const, reason: 'Das zugehörige Konto ist nicht mehr aktiv.' }
    }
    return {
      valid: true as const,
      purpose: invite.purpose,
      role: invite.role,
      label: invite.label,
      hotelName: invite.hotelName,
      expiresAt: invite.expiresAt,
      remainingUses: invite.maxUses - invite.usedCount,
      personName: invite.personFirstName
        ? `${invite.personFirstName} ${invite.personLastName ?? ''}`.trim()
        : null,
    }
  })

/**
 * First-time setup of an account an admin has already created: the employee picks their own
 * password here, which also clears the "must change password" flag the admin's temporary
 * password carried. From then on they sign in with e-mail/username and password.
 */
export const activateAccount = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: z.string().min(6), password: passwordSchema }))
  .handler(async ({ data }) => {
    const invite = await loadInvite(data.token)
    if (!invite || invite.purpose !== 'activation' || !invite.userId) {
      return { ok: false as const, error: INVALID_INVITE }
    }
    if (!canSignIn(invite.personStatus ?? '')) {
      return { ok: false as const, error: 'Das zugehörige Konto ist nicht mehr aktiv.' }
    }
    // Consume first: a second scan of the same code must not be able to set a password again.
    if (!(await consumeInvite(invite.id))) return { ok: false as const, error: INVALID_INVITE }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(data.password), mustChangePassword: false, lastLoginAt: new Date() })
      .where(eq(users.id, invite.userId))
    await createSession(invite.userId)
    return { ok: true as const }
  })

/**
 * Adds one more device to an existing account. The QR code is the credential here, so it is
 * deliberately short-lived and single-use — after this the device keeps its own session and
 * never needs the code again.
 */
export const activateDevice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: z.string().min(6) }))
  .handler(async ({ data }) => {
    const invite = await loadInvite(data.token)
    if (!invite || invite.purpose !== 'device' || !invite.userId) {
      return { ok: false as const, error: INVALID_INVITE }
    }
    if (!canSignIn(invite.personStatus ?? '')) {
      return { ok: false as const, error: 'Das zugehörige Konto ist nicht mehr aktiv.' }
    }
    if (!(await consumeInvite(invite.id))) return { ok: false as const, error: INVALID_INVITE }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, invite.userId))
    await createSession(invite.userId)
    return { ok: true as const, mustChangePassword: invite.personMustChange ?? false }
  })

/**
 * Legacy self-registration behind a role-based QR code. Kept working so invitations handed
 * out before accounts became admin-managed can still be redeemed; new QR codes are always
 * bound to an account the admin created.
 */
export const acceptInvite = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      token: z.string().min(6),
      firstName: nameSchema,
      lastName: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    }),
  )
  .handler(async ({ data }) => {
    const invite = await loadInvite(data.token)
    if (!invite || invite.purpose !== 'signup') return { ok: false as const, error: INVALID_INVITE }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, data.email))
      .limit(1)
    if (existing.length) {
      return { ok: false as const, error: 'Für diese E-Mail-Adresse existiert bereits ein Konto.' }
    }

    const [created] = await db
      .insert(users)
      .values({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: hashPassword(data.password),
        role: invite.role,
        hotelId: invite.hotelId,
        status: 'active',
        lastLoginAt: new Date(),
      })
      .returning({ id: users.id, role: users.role })

    // Consume the invitation atomically so a shared QR cannot be over-used.
    if (!(await consumeInvite(invite.id))) {
      await db.delete(users).where(eq(users.id, created.id))
      return { ok: false as const, error: 'Dieser QR-Code wurde inzwischen bereits verwendet.' }
    }

    await createSession(created.id)
    return { ok: true as const, role: created.role }
  })

export const changeOwnPassword = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ current: z.string(), next: passwordSchema }))
  .handler(async ({ data }) => {
    const me = await requireUser()
    const rows = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id)).limit(1)
    if (!rows[0] || !verifyPassword(data.current, rows[0].passwordHash)) {
      return { ok: false as const, error: 'Das aktuelle Passwort ist falsch.' }
    }
    await db
      .update(users)
      .set({ passwordHash: hashPassword(data.next), mustChangePassword: false })
      .where(eq(users.id, me.id))
    // This device stays signed in; every other one has to authenticate again.
    await revokeOtherSessions(me.id)
    return { ok: true as const }
  })
