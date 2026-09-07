import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { hotels } from '../../db/schema.js'
import { SEED_HOTELS } from '../lib/domain.js'

let seedPromise: Promise<void> | null = null

/**
 * Makes sure the four group hotels exist. Idempotent and cached per warm
 * instance, so it is cheap to call at the top of every read path.
 */
export function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      await db
        .insert(hotels)
        .values(SEED_HOTELS.map((h) => ({ ...h })))
        .onConflictDoNothing({ target: hotels.slug })
    })().catch((err) => {
      seedPromise = null
      throw err
    })
  }
  return seedPromise
}

export { db, sql }
