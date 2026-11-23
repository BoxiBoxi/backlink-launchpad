import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { join } from 'node:path'
import * as schema from './schema'
import { CATALOG_SEED, CATALOG_VERSION, seedKey } from '@core/catalogSeed'

export type Db = BetterSQLite3Database<typeof schema>

let db: Db | null = null
let raw: Database.Database | null = null

export function initDb(dir: string): Db {
  const file = join(dir, 'backlinkbuilder.db')
  raw = new Database(file)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  for (const stmt of schema.MIGRATIONS) raw.exec(stmt)
  for (const [table, column, def] of schema.ADDED_COLUMNS) {
    const cols = raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!cols.some((c) => c.name === column)) raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  }
  db = drizzle(raw, { schema })

  // Seed / extend the catalog once per CATALOG_VERSION. Sites are matched by hostname, so user edits are kept;
  // a site the user deleted comes back only when the version is bumped.
  const row = raw.prepare("SELECT value FROM settings WHERE key = 'catalogVersion'").get() as { value: string } | undefined
  if (Number(row?.value ?? 0) < CATALOG_VERSION) {
    const rows = raw.prepare('SELECT id, url, priority FROM sites').all() as { id: number; url: string; priority: number }[]
    const existing = new Map(rows.map((r) => [seedKey(r.url), r]))
    const missing = CATALOG_SEED.filter((s) => !existing.has(seedKey(s.url)))
    if (missing.length) db.insert(schema.sites).values(missing.map((s) => ({ ...s, topics: JSON.stringify(s.topics) }))).run()
    // Give existing rows the researched priority, unless the user already changed it from the default.
    const setPriority = raw.prepare('UPDATE sites SET priority = ? WHERE id = ? AND priority = 50')
    for (const s of CATALOG_SEED) {
      const row = existing.get(seedKey(s.url))
      if (row && s.priority !== 50) setPriority.run(s.priority, row.id)
    }
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
