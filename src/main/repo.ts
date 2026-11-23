// Data access: maps DB rows <-> shared types.
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import { contents, placedLinks, projects, settings, sites, tasks } from './db/schema'
import type {
  Content,
  PlacedLink,
  Project,
  ProjectInput,
  ProjectStats,
  Rel,
  Site,
  SiteInput,
  Task
} from '@shared/types'

const arr = <T>(json: string): T[] => {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const nowIso = () => new Date().toISOString()

// ---------- sites ----------
type SiteRow = typeof sites.$inferSelect
const toSite = (r: SiteRow): Site => ({ ...r, topics: arr<string>(r.topics) }) as Site

export const siteRepo = {
  list: (): Site[] => getDb().select().from(sites).orderBy(sites.language, sites.type, sites.name).all().map(toSite),
  get: (id: number): Site | undefined => {
    const r = getDb().select().from(sites).where(eq(sites.id, id)).get()
    return r ? toSite(r) : undefined
  },
  save: (input: SiteInput & { id?: number }): Site => {
    const values = { ...input, topics: JSON.stringify(input.topics ?? []) }
    delete (values as { id?: number }).id
    if (input.id) {
      getDb().update(sites).set(values).where(eq(sites.id, input.id)).run()
      return siteRepo.get(input.id)!
    }
    const r = getDb().insert(sites).values(values).returning().get()
    return toSite(r)
  },
  delete: (id: number) => getDb().delete(sites).where(eq(sites.id, id)).run(),
  setAlive: (id: number, alive: Site['alive'], httpStatus: number | null) =>
    getDb().update(sites).set({ alive, httpStatus, lastCheckedAt: nowIso() }).where(eq(sites.id, id)).run(),
  setLinkType: (id: number, linkType: Site['linkType']) =>
    getDb().update(sites).set({ linkType }).where(eq(sites.id, id)).run()
}

// ---------- projects ----------
type ProjectRow = typeof projects.$inferSelect
const toProject = (r: ProjectRow): Project => ({
  ...r,
  language: r.language as Project['language'],
  topics: arr<string>(r.topics),
  targets: arr<Project['targets'][number]>(r.targets)
})

export const projectRepo = {
  list: (): Project[] => getDb().select().from(projects).orderBy(projects.name).all().map(toProject),
  get: (id: number): Project | undefined => {
    const r = getDb().select().from(projects).where(eq(projects.id, id)).get()
    return r ? toProject(r) : undefined
  },
  save: (input: ProjectInput & { id?: number }): Project => {
    const values = {
      name: input.name,
      domain: input.domain,
      tagline: input.tagline,
      shortDescription: input.shortDescription,
      longDescription: input.longDescription,
      logoPath: input.logoPath,
      language: input.language,
      topics: JSON.stringify(input.topics ?? []),
      targets: JSON.stringify(input.targets ?? [])
    }
    if (input.id) {
      getDb().update(projects).set(values).where(eq(projects.id, input.id)).run()
      return projectRepo.get(input.id)!
    }
    return toProject(getDb().insert(projects).values(values).returning().get())
  },
  delete: (id: number) => getDb().delete(projects).where(eq(projects.id, id)).run(),
  stats: (): ProjectStats[] => {
    const db = getDb()
    return db
      .select({
        projectId: projects.id,
        placed: sql<number>`(SELECT COUNT(*) FROM placed_links l WHERE l.project_id = ${projects.id})`,
        live: sql<number>`(SELECT COUNT(*) FROM placed_links l WHERE l.project_id = ${projects.id} AND l.page_live = 1 AND l.link_found = 1)`,
        dofollow: sql<number>`(SELECT COUNT(*) FROM placed_links l WHERE l.project_id = ${projects.id} AND l.page_live = 1 AND l.link_found = 1 AND l.rel = 'dofollow')`,
        pendingTasks: sql<number>`(SELECT COUNT(*) FROM tasks t WHERE t.project_id = ${projects.id} AND t.status IN ('queued','opened'))`,
        postedTasks: sql<number>`(SELECT COUNT(*) FROM tasks t WHERE t.project_id = ${projects.id} AND t.status = 'posted')`,
        drafts: sql<number>`(SELECT COUNT(*) FROM contents c WHERE c.project_id = ${projects.id})`
      })
      .from(projects)
      .all()
  }
}

// ---------- contents ----------
type ContentRow = typeof contents.$inferSelect
const toContent = (r: ContentRow): Content => ({ ...r, status: r.status as Content['status'], tags: arr<string>(r.tags) })

export const contentRepo = {
  list: (projectId: number | null): Content[] => {
    const q = getDb().select().from(contents)
    return (projectId ? q.where(eq(contents.projectId, projectId)) : q).orderBy(desc(contents.updatedAt)).all().map(toContent)
  },
  get: (id: number): Content | undefined => {
    const r = getDb().select().from(contents).where(eq(contents.id, id)).get()
    return r ? toContent(r) : undefined
  },
  latestFor: (projectId: number, siteId: number): Content | undefined => {
    const r = getDb()
      .select()
      .from(contents)
      .where(and(eq(contents.projectId, projectId), eq(contents.siteId, siteId)))
      .orderBy(desc(contents.updatedAt))
      .get()
    return r ? toContent(r) : undefined
  },
  insert: (c: Omit<Content, 'id' | 'createdAt' | 'updatedAt'>): Content =>
    toContent(getDb().insert(contents).values({ ...c, tags: JSON.stringify(c.tags) }).returning().get()),
  update: (c: Pick<Content, 'id'> & Partial<Omit<Content, 'id'>>): Content => {
    const { id, tags, ...rest } = c
    getDb()
      .update(contents)
      .set({ ...rest, ...(tags ? { tags: JSON.stringify(tags) } : {}), updatedAt: nowIso() })
      .where(eq(contents.id, id))
      .run()
    return contentRepo.get(id)!
  },
  delete: (id: number) => getDb().delete(contents).where(eq(contents.id, id)).run()
}

// ---------- tasks ----------
type TaskRow = typeof tasks.$inferSelect
const toTask = (r: TaskRow): Task => ({ ...r, status: r.status as Task['status'] })

export const taskRepo = {
  list: (projectId: number | null): Task[] => {
    const q = getDb().select().from(tasks)
    return (projectId ? q.where(eq(tasks.projectId, projectId)) : q).orderBy(desc(tasks.createdAt)).all().map(toTask)
  },
  get: (id: number): Task | undefined => {
    const r = getDb().select().from(tasks).where(eq(tasks.id, id)).get()
    return r ? toTask(r) : undefined
  },
  insert: (t: Pick<Task, 'projectId' | 'siteId' | 'contentId'>): Task => toTask(getDb().insert(tasks).values(t).returning().get()),
  update: (t: Pick<Task, 'id'> & Partial<Omit<Task, 'id'>>): Task => {
    const { id, ...rest } = t
    getDb().update(tasks).set(rest).where(eq(tasks.id, id)).run()
    return taskRepo.get(id)!
  },
  delete: (id: number) => getDb().delete(tasks).where(eq(tasks.id, id)).run()
}

// ---------- placed links ----------
type LinkRow = typeof placedLinks.$inferSelect
const toLink = (r: LinkRow): PlacedLink => ({ ...r, rel: r.rel as Rel | null })

export const linkRepo = {
  list: (projectId: number | null): PlacedLink[] => {
    const q = getDb().select().from(placedLinks)
    return (projectId ? q.where(eq(placedLinks.projectId, projectId)) : q).orderBy(desc(placedLinks.createdAt)).all().map(toLink)
  },
  get: (id: number): PlacedLink | undefined => {
    const r = getDb().select().from(placedLinks).where(eq(placedLinks.id, id)).get()
    return r ? toLink(r) : undefined
  },
  insert: (l: Pick<PlacedLink, 'projectId' | 'siteId' | 'taskId' | 'pageUrl' | 'targetUrl' | 'expectedAnchor'>): PlacedLink =>
    toLink(getDb().insert(placedLinks).values(l).returning().get()),
  update: (l: Pick<PlacedLink, 'id'> & Partial<Omit<PlacedLink, 'id'>>): PlacedLink => {
    const { id, ...rest } = l
    getDb().update(placedLinks).set(rest).where(eq(placedLinks.id, id)).run()
    return linkRepo.get(id)!
  },
  delete: (id: number) => getDb().delete(placedLinks).where(eq(placedLinks.id, id)).run(),
  dueForCheck: (olderThanIso: string): PlacedLink[] =>
    getDb()
      .select()
      .from(placedLinks)
      .where(sql`${placedLinks.lastCheckedAt} IS NULL OR ${placedLinks.lastCheckedAt} < ${olderThanIso}`)
      .all()
      .map(toLink)
}

// ---------- settings ----------
export const settingsRepo = {
  get: (key: string): string | undefined => getDb().select().from(settings).where(eq(settings.key, key)).get()?.value,
  set: (key: string, value: string) =>
    getDb().insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run(),
  delete: (key: string) => getDb().delete(settings).where(eq(settings.key, key)).run()
}
