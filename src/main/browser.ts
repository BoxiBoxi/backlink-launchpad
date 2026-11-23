// Brave automation via Playwright.
// - Posting uses a persistent context on a DEDICATED profile (<userData>/brave-profile), never the user's main profile.
// - The app only navigates and pre-fills fields. It never clicks submit, never solves CAPTCHAs, never creates accounts.
// - Checks (site alive, link monitor) use a separate headless Brave instance without the profile.
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright-core'

export function detectBrave(): string | null {
  const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LOCALAPPDATA']].filter(Boolean) as string[]
  for (const root of roots) {
    const p = join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    if (existsSync(p)) return p
  }
  return null
}

let postingCtx: BrowserContext | null = null
let manualProcessRunning = false

export function isPostingBrowserRunning(): boolean {
  return postingCtx !== null || manualProcessRunning
}

async function ensurePostingContext(bravePath: string, profileDir: string): Promise<BrowserContext> {
  if (postingCtx) return postingCtx
  if (manualProcessRunning) {
    throw new Error('The Brave login window is still open. Close it first, then click Open again (the profile can only be used by one window).')
  }
  mkdirSync(profileDir, { recursive: true })
  try {
    postingCtx = await chromium.launchPersistentContext(profileDir, {
      executablePath: bravePath,
      headless: false,
      viewport: null,
      args: ['--start-maximized', '--no-first-run', '--no-default-browser-check']
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/user data directory is already in use|ProcessSingleton|exitCode=21/i.test(msg)) {
      throw new Error('The BacklinkBuilder Brave profile is already open in another window. Close that Brave window and try again.')
    }
    throw err
  }
  postingCtx.on('close', () => {
    postingCtx = null
  })
  return postingCtx
}

/**
 * Open Brave on the dedicated profile WITHOUT automation, so the user can sign in to sites normally
 * (some providers refuse logins in automated browsers). Sessions persist in the profile.
 */
export async function openProfileForLogin(bravePath: string, profileDir: string, url: string | null): Promise<void> {
  if (postingCtx) {
    const page = await postingCtx.newPage()
    if (url) await page.goto(url).catch(() => undefined)
    await page.bringToFront()
    return
  }
  mkdirSync(profileDir, { recursive: true })
  const child = spawn(bravePath, [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', ...(url ? [url] : [])], {
    detached: false,
    stdio: 'ignore'
  })
  manualProcessRunning = true
  child.on('exit', () => {
    manualProcessRunning = false
  })
  child.on('error', () => {
    manualProcessRunning = false
  })
}

export async function closePostingBrowser(): Promise<void> {
  const ctx = postingCtx
  postingCtx = null
  await ctx?.close().catch(() => undefined)
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
  bravePath: string
  profileDir: string
  url: string
  title: string
  body: string
  logo: string
  images: string[]
}

export async function openForPosting(input: OpenForPostingInput): Promise<{ title: boolean; body: boolean; files: number; page: Page }> {
  const ctx = await ensurePostingContext(input.bravePath, input.profileDir)
  const blank = ctx.pages().find((p) => p.url() === 'about:blank')
  const page = blank ?? (await ctx.newPage())
  await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.bringToFront()
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)

  const frames = page.frames()
  let titleMark: string | null = null
  if (input.title) titleMark = await tryFill(frames, TITLE_SELECTORS, input.title, page)
  const bodyMark = input.body ? await tryFill(frames, BODY_SELECTORS, input.body, page, titleMark ?? undefined) : null
  const files = await attachImages(frames, input.logo, input.images)
  // Leave the page as is: the user reviews, signs in / solves CAPTCHA if needed, and submits.
  return { title: titleMark !== null, body: bodyMark !== null, files, page }
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
export async function withHeadless<T>(bravePath: string | null, fn: (browser: Browser | null) => Promise<T>): Promise<T> {
  if (!bravePath) return fn(null)
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ executablePath: bravePath, headless: true })
  } catch {
    browser = null // fall back to plain HTTP fetch
  }
  try {
    return await fn(browser)
  } finally {
    await browser?.close().catch(() => undefined)
  }
}
