import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

export const sites = sqliteTable('sites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  submitUrl: text('submit_url').notNull().default(''),
  type: text('type').notNull().default('directory'),
  language: text('language').notNull().default('en'),
  topics: text('topics').notNull().default('[]'),
  dr: integer('dr'),
  drCheckedAt: text('dr_checked_at'),
  priority: integer('priority').notNull().default(50),
  /** Researched score before the DR adjustment; priority = blend(priorityBase, dr) unless priorityManual. */
  priorityBase: integer('priority_base'),
  priorityManual: integer('priority_manual', { mode: 'boolean' }).notNull().default(false),
  linkType: text('link_type').notNull().default('unknown'),
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  format: text('format').notNull().default('plain'),
  maxLength: integer('max_length'),
  rules: text('rules').notNull().default(''),
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('active'),
  alive: text('alive').notNull().default('unknown'),
  httpStatus: integer('http_status'),
  checkError: text('check_error').notNull().default(''),
  lastCheckedAt: text('last_checked_at')
})

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  domain: text('domain').notNull().default(''),
  tagline: text('tagline').notNull().default(''),
  shortDescription: text('short_description').notNull().default(''),
  longDescription: text('long_description').notNull().default(''),
  logoPath: text('logo_path').notNull().default(''),
  images: text('images').notNull().default('[]'),
  language: text('language').notNull().default('en'),
  topics: text('topics').notNull().default('[]'),
  targets: text('targets').notNull().default('[]'),
  createdAt: text('created_at').notNull().default(now)
})

export const contents = sqliteTable('contents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  body: text('body').notNull().default(''),
  tags: text('tags').notNull().default('[]'),
  linkUrl: text('link_url').notNull().default(''),
  anchor: text('anchor').notNull().default(''),
  model: text('model').notNull().default(''),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now)
})

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  contentId: integer('content_id').references(() => contents.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('queued'),
  postUrl: text('post_url').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull().default(now),
  postedAt: text('posted_at')
})

export const placedLinks = sqliteTable('placed_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'set null' }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  pageUrl: text('page_url').notNull(),
  targetUrl: text('target_url').notNull(),
  expectedAnchor: text('expected_anchor').notNull().default(''),
  pageLive: integer('page_live', { mode: 'boolean' }),
  linkFound: integer('link_found', { mode: 'boolean' }),
  rel: text('rel'),
  relRaw: text('rel_raw').notNull().default(''),
  anchorFound: text('anchor_found').notNull().default(''),
  httpStatus: integer('http_status'),
  error: text('error').notNull().default(''),
  lastCheckedAt: text('last_checked_at'),
  createdAt: text('created_at').notNull().default(now)
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

// Plain SQL migration kept next to the schema: applied with CREATE TABLE IF NOT EXISTS on start.
// (No drizzle-kit at runtime: keeps the packaged app simple.)
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, url TEXT NOT NULL, submit_url TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'directory', language TEXT NOT NULL DEFAULT 'en',
    topics TEXT NOT NULL DEFAULT '[]', dr INTEGER, priority INTEGER NOT NULL DEFAULT 50, link_type TEXT NOT NULL DEFAULT 'unknown',
    needs_review INTEGER NOT NULL DEFAULT 0, format TEXT NOT NULL DEFAULT 'plain', max_length INTEGER,
    rules TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
    alive TEXT NOT NULL DEFAULT 'unknown', http_status INTEGER, last_checked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, domain TEXT NOT NULL DEFAULT '', tagline TEXT NOT NULL DEFAULT '',
    short_description TEXT NOT NULL DEFAULT '', long_description TEXT NOT NULL DEFAULT '',
    logo_path TEXT NOT NULL DEFAULT '', images TEXT NOT NULL DEFAULT '[]', language TEXT NOT NULL DEFAULT 'en',
    topics TEXT NOT NULL DEFAULT '[]', targets TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
    link_url TEXT NOT NULL DEFAULT '', anchor TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    content_id INTEGER REFERENCES contents(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued', post_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), posted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS placed_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    page_url TEXT NOT NULL, target_url TEXT NOT NULL, expected_anchor TEXT NOT NULL DEFAULT '',
    page_live INTEGER, link_found INTEGER, rel TEXT, rel_raw TEXT NOT NULL DEFAULT '',
    anchor_found TEXT NOT NULL DEFAULT '', http_status INTEGER, error TEXT NOT NULL DEFAULT '',
    last_checked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
]

/** Columns added after the first release: [table, column, definition]. Added with ALTER TABLE when missing. */
export const ADDED_COLUMNS: [string, string, string][] = [
  ['sites', 'priority', 'INTEGER NOT NULL DEFAULT 50'],
  ['projects', 'images', "TEXT NOT NULL DEFAULT '[]'"],
  ['sites', 'dr_checked_at', 'TEXT'],
  ['sites', 'check_error', "TEXT NOT NULL DEFAULT ''"],
  ['sites', 'priority_base', 'INTEGER'],
  ['sites', 'priority_manual', 'INTEGER NOT NULL DEFAULT 0']
]
