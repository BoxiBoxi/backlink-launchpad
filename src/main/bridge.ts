// Local bridge between the app and the Backlink Launchpad browser extension.
// - Listens on 127.0.0.1 only, and every request must carry the token written into the extension's config.json,
//   so web pages cannot read posts or mark tasks as posted.
// - The extension asks which task fits the page it is on, fills the form from it, and reports the live post URL.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { app } from 'electron'
import { projectRepo, settingsRepo, siteRepo, taskRepo } from './repo'
import { setExtensionDir } from './browser'
import { markPosted, postPayload } from './tasks'
import { emit } from './events'
import { accountFor, autofillEnabled, catalogSiteFor, getProfile, profileLogin, signupPasswordFor } from './accounts'
import { learn, memoryForExtension } from './memory'
import { learnRecipe, recipeFor } from './recipes'

const PORTS = [47821, 47822, 47823, 47824, 47825]
let server: Server | null = null
let port = 0
let token = ''
let extensionSeenAt = 0
/** The task most recently opened from the app: preferred when several tasks fit the page. */
let handoffTaskId: number | null = null
let installedDir: string | null = null
/** Build of the extension copy the app installed at startup, and the one last seen calling from the browser. */
let installedBuild = ''
let runningBuild = ''

const OPENED_BUILD_KEY = 'browserExtensionBuild'

/**
 * True when a browser window on the app's profile may still run an older copy of the extension: the last one
 * was opened with another build (the app updated, or was stopped without closing it), or an older copy has
 * called the app since. Then Open closes that window first and opens it again with the new copy (logins are kept).
 */
export function extensionNeedsRestart(): boolean {
  if (!installedBuild) return false
  const staleWorker = !!runningBuild && runningBuild !== installedBuild
  return staleWorker || settingsRepo.get(OPENED_BUILD_KEY) !== installedBuild
}

/** Remember which build the browser window was opened with. */
export function markBrowserOpened() {
  if (!installedBuild) return
  settingsRepo.set(OPENED_BUILD_KEY, installedBuild)
  runningBuild = ''
}

let handoffAt = 0
export function setHandoff(taskId: number) {
  handoffTaskId = taskId
  handoffAt = Date.now()
}

export function bridgeStatus() {
  return { port, extensionSeenAt: extensionSeenAt ? new Date(extensionSeenAt).toISOString() : null, extensionDir: installedDir, installedBuild, runningBuild }
}

/** Unpacked extension source: shipped next to the app (resources/extension) or the project folder in dev. */
function extensionSource(): string {
  return app.isPackaged ? join(process.resourcesPath, 'extension') : join(__dirname, '..', '..', 'extension')
}

/** Copy the extension into the data folder (writable, stable path = stable extension id) with this run's config. */
const VERSION_KEY = 'extensionManifest'

function extensionVersion(build: string): string {
  let prev: { build?: string; version?: string } = {}
  try {
    prev = JSON.parse(settingsRepo.get(VERSION_KEY) || '{}')
  } catch {
    /* first run */
  }
  if (prev.build === build && prev.version) return prev.version
  const now = new Date()
  const day = Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000)
  const half = Math.floor((now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 2)
  let version = `2.${day}.${half}`
  // Never equal to the previous one (two builds within the same two seconds).
  if (prev.version === version) version = `2.${day}.${half + 1}`
  settingsRepo.set(VERSION_KEY, JSON.stringify({ build, version }))
  return version
}

function installExtension(): string | null {
  const src = extensionSource()
  if (!existsSync(join(src, 'manifest.json'))) {
    console.warn('[bridge] extension not found at', src)
    return null
  }
  const dest = join(app.getPath('userData'), 'browser-extension')
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, force: true })
  // Stamp the scripts with a hash of this version, so a browser still running an older copy reloads it.
  const scripts = ['background.js', 'content.js', 'popup.js']
  const build = createHash('sha1')
    .update(scripts.map((f) => readFileSync(join(src, f), 'utf8')).join('\n'))
    .digest('hex')
    .slice(0, 12)
  for (const f of scripts) writeFileSync(join(dest, f), readFileSync(join(src, f), 'utf8').replaceAll('__BB_BUILD__', build))
  installedBuild = build
  // The browser starts the new service worker only if the manifest version goes UP (an equal or lower version keeps
  // the old worker). So when the files change, the version becomes a later point in time: 2.<day>.<half-second>,
  // above every 1.x that 0.1.6 used. Unchanged files keep their version.
  const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'))
  manifest.version = extensionVersion(build)
  writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(dest, 'config.json'), JSON.stringify({ port, token }, null, 2))
  return dest
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname.toLowerCase().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

/** Open tasks whose site lives on the same host as the page, best match first. */
function matchTasks(pageUrl: string) {
  const host = hostOf(pageUrl)
  if (!host) return []
  const pagePath = pathOf(pageUrl)
  const scored: { score: number; taskId: number }[] = []
  for (const t of taskRepo.list(null)) {
    if (t.status !== 'queued' && t.status !== 'opened') continue
    const site = siteRepo.get(t.siteId)
    if (!site) continue
    const siteUrls = [site.submitUrl, site.url].filter(Boolean)
    const hostMatch = siteUrls.some((u) => {
      const h = hostOf(u)
      return h && (h === host || host.endsWith(`.${h}`) || h.endsWith(`.${host}`))
    })
    if (!hostMatch) continue
    let score = 1
    // Several sites on one host (e.g. subreddits): prefer the one whose path the page is under.
    if (siteUrls.some((u) => { const p = pathOf(u); return p.length > 1 && pagePath.startsWith(p) })) score += 2
    if (t.status === 'opened') score += 1
    if (t.id === handoffTaskId) score += 4
    scored.push({ score, taskId: t.id })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ taskId }) => {
      const p = postPayload(taskId)
      const project = projectRepo.get(p.task.projectId)
      return {
        taskId,
        siteName: p.siteName,
        projectName: project?.name ?? '',
        status: p.task.status,
        format: p.siteFormat,
        submitUrl: p.url,
        title: p.title,
        body: p.body,
        website: p.website,
        hasContent: p.hasContent,
        // Just opened from the app (Open): the extension fills the post as soon as the page is ready.
        autoFill: taskId === handoffTaskId && Date.now() - handoffAt < 3 * 60 * 1000,
        logo: !!p.logo && existsSync(p.logo),
        images: p.images.filter((f) => existsSync(f)).length
      }
    })
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 100_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const origin = String(req.headers.origin || '')
  // Only the extension (or no browser origin at all) may call; ordinary web pages are refused.
  if (origin && !/^(chrome|moz)-extension:\/\//.test(origin)) return send(res, 403, { error: 'forbidden' })
  if (req.headers['x-bb-token'] !== token) return send(res, 401, { error: 'bad token' })
  const build = req.headers['x-bb-build']
  if (typeof build === 'string' && build) runningBuild = build
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && url.pathname === '/v1/hello') {
      extensionSeenAt = Date.now()
      return send(res, 200, { app: 'Backlink Launchpad', version: app.getVersion() })
    }
    if (req.method === 'GET' && url.pathname === '/v1/match') {
      extensionSeenAt = Date.now()
      const pageUrl = url.searchParams.get('url') || ''
      const site = catalogSiteFor(pageUrl)
      const account = site ? accountFor(site.host) : null
      const tasks = matchTasks(pageUrl)
      const projectId = memoryProject(tasks)
      return send(res, 200, {
        tasks,
        // Form memory of the project being promoted, only on catalog sites and task pages.
        memory: (site || tasks.length) && projectId ? memoryForExtension(projectId) : null,
        // Which field means what on this site (shared recipes plus what was learned here).
        recipe: site || tasks.length ? recipeFor(hostOf(pageUrl)) : null,
        // Sign-up / login filling only on sites from the catalog, never on arbitrary pages.
        site: site ? { name: site.name, host: site.host } : null,
        autofill: autofillEnabled(),
        hasAccount: !!account
      })
    }
    if (req.method === 'GET' && url.pathname === '/v1/file') {
      const p = postPayload(Number(url.searchParams.get('task')))
      const which = url.searchParams.get('i') || ''
      const file = which === 'logo' ? p.logo : p.images.filter((f) => existsSync(f))[Number(which)]
      if (!file || !existsSync(file) || !MIME[extname(file).toLowerCase()]) return send(res, 404, { error: 'no file' })
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()], 'x-file-name': encodeURIComponent(file.split(/[\\/]/).pop() || 'image') })
      return res.end(readFileSync(file))
    }
    if (req.method === 'POST' && url.pathname === '/v1/memory') {
      const { url: pageUrl, projectId, items } = await readBody(req)
      const page = String(pageUrl || '')
      if (!catalogSiteFor(page) && !matchTasks(page).length) return send(res, 403, { error: 'Only catalog sites are remembered' })
      const host = hostOf(page)
      const list = Array.isArray(items) ? items : []
      learnRecipe(host, list)
      return send(res, 200, { changed: learn(Number(projectId), host, list) })
    }
    if (req.method === 'POST' && url.pathname === '/v1/credentials') {
      const { url: pageUrl, mode } = await readBody(req)
      const site = catalogSiteFor(String(pageUrl || ''))
      if (!site) return send(res, 403, { error: 'Only sites in the catalog get sign-up details' })
      if (mode === 'login') {
        const acc = accountFor(site.host)
        if (acc) return send(res, 200, { login: acc, saved: true })
        // No account saved for this site (signed up by hand, or on another computer): use the sign-up profile,
        // and the user types the password.
        const login = profileLogin()
        return send(res, 200, { login, saved: !!login.password })
      }
      const profile = getProfile()
      const { password, saved } = signupPasswordFor(site.host, site.name)
      return send(res, 200, { profile, password, saved, siteName: site.name })
    }
    if (req.method === 'POST' && url.pathname === '/v1/posted') {
      const { taskId, url: postUrl } = await readBody(req)
      const task = taskRepo.get(Number(taskId))
      if (!task) return send(res, 404, { error: 'Task not found' })
      const { link } = markPosted(task.id, String(postUrl || ''))
      emit({ type: 'autoPosted', taskId: task.id, linkId: link.id, siteName: siteRepo.get(task.siteId)?.name ?? 'site', url: link.pageUrl })
      return send(res, 200, { ok: true })
    }
    return send(res, 404, { error: 'not found' })
  } catch (err) {
    return send(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
}

/** Project whose form memory applies: the page's task, else the task last opened from the app, else the first project. */
function memoryProject(tasks: { taskId: number }[]): number | null {
  const first = tasks[0] ? taskRepo.get(tasks[0].taskId) : undefined
  if (first) return first.projectId
  const handoff = handoffTaskId ? taskRepo.get(handoffTaskId) : undefined
  if (handoff) return handoff.projectId
  const projects = projectRepo.list()
  return projects.length ? projects[0].id : null
}

function listen(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer((req, res) => void handle(req, res))
    s.once('error', () => resolve(false))
    s.listen(p, '127.0.0.1', () => {
      server = s
      port = p
      resolve(true)
    })
  })
}

export async function startBridge(): Promise<void> {
  token = settingsRepo.get('bridgeToken') || ''
  if (!token) {
    token = randomBytes(24).toString('hex')
    settingsRepo.set('bridgeToken', token)
  }
  for (const p of PORTS) if (await listen(p)) break
  if (!server) {
    console.warn('[bridge] no free port; the browser extension will not connect')
    return
  }
  const dir = installExtension()
  installedDir = dir
  setExtensionDir(dir)
  console.log('[bridge] listening on', port, dir ? `extension at ${dir}` : '')
}

export function stopBridge() {
  server?.close()
  server = null
}
