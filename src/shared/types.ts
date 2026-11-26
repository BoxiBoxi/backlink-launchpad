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
  /** Researched score before blending in DR. */
  priorityBase?: number | null
  /** True once the user set the priority by hand: DR no longer changes it. */
  priorityManual?: boolean
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

export type AiProvider = 'wriai' | 'custom'

export interface Settings {
  aiProvider: AiProvider
  wriaiKeySet: boolean
  bravePath: string
  /** Display name of the browser in use ('Brave', 'Chrome', 'Microsoft Edge', ...), or 'none' */
  browserName: string
  profileDir: string
  /** Closing the window hides the app to the tray instead of quitting */
  closeToTray: boolean
  linkCheckIntervalHours: number
  aiEndpoint: string
  aiModel: string
  aiApiKeySet: boolean
  ahrefsKeySet: boolean
}

export interface SetupStatus {
  /** true once the user finished or skipped the first-run guide */
  done: boolean
  hasProjects: boolean
  platform: string
  browserPath: string | null
  browserName: string
  aiReady: boolean
}

export interface SettingsInput {
  aiProvider?: AiProvider
  /** Wriai API key (wri_live_...); empty string clears it */
  wriaiApiKey?: string
  bravePath?: string
  closeToTray?: boolean
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
  filled: { title: boolean; body: boolean; website: boolean; files: number }
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
export interface UpdateStatus {
  /** unsupported = dev build (no update feed); available = new version, but it must be downloaded by hand (macOS) */
  state: 'unsupported' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  current: string
  version?: string
  percent?: number
  message?: string
}

export type AppEvent =
  | { type: 'session'; status: SessionStatus }
  | { type: 'update'; status: UpdateStatus }
  | { type: 'autoPosted'; taskId: number; linkId: number; siteName: string; url: string }
  | { type: 'drProgress'; done: number; total: number }

/** Details the browser extension fills into sign-up forms. */
export interface SignupProfile {
  firstName: string
  lastName: string
  username: string
  email: string
  phone: string
}

/** A value the browser extension learned from a submit form, offered on the next sites. */
export interface FormMemoryEntry {
  /** What the field means (tagline, pricing, twitter...) or label:<field label> for fields without a known meaning. */
  key: string
  /** Readable name of the field. */
  name: string
  /** The field's label on the site where it was typed. */
  label: string
  value: string
  /** Host of the site where it was typed. */
  site: string
  updatedAt: string
}

/** A site account whose password the app generated and keeps (encrypted with the OS keychain). */
export interface SavedAccount {
  host: string
  siteName: string
  username: string
  email: string
  createdAt: string
}

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
  'content:generate': [[{ projectId: number; siteId: number; linkUrl?: string; anchor?: string; extra?: string; replaceId?: number }], Content & { creditsRemaining?: number | null }]
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
  /** Open the submit page in a normal (not automated) window; the browser extension fills it. */
  'tasks:openManual': [[number], { message: string }]
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
  /** Local bridge for the browser extension: its port, and when the extension last called it. */
  'bridge:status': [[], { port: number; extensionSeenAt: string | null; extensionDir: string | null }]
  'identity:get': [[], { profile: SignupProfile; autofill: boolean; canStorePasswords: boolean }]
  'identity:save': [[{ profile?: SignupProfile; autofill?: boolean }], { profile: SignupProfile; autofill: boolean; canStorePasswords: boolean }]
  'accounts:list': [[], SavedAccount[]]
  'memory:list': [[number], FormMemoryEntry[]]
  'memory:save': [[{ projectId: number; key: string; value: string }], void]
  /** key null: forget everything for the project. */
  'memory:delete': [[{ projectId: number; key: string | null }], void]
  'memory:learning': [[], boolean]
  /** Save the project's remembered values to a JSON file (dialog). Returns the path, or null if cancelled. */
  'memory:export': [[number], string | null]
  /** Merge values from a JSON file (dialog) into the project. Returns how many were added, or null if cancelled. */
  'memory:import': [[number], number | null]
  'recipes:stats': [[], { sites: number; fields: number; sharedSites: number }]
  'recipes:export': [[], string | null]
  'recipes:import': [[], { sites: number; fields: number } | null]
  'memory:setLearning': [[boolean], boolean]
  'accounts:reveal': [[string], string]
  'accounts:delete': [[string], void]

  'setup:status': [[], SetupStatus]
  'setup:complete': [[], void]
  'settings:get': [[], Settings]
  'settings:save': [[SettingsInput], Settings]
  'ai:test': [[], { ok: boolean; model?: string; message: string; creditsRemaining?: number | null }]
  'update:status': [[], UpdateStatus]
  'update:check': [[], UpdateStatus]
  /** Restart and install a downloaded update (or open the release page when it can only be installed by hand). */
  'update:install': [[], void]
  'clipboard:write': [[string], void]
  'shell:openExternal': [[string], void]
}

export type Channel = keyof Api
