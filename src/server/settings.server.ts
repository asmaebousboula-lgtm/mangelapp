import { eq } from 'drizzle-orm'
import { db, ensureSeeded } from './db.server.js'
import { appSettings } from '../../db/schema.js'

export type AppConfig = {
  /** Require an "after repair" photo before a ticket can be closed. */
  requireAfterPhoto: boolean
  /** Notify technicians in-app when a "sehr dringend" report arrives. */
  notifyUrgent: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  requireAfterPhoto: true,
  notifyUrgent: true,
}

const KEY = 'app_config'

export async function getConfig(): Promise<AppConfig> {
  await ensureSeeded()
  const rows = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY)).limit(1)
  return { ...DEFAULT_CONFIG, ...((rows[0]?.value as Partial<AppConfig>) ?? {}) }
}

export async function saveConfig(patch: Partial<AppConfig>, userId: number) {
  const next = { ...(await getConfig()), ...patch }
  await db
    .insert(appSettings)
    .values({ key: KEY, value: next as never, updatedById: userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next as never, updatedAt: new Date(), updatedById: userId },
    })
  return next
}
