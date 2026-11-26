// Browser automation via Playwright (Brave, Chrome or Edge, whichever is installed).
// - Posting uses a persistent context on a DEDICATED profile per browser (<userData>/profile-<browser>),
//   never the user's main profile.
// - The app only navigates and pre-fills fields. It never clicks submit, never solves CAPTCHAs, never creates accounts.
// - Checks (site alive, link monitor) use a separate headless instance without the profile.
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright-core'

/** Candidate browser executables per OS: Brave first (recommended), then Chrome and Edge as fallbacks. */
function browserCandidates(): string[] {
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LOCALAPPDATA']].filter(Boolean) as string[]
    const rel = [
      ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['Microsoft', 'Edge', 'Application', 'msedge.exe']
    ]
    return rel.flatMap((parts) => roots.map((root) => join(root, ...parts)))
  }
  if (process.platform === 'darwin') {
    const apps = [
      'Brave Browser.app/Contents/MacOS/Brave Browser',
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ]
    return apps.flatMap((a) => [join('/Applications', a), join(homedir(), 'Applications', a)])
  }
  return [
    '/usr/bin/brave-browser',
    '/usr/bin/brave',
    '/usr/bin/brave-browser-stable',
    '/opt/brave.com/brave/brave',
    '/snap/bin/brave',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ]
}

/** First installed browser (Brave preferred). */
export function detectBrave(): string | null {
  return browserCandidates().find((p) => existsSync(p)) ?? null
}

export type BrowserKind = 'brave' | 'edge' | 'chrome' | 'chromium'

export function browserKind(path: string | null): BrowserKind {
  const p = (path ?? '').toLowerCase()
  return p.includes('brave') ? 'brave' : p.includes('edge') ? 'edge' : p.includes('chrome') ? 'chrome' : 'chromium'
}

export function browserName(path: string | null): string {
  if (!path) return 'none'
  return { brave: 'Brave', edge: 'Microsoft Edge', chrome: 'Chrome', chromium: 'Chromium' }[browserKind(path)]
}

let postingCtx: BrowserContext | null = null
/** Profile folder of the non-automated login window we started (see openProfileForLogin). */
let loginWindowProfile: string | null = null

export function isPostingBrowserRunning(): boolean {
  return postingCtx !== null || loginWindowProfile !== null
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function run(cmd: string, args: string[], env?: Record<string, string>): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, env: env ? { ...process.env, ...env } : process.env, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0
      resolve({ code, stdout: String(stdout ?? '') })
    })
  })
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * PIDs of the main browser processes using this profile folder. Matched on the command line, because the
 * process we spawn is not always the one that stays: Edge relaunches itself, and Chrome/Edge may keep running
 * in the background after the last window is closed.
 */
async function findProfileBrowsers(profileDir: string): Promise<number[]> {
  const needle = profileDir.toLowerCase()
  if (process.platform === 'win32') {
    const script =
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($env:BB_PROFILE) -and -not $_.CommandLine.Contains('--type=') } | ForEach-Object { $_.ProcessId }"
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { BB_PROFILE: needle })
    return stdout
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid)
  }
  const { stdout } = await run('ps', ['-ax', '-o', 'pid=,command='])
  return stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2].toLowerCase().includes(needle) && !m[2].includes('--type='))
    .map((m) => Number(m[1]))
    .filter((n) => n !== process.pid)
}

async function waitAllExit(pids: number[], ms: number): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (!pids.some(isAlive)) return true
    await sleep(300)
  }
  return !pids.some(isAlive)
}

/**
 * Close every browser window/process on this profile. Asks politely first (WM_CLOSE on Windows, SIGTERM
 * elsewhere) so the browser writes cookies to disk, and only force-kills what is still running after that.
 */
async function closeProfileBrowsers(profileDir: string): Promise<void> {
  const pids = await findProfileBrowsers(profileDir)
  if (!pids.length) return
  let politeFailed = false
  for (const pid of pids) {
    if (process.platform === 'win32') {
      // Without /F, taskkill sends WM_CLOSE. It fails right away when the process has no window (background mode).
      if ((await run('taskkill', ['/PID', String(pid)])).code !== 0) politeFailed = true
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  }
  if (await waitAllExit(pids, politeFailed ? 1500 : 6000)) return
  for (const pid of pids.filter(isAlive)) {
    if (process.platform === 'win32') await run('taskkill', ['/PID', String(pid), '/T', '/F'])
    else {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }
  await waitAllExit(pids, 3000)
}

const isProfileLocked = (msg: string) => /user data directory is already in use|ProcessSingleton|exitCode=21/i.test(msg)

async function ensurePostingContext(browserPath: string, profileDir: string): Promise<BrowserContext> {
  if (postingCtx) return postingCtx
  // The profile can only be used by one browser process: close the login window instead of refusing.
  if (loginWindowProfile) {
    await closeProfileBrowsers(loginWindowProfile)
    loginWindowProfile = null
  }
  mkdirSync(profileDir, { recursive: true })
  const launch = () =>
    chromium.launchPersistentContext(profileDir, {
      executablePath: browserPath,
      headless: false,
      viewport: null,
      args: ['--start-maximized', '--no-first-run', '--no-default-browser-check']
    })
  try {
    try {
      postingCtx = await launch()
    } catch (err) {
      if (!isProfileLocked(err instanceof Error ? err.message : String(err))) throw err
      // Still held by a leftover window (e.g. from before the app restarted, or running in the background).
      await closeProfileBrowsers(profileDir)
      await sleep(1000)
      postingCtx = await launch()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isProfileLocked(msg)) {
      throw new Error('The BacklinkBuilder browser profile is already open in another window. Close that browser window and try again.')
    }
    throw err
  }
  postingCtx.on('close', () => {
    postingCtx = null
  })
  return postingCtx
}

/**
 * Open the browser on the dedicated profile WITHOUT automation, so the user can sign in to sites normally
 * (some providers refuse logins in automated browsers). Sessions persist in the profile. If the window is
 * already open, the browser hands the URL to it instead of starting a second instance.
 */
export async function openProfileForLogin(browserPath: string, profileDir: string, url: string | null): Promise<void> {
  if (postingCtx) {
    const page = await postingCtx.newPage()
    if (url) await page.goto(url).catch(() => undefined)
    await page.bringToFront()
    return
  }
  mkdirSync(profileDir, { recursive: true })
  const ext = extensionDir && existsSync(join(extensionDir, 'manifest.json')) ? extensionDir : null
  const args = [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    // The Backlink Launchpad extension fills forms in this window. Brave and Edge load it from the command line;
    // Chrome 137+ ignores the switch, so there it is added once by hand (Load unpacked) and stays in the profile.
    ...(ext ? [`--load-extension=${ext}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'] : []),
    ...(url ? [url] : [])
  ]
  const child = spawn(browserPath, args, { detached: false, stdio: 'ignore' })
  child.on('error', () => undefined)
  loginWindowProfile = profileDir
}

/** Folder of the unpacked browser extension loaded into the login window (set by the bridge at startup). */
let extensionDir: string | null = null
export function setExtensionDir(dir: string | null) {
  extensionDir = dir
}

/**
 * Open a URL in the normal (not automated) window, closing the automated one first: both use the same
 * profile, and bot checks such as Cloudflare only pass in the normal window.
 */
export async function openInNormalWindow(browserPath: string, profileDir: string, url: string): Promise<void> {
  if (postingCtx) {
    const ctx = postingCtx
    postingCtx = null
    await ctx.close().catch(() => undefined)
    await sleep(800)
  }
  await openProfileForLogin(browserPath, profileDir, url)
}

/** Close both the automated browser and the login window, if open. */
export async function closePostingBrowser(): Promise<void> {
  const ctx = postingCtx
  postingCtx = null
  const loginProfile = loginWindowProfile
  loginWindowProfile = null
  await Promise.all([ctx?.close().catch(() => undefined), loginProfile ? closeProfileBrowsers(loginProfile) : undefined])
}

const TITLE_SELECTORS = [
  'textarea[placeholder*="title" i]',
  'input[placeholder*="title" i]',
  'input[name*="title" i]',
  'input[id*="title" i]',
  'textarea[name*="title" i]',
  'textarea[id*="title" i]',
  'input[placeholder*="tiêu đề" i]',
  'textarea[placeholder*="tiêu đề" i]',
  '[contenteditable="true"][data-placeholder*="title" i]',
  '[contenteditable="true"][aria-label*="title" i]',
  'h1[contenteditable="true"]',
  '[data-placeholder*="title" i]',
  'h1[data-placeholder]',
  'h3.graf--title',
  'input[name="name"]',
  'input[name*="tool_name" i]',
  'input[placeholder*="name" i]'
]

const BODY_SELECTORS = [
  'textarea[name*="body" i]',
  'textarea[id*="body" i]',
  'textarea[name*="content" i]',
  'textarea[id*="content" i]',
  'textarea[name*="description" i]',
  'textarea[id*="description" i]',
  'textarea[placeholder*="write" i]',
  'textarea[placeholder*="description" i]',
  'textarea[placeholder*="nội dung" i]',
  '.ProseMirror[contenteditable="true"]',
  '.ql-editor[contenteditable="true"]',
  '.public-DraftEditor-content[contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
  '[contenteditable="true"]',
  'textarea'
]

// Product / website URL fields on directory and launch forms ("Tool URL", "Website", "Product link").
const WEBSITE_SELECTORS = [
  'input[type="url"]',
  'input[name*="url" i]:not([name*="image" i]):not([name*="logo" i]):not([name*="video" i])',
  'input[id*="url" i]:not([id*="image" i]):not([id*="logo" i]):not([id*="video" i])',
  'input[name*="website" i]',
  'input[id*="website" i]',
  'input[placeholder*="https://" i]',
  'input[placeholder*="example.com" i]',
  'input[placeholder*="website" i]',
  'input[aria-label*="website" i]',
  'input[aria-label*="url" i]'
]

/** Fill the first empty, visible URL-like text input with the project's link. */
async function fillWebsite(frames: Frame[], value: string): Promise<boolean> {
  for (const frame of frames) {
    for (const sel of WEBSITE_SELECTORS) {
      const loc = frame.locator(sel)
      const n = Math.min(await loc.count().catch(() => 0), 5)
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i)
        try {
          if (!(await el.isVisible()) || !(await el.isEditable())) continue
          const ok = await el.evaluate((node) => {
            const e = node as HTMLInputElement
            return !e.value && !['email', 'search', 'password', 'hidden', 'file', 'checkbox', 'radio'].includes(e.type)
          })
          if (!ok) continue
          await el.fill(value)
          return true
        } catch {
          /* try next candidate */
        }
      }
    }
  }
  return false
}

async function tryFill(frames: Frame[], selectors: string[], value: string, page: Page, skip?: string): Promise<string | null> {
  for (const frame of frames) {
    for (const sel of selectors) {
      const loc = frame.locator(sel)
      const n = Math.min(await loc.count().catch(() => 0), 5)
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i)
        try {
          if (!(await el.isVisible()) || !(await el.isEditable())) continue
          const marker = await el.evaluate((node) => {
            const e = node as HTMLElement
            if (!e.dataset.bbMark) e.dataset.bbMark = Math.random().toString(36).slice(2)
            return e.dataset.bbMark
          })
          if (skip && marker === skip) continue
          const isContentEditable = await el.evaluate((node) => (node as HTMLElement).isContentEditable && !('value' in node))
          if (isContentEditable) {
            await el.click()
            if (/<(p|h[1-6]|ul|ol|li|a|strong|em|br)\b[^>]*>/i.test(value)) {
              // Rich-text editor + HTML body: insert as formatted content, not as visible tags.
              const ok = await el.evaluate((_node, html) => document.execCommand('insertHTML', false, html), value)
              if (!ok) await page.keyboard.insertText(value.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' '))
            } else {
              await page.keyboard.insertText(value)
            }
          } else {
            await el.fill(value)
          }
          return marker
        } catch {
          /* try next candidate */
        }
      }
    }
  }
  return null
}

export interface OpenForPostingInput {
  browserPath: string
  profileDir: string
  url: string
  title: string
  body: string
  /** The product URL to put into "Website / Tool URL" fields. */
  website: string
  logo: string
  images: string[]
}

export async function openForPosting(input: OpenForPostingInput): Promise<{ title: boolean; body: boolean; website: boolean; files: number; page: Page }> {
  const ctx = await ensurePostingContext(input.browserPath, input.profileDir)
  const blank = ctx.pages().find((p) => p.url() === 'about:blank')
  const page = blank ?? (await ctx.newPage())
  await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.bringToFront()
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)

  const frames = page.frames()
  let titleMark: string | null = null
  if (input.title) titleMark = await tryFill(frames, TITLE_SELECTORS, input.title, page)
  const bodyMark = input.body ? await tryFill(frames, BODY_SELECTORS, input.body, page, titleMark ?? undefined) : null
  const website = input.website ? await fillWebsite(frames, input.website) : false
  const files = await attachImages(frames, input.logo, input.images)
  // Leave the page as is: the user reviews, signs in / solves CAPTCHA if needed, and submits.
  return { title: titleMark !== null, body: bodyMark !== null, website, files, page }
}

/**
 * Attach the logo / screenshots to image upload inputs (also hidden ones behind custom buttons).
 * Inputs whose name/id/label mention logo, icon or avatar get the logo; the others get screenshots.
 */
async function attachImages(frames: Frame[], logo: string, images: string[]): Promise<number> {
  const logoFile = logo && existsSync(logo) ? logo : ''
  const shots = images.filter((p) => existsSync(p))
  if (!logoFile && !shots.length) return 0
  let attached = 0
  let shotIdx = 0
  for (const frame of frames) {
    const inputs = frame.locator('input[type="file"]')
    const n = Math.min(await inputs.count().catch(() => 0), 8)
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i)
      try {
        const info = await el.evaluate((node) => {
          const input = node as HTMLInputElement
          const label = input.labels?.[0]?.textContent || input.closest('label,div,section')?.textContent?.slice(0, 200) || ''
          return { hint: `${input.name} ${input.id} ${input.getAttribute('aria-label') || ''} ${label}`.toLowerCase(), accept: input.accept || '', multiple: input.multiple }
        })
        if (info.accept && !/image|\.png|\.jpe?g|\.webp|\*/i.test(info.accept)) continue
        const wantsLogo = /logo|icon|avatar|favicon|thumbnail/.test(info.hint)
        let files: string[] = []
        if (wantsLogo && logoFile) files = [logoFile]
        else if (shots.length) {
          files = info.multiple ? shots.slice(0, 5) : [shots[shotIdx++ % shots.length]]
        } else if (logoFile) files = [logoFile]
        if (!files.length) continue
        await el.setInputFiles(files)
        attached++
      } catch {
        /* skip this input */
      }
    }
  }
  return attached
}

/** The automated posting browser context, if open. */
export function postingContext(): BrowserContext | null {
  return postingCtx
}

/** URL of the most recently used tab in the posting browser. */
export function currentPostingUrl(): string | null {
  if (!postingCtx) return null
  const pages = postingCtx.pages().filter((p) => !p.isClosed() && /^https?:/.test(p.url()))
  return pages.length ? pages[pages.length - 1].url() : null
}

// ---------- headless (checks) ----------
export async function withHeadless<T>(browserPath: string | null, fn: (browser: Browser | null) => Promise<T>): Promise<T> {
  if (!browserPath) return fn(null)
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ executablePath: browserPath, headless: true })
  } catch {
    browser = null // fall back to plain HTTP fetch
  }
  try {
    return await fn(browser)
  } finally {
    await browser?.close().catch(() => undefined)
  }
}
