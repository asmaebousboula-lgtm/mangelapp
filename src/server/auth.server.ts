import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, ne, or, sql } from 'drizzle-orm'
import { getCookie, setCookie, deleteCookie, getRequestHeader } from '@tanstack/react-start/server'
import { db, ensureSeeded } from './db.server.js'
import { sessions, users } from '../../db/schema.js'

export const SESSION_COOKIE = 'hdt_session'

/**
 * Sessions are long-lived and slide forward on use, so a signed-in device stays signed in
 * until the person logs out or an admin deactivates the account. The absolute window only
 * ever expires devices that stopped being used altogether — which is also what makes the
 * cookie safe to persist inside the Capacitor webviews, where there is no "close the
 * browser" moment to fall back on.
 */
const SESSION_DAYS = 180

/** Don't write to the sessions table on every single request. */
const RENEW_AFTER_MS = 12 * 3600_000

/* ---------------------------------------------------------------- passwords */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, 'base64url')
  const actual = scryptSync(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/* ----------------------------------------------------------------- sessions */

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * `sameSite: 'lax'` keeps the cookie attached when the QR link is opened as a top-level
 * navigation, and it is a first-party cookie in the native apps too because the webviews
 * load the deployed site itself rather than a local bundle.
 */
const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  }) as const

export async function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400_000),
    userAgent: getRequestHeader('user-agent')?.slice(0, 250) ?? null,
    lastSeenAt: now,
  })
  setCookie(SESSION_COOKIE, token, cookieOptions())
  return token
}

export async function destroyCurrentSession() {
  const token = getCookie(SESSION_COOKIE)
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  deleteCookie(SESSION_COOKIE, { path: '/' })
}

/** Signs every device of an account out. Used on deactivation, deletion and password reset. */
export async function revokeUserSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** Keeps the device that triggered the change signed in, drops all the others. */
export async function revokeOtherSessions(userId: number) {
  const token = getCookie(SESSION_COOKIE)
  const keep = token ? hashToken(token) : null
  await db
    .delete(sessions)
    .where(keep ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, keep)) : eq(sessions.userId, userId))
}

export type SessionUser = {
  id: number
  email: string | null
  username: string | null
  firstName: string
  lastName: string
  role: string
  status: string
  hotelId: number | null
  mustChangePassword: boolean
}

/** Resolves the signed-in user, or null. Never throws for anonymous visitors. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  await ensureSeeded()
  const tokenHash = hashToken(token)
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      hotelId: users.hotelId,
      mustChangePassword: users.mustChangePassword,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  // A deactivated or deleted account loses access on its very next request, even on a
  // device that is still holding a valid cookie.
  if (row.status !== 'active') return null

  const { lastSeenAt, ...user } = row
  if (Date.now() - new Date(lastSeenAt).getTime() > RENEW_AFTER_MS) await slideSession(tokenHash)
  return user
}

/**
 * Pushes the expiry of an actively used device back out to the full window. Wrapped in a
 * try/catch because `currentUser()` also runs for streamed responses whose headers may
 * already be on the wire — a session that could not be extended is not worth an error page.
 */
async function slideSession(tokenHash: string) {
  try {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) })
      .where(eq(sessions.tokenHash, tokenHash))
    const token = getCookie(SESSION_COOKIE)
    if (token) setCookie(SESSION_COOKIE, token, cookieOptions())
  } catch {
    // Keep serving the request; the session stays valid until its current expiry.
  }
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new AuthError('Nicht angemeldet.', 401)
  return user
}

export async function requireRole(...roles: Array<string>): Promise<SessionUser> {
  const user = await requireUser()
  if (!roles.includes(user.role)) throw new AuthError('Keine Berechtigung für diese Aktion.', 403)
  return user
}

export const requireAdmin = () => requireRole('admin')

/** True while no account exists at all — unlocks the one-time /setup page. */
export async function needsBootstrap() {
  await ensureSeeded()
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  return rows.length === 0
}

/**
 * Looks an account up by e-mail address *or* username, so employees without a company
 * mailbox can sign in as well. Deliberately ignores `status`: the caller verifies the
 * password first and only then reports a deactivated account, which keeps the "wrong
 * credentials" answer identical for every unknown login.
 */
export async function findUserByIdentifier(identifier: string) {
  const needle = identifier.trim().toLowerCase()
  if (!needle) return null
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(sql`lower(${users.email})`, needle), eq(sql`lower(${users.username})`, needle)))
    .limit(1)
  return rows[0] ?? null
}

export function newInviteCode() {
  // Human-readable, unambiguous alphabet so a code can also be typed by hand.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(10)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function inviteTokenHash(token: string) {
  return hashToken(token)
}

export function newInviteToken() {
  return randomBytes(24).toString('base64url')
}
