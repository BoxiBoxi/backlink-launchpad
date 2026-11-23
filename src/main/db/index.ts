import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { join } from 'node:path'
import * as schema from './schema'
import { CATALOG_SEED, CATALOG_VERSION, seedHost } from '@core/catalogSeed'

export type Db = BetterSQLite3Database<typeof schema>

let db: Db | null = null
let raw: Database.Database | null = null

export function initDb(dir: string): Db {
  const file = join(dir, 'backlinkbuilder.db')
  raw = new Database(file)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  for (const stmt of schema.MIGRATIONS) raw.exec(stmt)
  db = drizzle(raw, { schema })

  // Seed / extend the catalog once per CATALOG_VERSION. Sites are matched by hostname, so user edits are kept;
  // a site the user deleted comes back only when the version is bumped.
  const row = raw.prepare("SELECT value FROM settings WHERE key = 'catalogVersion'").get() as { value: string } | undefined
  if (Number(row?.value ?? 0) < CATALOG_VERSION) {
    const existing = new Set((raw.prepare('SELECT url FROM sites').all() as { url: string }[]).map((r) => seedHost(r.url)))
    const missing = CATALOG_SEED.filter((s) => !existing.has(seedHost(s.url)))
    if (missing.length) db.insert(schema.sites).values(missing.map((s) => ({ ...s, topics: JSON.stringify(s.topics) }))).run()
    raw.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('catalogVersion', ?)").run(String(CATALOG_VERSION))
  }
  return db
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialised')
  return db
}

export function dbFilePath(dir: string): string {
  return join(dir, 'backlinkbuilder.db')
}
