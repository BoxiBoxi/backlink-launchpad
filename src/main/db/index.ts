import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { join } from 'node:path'
import * as schema from './schema'
import { CATALOG_SEED } from '@core/catalogSeed'

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

  const count = raw.prepare('SELECT COUNT(*) AS n FROM sites').get() as { n: number }
  const seeded = raw.prepare("SELECT value FROM settings WHERE key = 'catalogSeeded'").get()
  if (count.n === 0 && !seeded) {
    db.insert(schema.sites)
      .values(CATALOG_SEED.map((s) => ({ ...s, topics: JSON.stringify(s.topics) })))
      .run()
    raw.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('catalogSeeded', '1')").run()
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
