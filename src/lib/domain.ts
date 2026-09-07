/**
 * Shared vocabulary of the app. Everything user-facing is German; the stored
 * values are stable slugs so labels can change without a migration.
 */

export const APP_NAME = 'HD HOTELS'
export const APP_SUBTITLE = 'TECHNIK'

export type Role = 'admin' | 'technik' | 'rezeption'

export const ROLES: Array<{ value: Role; label: string; hint: string }> = [
  { value: 'admin', label: 'Admin', hint: 'Vollzugriff, Benutzer- und Hotelverwaltung' },
  { value: 'technik', label: 'Technik', hint: 'Meldungen übernehmen, bearbeiten, abschließen' },
  { value: 'rezeption', label: 'Rezeption', hint: 'Meldungen erstellen und Status verfolgen' },
]

export const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role

/**
 * Account lifecycle. `inactive` is an admin deactivation (login blocked, everything the
 * person reported stays attributed to them); `deleted` is an archived account whose login
 * was destroyed but whose name is still needed to label its ticket history.
 */
export type UserStatus = 'active' | 'inactive' | 'deleted'

export const USER_STATUSES: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Deaktiviert' },
  { value: 'deleted', label: 'Gelöscht' },
]

/** Accounts stored before the rename still carry 'blocked'; treat it as a deactivation. */
export const normalizeStatus = (status: string): UserStatus =>
  status === 'active' ? 'active' : status === 'deleted' ? 'deleted' : 'inactive'

export const userStatusLabel = (status: string) =>
  USER_STATUSES.find((s) => s.value === normalizeStatus(status))?.label ?? status

export const canSignIn = (status: string) => normalizeStatus(status) === 'active'

/** What the person types into the login form — either is enough. */
export const loginName = (u: { username?: string | null; email?: string | null }) =>
  u.username || u.email || '—'

/** QR codes exist for onboarding only, never for the daily login. */
export type InvitePurpose = 'activation' | 'device' | 'signup'

export const INVITE_PURPOSES: Array<{ value: InvitePurpose; label: string; hint: string }> = [
  {
    value: 'activation',
    label: 'Erstanmeldung',
    hint: 'Mitarbeiter vergibt beim Scannen sein eigenes Passwort.',
  },
  {
    value: 'device',
    label: 'Neues Gerät',
    hint: 'Meldet das gescannte Gerät einmalig an — ohne Passworteingabe.',
  },
  {
    value: 'signup',
    label: 'Registrierung',
    hint: 'Älterer QR-Code, mit dem sich jemand selbst ein Konto anlegt.',
  },
]

export const invitePurposeLabel = (v: string) => INVITE_PURPOSES.find((p) => p.value === v)?.label ?? v

export type TicketStatus = 'offen' | 'in_bearbeitung' | 'erledigt'

export const STATUSES: Array<{ value: TicketStatus; label: string }> = [
  { value: 'offen', label: 'Offen' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung' },
  { value: 'erledigt', label: 'Erledigt' },
]

export const statusLabel = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v

export type Priority = 'normal' | 'dringend' | 'sehr_dringend'

export const PRIORITIES: Array<{ value: Priority; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'dringend', label: 'Dringend' },
  { value: 'sehr_dringend', label: 'Sehr dringend' },
]

export const priorityLabel = (v: string) => PRIORITIES.find((p) => p.value === v)?.label ?? v
export const priorityRank = (v: string) => ({ sehr_dringend: 0, dringend: 1, normal: 2 })[v] ?? 3

export const AREAS = [
  { value: 'zimmer', label: 'Zimmer' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'rezeption', label: 'Rezeption' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'kueche', label: 'Küche' },
  { value: 'wc', label: 'WC' },
  { value: 'lager', label: 'Lager' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'flur', label: 'Flur' },
  { value: 'aufzug', label: 'Aufzug' },
  { value: 'technikraum', label: 'Technikraum' },
  { value: 'aussen', label: 'Außenbereich' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const

export type Area = (typeof AREAS)[number]['value']

export const areaLabel = (v: string) => AREAS.find((a) => a.value === v)?.label ?? v

/** Seeded on first boot. Further hotels can be added in the admin settings. */
export const SEED_HOTELS = [
  { slug: 'unique', name: 'Hotel Unique Dortmund', shortName: 'Unique', sortOrder: 10 },
  { slug: 'majestic', name: 'Hotel Unique Majestic', shortName: 'Majestic', sortOrder: 20 },
  { slug: 'imperial', name: 'Hotel Unique Imperial', shortName: 'Imperial', sortOrder: 30 },
  { slug: 'pearl', name: 'Hotel Unique Pearl', shortName: 'Pearl', sortOrder: 40 },
]

/** Quick-pick suggestions on the "Neue Meldung" form. */
export const PROBLEM_PRESETS = [
  'Lampe funktioniert nicht',
  'Dusche undicht',
  'Türgriff locker',
  'Fernseher funktioniert nicht',
  'Heizung defekt',
  'Waschbecken verstopft',
  'Klimaanlage laut',
  'Steckdose ohne Strom',
  'Türschloss defekt',
  'WC-Spülung läuft nach',
  'Fenster schließt nicht',
  'WLAN ohne Verbindung',
]

export const canCreateTickets = (role: string) => role === 'admin' || role === 'rezeption' || role === 'technik'
export const canWorkTickets = (role: string) => role === 'admin' || role === 'technik'
export const isAdmin = (role: string) => role === 'admin'
