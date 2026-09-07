import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/** Hotels of the group. Seeded on first boot, extendable from the admin area. */
export const hotels = pgTable(
  'hotels',
  {
    id: serial().primaryKey(),
    slug: text().notNull(),
    name: text().notNull(),
    shortName: text('short_name').notNull(),
    sortOrder: integer('sort_order').notNull().default(100),
    active: boolean().notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('hotels_slug_key').on(t.slug)],
)

/**
 * Staff accounts — one permanent account per employee. Roles: admin | technik | rezeption.
 *
 * Sign-in works with either `email` or `username`, so colleagues without a company mailbox
 * can still have their own account. At least one of the two is always set (enforced in
 * `admin.functions.ts`); both are stored lower-cased and are unique where present.
 */
export const users = pgTable(
  'users',
  {
    id: serial().primaryKey(),
    email: text(),
    /** Short login handle, e.g. "m.mustermann". Alternative to the e-mail address. */
    username: text(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text().notNull().default('rezeption'),
    /** active | inactive (deactivated by an admin) | deleted (archived, keeps attribution) */
    status: text().notNull().default('active'),
    /** Set when an admin hands out a password, cleared once the employee picks their own. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    /** Optional home hotel. NULL means the user works across all hotels. */
    hotelId: integer('hotel_id').references(() => hotels.id),
    phone: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), uniqueIndex('users_username_key').on(t.username)],
)

/**
 * Opaque server-side sessions; the cookie only carries a random token.
 *
 * `expiresAt` slides forward while a device keeps being used (see `auth.server.ts`), so a
 * signed-in employee stays signed in until they log out or the account is deactivated.
 */
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

/**
 * QR-code invitations. Used for onboarding only — never for day-to-day sign-in.
 *
 * `purpose` decides what the QR does:
 *   activation — the employee picks their own password for the account `userId` points at
 *   device     — signs the employee behind `userId` in on one additional device
 *   signup     — legacy role-based self-registration (kept so older QR codes stay valid)
 */
export const invites = pgTable(
  'invites',
  {
    id: serial().primaryKey(),
    code: text().notNull(),
    tokenHash: text('token_hash').notNull(),
    /** activation | device | signup */
    purpose: text().notNull().default('signup'),
    /** The account this QR belongs to. NULL only for legacy `signup` invitations. */
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull().default('rezeption'),
    hotelId: integer('hotel_id').references(() => hotels.id),
    label: text(),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invites_token_hash_key').on(t.tokenHash),
    index('invites_code_idx').on(t.code),
    index('invites_user_idx').on(t.userId),
  ],
)

/** Rooms are created on demand the first time a ticket references them. */
export const rooms = pgTable(
  'rooms',
  {
    id: serial().primaryKey(),
    hotelId: integer('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    number: text().notNull(),
    floor: text(),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rooms_hotel_number_key').on(t.hotelId, t.number)],
)

/** One technical report = one ticket. */
export const tickets = pgTable(
  'tickets',
  {
    id: serial().primaryKey(),
    hotelId: integer('hotel_id')
      .notNull()
      .references(() => hotels.id),
    /** zimmer | lobby | rezeption | restaurant | kueche | wc | lager | fitness | flur | aufzug | technikraum | aussen | sonstiges */
    area: text().notNull(),
    roomNumber: text('room_number'),
    title: text().notNull(),
    description: text().notNull().default(''),
    /** normal | dringend | sehr_dringend */
    priority: text().notNull().default('normal'),
    /** offen | in_bearbeitung | erledigt */
    status: text().notNull().default('offen'),
    createdById: integer('created_by_id').references(() => users.id),
    assignedToId: integer('assigned_to_id').references(() => users.id),
    /** app | whatsapp */
    source: text().notNull().default('app'),
    /** Set for imports whose hotel/room/area could not be resolved unambiguously. */
    needsReview: boolean('needs_review').notNull().default(false),
    externalAuthor: text('external_author'),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('tickets_hotel_idx').on(t.hotelId),
    index('tickets_status_idx').on(t.status),
    index('tickets_room_idx').on(t.hotelId, t.roomNumber),
    index('tickets_reported_idx').on(t.reportedAt),
  ],
)

/** Photos, split into before/after repair. Binary data lives in Netlify Blobs. */
export const ticketPhotos = pgTable(
  'ticket_photos',
  {
    id: serial().primaryKey(),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    blobKey: text('blob_key').notNull(),
    /** before | after */
    phase: text().notNull().default('before'),
    mimeType: text('mime_type').notNull().default('image/jpeg'),
    byteSize: integer('byte_size').notNull().default(0),
    originalName: text('original_name'),
    uploadedById: integer('uploaded_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ticket_photos_ticket_idx').on(t.ticketId)],
)

export const ticketComments = pgTable(
  'ticket_comments',
  {
    id: serial().primaryKey(),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    /** Used for imported WhatsApp authors that have no account. */
    authorName: text('author_name'),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ticket_comments_ticket_idx').on(t.ticketId)],
)

/** Append-only activity trail per ticket. */
export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: serial().primaryKey(),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    actorName: text('actor_name'),
    /** created | claimed | status | comment | photo | edited | imported | released */
    type: text().notNull(),
    message: text().notNull(),
    meta: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ticket_events_ticket_idx').on(t.ticketId)],
)

/** In-app notifications; the base for later web-push delivery. */
export const notifications = pgTable(
  'notifications',
  {
    id: serial().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    /** urgent_ticket | assigned | comment | status */
    type: text().notNull(),
    title: text().notNull(),
    body: text().notNull().default(''),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt)],
)

/** One uploaded WhatsApp export. */
export const importBatches = pgTable('import_batches', {
  id: serial().primaryKey(),
  filename: text().notNull(),
  /** draft | imported | discarded */
  status: text().notNull().default('draft'),
  messageCount: integer('message_count').notNull().default(0),
  mediaCount: integer('media_count').notNull().default(0),
  defaultHotelId: integer('default_hotel_id').references(() => hotels.id),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  importedAt: timestamp('imported_at', { withTimezone: true }),
})

/** Editable preview rows of an import; kept after import for traceability. */
export const importEntries = pgTable(
  'import_entries',
  {
    id: serial().primaryKey(),
    batchId: integer('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    sortIndex: integer('sort_index').notNull().default(0),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    rawTimestamp: text('raw_timestamp'),
    sender: text(),
    rawText: text().notNull().default(''),
    hotelId: integer('hotel_id').references(() => hotels.id),
    area: text(),
    roomNumber: text('room_number'),
    title: text(),
    description: text(),
    priority: text().notNull().default('normal'),
    /** Blob keys of the media attached to this message. */
    mediaKeys: jsonb('media_keys').$type<Array<{ key: string; name: string; mimeType: string; size: number }>>(),
    include: boolean().notNull().default(true),
    needsReview: boolean('needs_review').notNull().default(false),
    reviewReason: text('review_reason'),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('import_entries_batch_idx').on(t.batchId, t.sortIndex)],
)

/** Small key/value store for admin-configurable app behaviour. */
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedById: integer('updated_by_id').references(() => users.id),
})
