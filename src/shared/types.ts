// Types shared by main, preload and renderer. Keep free of Node/Electron imports.

export type SiteType = 'directory' | 'ugc_blog' | 'community' | 'forum' | 'qa' | 'launch'
export type Lang = 'en' | 'vi'
export type LinkType = 'dofollow' | 'nofollow' | 'ugc' | 'unknown'
export type SiteStatus = 'active' | 'paused' | 'avoid'
/** up: answers; down: gone (DNS, 404/410, 5xx); unreachable: blocked or failing from this network (refused, reset, TLS, timeout) */
export type Alive = 'unknown' | 'up' | 'down' | 'unreachable'
export type ContentFormat = 'markdown' | 'plain' | 'html'

export interface Site {
  id: number
  name: string
  url: string
  submitUrl: string
  type: SiteType
  language: Lang
  topics: string[]
  /** Ahrefs Domain Rating (fetched or entered manually) */
  dr: number | null
  drCheckedAt: string | null
  /** 0-100, higher = post here first */
  priority: number
  linkType: LinkType
  needsReview: boolean
  format: ContentFormat
  maxLength: number | null
  rules: string
  notes: string
  status: SiteStatus
  alive: Alive
  httpStatus: number | null
  /** Why the last alive check failed (network error or HTTP status) */
  checkError: string
  lastCheckedAt: string | null
}

export type SiteInput = Omit<Site, 'id' | 'alive' | 'httpStatus' | 'lastCheckedAt' | 'drCheckedAt' | 'checkError'>

export interface TargetLink {
  url: string
  anchors: string[]
}

export interface Project {
  id: number
  name: string
  domain: string
  tagline: string
  shortDescription: string
  longDescription: string
  logoPath: string
  /** Screenshots / mockups (absolute paths) uploaded to listing forms. */
  images: string[]
  language: Lang
  topics: string[]
  targets: TargetLink[]
  createdAt: string
}

export type ProjectInput = Omit<Project, 'id' | 'createdAt'>

export type ContentStatus = 'draft' | 'ready' | 'used'

export interface Content {
  id: number
  projectId: number
  siteId: number
  title: string
  body: string
  tags: string[]
  linkUrl: string
  anchor: string
  model: string
  status: ContentStatus
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'queued' | 'opened' | 'posted' | 'skipped'

export interface Task {
  id: number
  projectId: number
  siteId: number
  contentId: number | null
  status: TaskStatus
  postUrl: string
  notes: string
  createdAt: string
  postedAt: string | null
}

export type Rel = 'dofollow' | 'nofollow' | 'ugc' | 'sponsored' | 'mixed' | 'none'

export interface PlacedLink {
  id: number
  projectId: number
  siteId: number | null
  taskId: number | null
  pageUrl: string
  targetUrl: string
  expectedAnchor: string
  pageLive: boolean | null
  linkFound: boolean | null
  rel: Rel | null
  relRaw: string
  anchorFound: string
  httpStatus: number | null
  error: string
  lastCheckedAt: string | null
  createdAt: string
}

export interface ProjectStats {
  projectId: number
  placed: number
  live: number
  dofollow: number
  pendingTasks: number
  postedTasks: number
  drafts: number
}

export interface Settings {
  bravePath: string
  profileDir: string
  linkCheckIntervalHours: number
  aiEndpoint: string
  aiModel: string
  aiApiKeySet: boolean
  ahrefsKeySet: boolean
}

export interface SettingsInput {
  bravePath?: string
  linkCheckIntervalHours?: number
  aiEndpoint?: string
  aiModel?: string
  /** Only sent when the user types a new key; empty string clears the override. */
  aiApiKey?: string
  /** Ahrefs API key override; empty string clears it (falls back to AHREFS_API_KEY in .env). */
  ahrefsApiKey?: string
}

export interface DrScanResult {
  domains: number
  updated: number
  failed: number
  skipped: number
  error?: string
}

export interface OpenResult {
  filled: { title: boolean; body: boolean; files: number }
  copiedToClipboard: boolean
  message: string
}

export interface SiteCheckResult {
  siteId: number
  alive: Alive
  httpStatus: number | null
  error?: string
}

export interface SessionStatus {
  active: boolean
  projectId: number | null
  currentTaskId: number | null
  currentSiteName: string
  /** 1-based position of the current task in the session */
  position: number
  total: number
  posted: number
  message: string
}

/** Events pushed from the main process to the renderer. */
export type AppEvent =
  | { type: 'session'; status: SessionStatus }
  | { type: 'autoPosted'; taskId: number; linkId: number; siteName: string; url: string }
  | { type: 'drProgress'; done: number; total: number }

/** Every IPC call the renderer can make: channel -> [args, result]. */
export interface Api {
  'sites:list': [[], Site[]]
  'sites:save': [[SiteInput & { id?: number }], Site]
  'sites:delete': [[number], void]
  'sites:check': [[number[] | null], SiteCheckResult[]]
  /** Fetch Ahrefs DR for these sites (null = all). Without force, sites that already have a DR are skipped. */
  'sites:fetchDr': [[{ ids: number[] | null; force?: boolean }], DrScanResult]

  'projects:list': [[], Project[]]
  'projects:save': [[ProjectInput & { id?: number }], Project]
  'projects:delete': [[number], void]
  'projects:stats': [[], ProjectStats[]]
  'projects:pickLogo': [[], string | null]
  'projects:pickImages': [[], string[]]

  'content:list': [[number | null], Content[]]
  'content:generate': [[{ projectId: number; siteId: number; linkUrl?: string; anchor?: string; extra?: string }], Content]
  'content:save': [[Pick<Content, 'id' | 'title' | 'body' | 'tags' | 'linkUrl' | 'anchor' | 'status'>], Content]
  'content:delete': [[number], void]
  /** bodyHtml: sanitized HTML of the body (rendered by the renderer). Returns the saved path, or null if cancelled. */
  'content:exportPdf': [[{ contentId: number; bodyHtml: string; includeImages: boolean }], string | null]

  'tasks:list': [[number | null], Task[]]
  'tasks:create': [[{ projectId: number; siteIds: number[] }], Task[]]
  'tasks:update': [[Pick<Task, 'id'> & Partial<Pick<Task, 'status' | 'postUrl' | 'notes' | 'contentId'>>], Task]
  'tasks:delete': [[number], void]
  /** Delete the project's tasks with these statuses. Tracked links stay in the Link monitor. Returns the count. */
  'tasks:clear': [[{ projectId: number; statuses: TaskStatus[] }], number]
  'tasks:open': [[number], OpenResult]
  'tasks:readCurrentUrl': [[], string | null]
  'tasks:markPosted': [[{ taskId: number; postUrl: string }], { task: Task; link: PlacedLink }]
  'tasks:undoPosted': [[{ taskId: number; linkId: number }], Task]

  'session:start': [[number], SessionStatus]
  'session:next': [[], SessionStatus]
  'session:stop': [[], SessionStatus]
  'session:status': [[], SessionStatus]

  'links:list': [[number | null], PlacedLink[]]
  'links:add': [[{ projectId: number; siteId: number | null; pageUrl: string; targetUrl: string; expectedAnchor: string }], PlacedLink]
  'links:delete': [[number], void]
  'links:check': [[number[] | null], PlacedLink[]]

  'browser:openProfile': [[string | null], void]
  'browser:close': [[], void]
  'browser:status': [[], { bravePath: string | null; running: boolean }]

  'settings:get': [[], Settings]
  'settings:save': [[SettingsInput], Settings]
  'ai:test': [[], { ok: boolean; model?: string; message: string }]
  'clipboard:write': [[string], void]
  'shell:openExternal': [[string], void]
}

export type Channel = keyof Api
