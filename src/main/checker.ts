// Site-alive checks and placed-link checks (headless Brave, with plain fetch fallback).
import type { Browser } from 'playwright-core'
import { analyzeAnchors, extractAnchorsFromHtml, hasMetaNofollow, type PageAnchor } from '@core/linkAnalysis'
import type { Alive, PlacedLink, SiteCheckResult } from '@shared/types'
import { linkRepo, siteRepo } from './repo'
import { withHeadless } from './browser'
import { getBravePath } from './config'

const FETCH_TIMEOUT = 20000

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

async function fetchPage(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { Accept: 'text/html,*/*' } })
    const html = res.headers.get('content-type')?.includes('html') ? await res.text() : ''
    return { status: res.status, html, finalUrl: res.url }
  } finally {
    clearTimeout(timer)
  }
}

interface Loaded {
  status: number | null
  anchors: PageAnchor[]
  metaNofollow: boolean
  error: string
}

async function loadWithBrowser(browser: Browser, url: string): Promise<Loaded> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined)
    const data = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: (a as HTMLAnchorElement).href,
        rel: a.getAttribute('rel') || '',
        text: (a as HTMLElement).innerText || a.textContent || ''
      }))
      const robots = Array.from(document.querySelectorAll('meta[name="robots" i]'))
        .map((m) => m.getAttribute('content') || '')
        .join(',')
      return { anchors, metaNofollow: /nofollow/i.test(robots) }
    })
    return { status: res?.status() ?? null, anchors: data.anchors, metaNofollow: data.metaNofollow, error: '' }
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

async function loadWithFetch(url: string): Promise<Loaded> {
  const r = await fetchPage(url)
  return { status: r.status, anchors: extractAnchorsFromHtml(r.html, r.finalUrl), metaNofollow: hasMetaNofollow(r.html), error: '' }
}

function aliveFromStatus(status: number | null): Alive {
  if (status === null) return 'down'
  if (status === 404 || status === 410) return 'down'
  if (status >= 500 && status !== 503) return 'down'
  return 'up' // 2xx/3xx, and 401/403/429/503 = server answers (often a bot wall)
}

export async function checkSites(ids: number[] | null): Promise<SiteCheckResult[]> {
  const all = siteRepo.list()
  const targets = ids ? all.filter((s) => ids.includes(s.id)) : all
  return withHeadless(getBravePath(), async (browser) =>
    pool(targets, 4, async (site): Promise<SiteCheckResult> => {
      let status: number | null = null
      let error: string | undefined
      try {
        status = (await fetchPage(site.url)).status
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      // Bot walls or fetch failure: confirm with a real browser.
      if (browser && (status === null || status === 403 || status === 429 || status === 503)) {
        try {
          const ctx = await browser.newContext()
          const page = await ctx.newPage()
          const res = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          status = res?.status() ?? status
          error = undefined
          await ctx.close()
        } catch (err) {
          error = err instanceof Error ? err.message.split('\n')[0] : String(err)
        }
      }
      const alive = aliveFromStatus(status)
      siteRepo.setAlive(site.id, alive, status)
      return { siteId: site.id, alive, httpStatus: status, error }
    })
  )
}

export async function checkLinks(ids: number[] | null): Promise<PlacedLink[]> {
  const all = linkRepo.list(null)
  const targets = ids ? all.filter((l) => ids.includes(l.id)) : all
  return checkLinkList(targets)
}

export async function checkLinkList(targets: PlacedLink[]): Promise<PlacedLink[]> {
  if (!targets.length) return []
  return withHeadless(getBravePath(), async (browser) =>
    pool(targets, 3, async (link) => {
      let loaded: Loaded
      try {
        loaded = browser ? await loadWithBrowser(browser, link.pageUrl) : await loadWithFetch(link.pageUrl)
      } catch (err) {
        loaded = { status: null, anchors: [], metaNofollow: false, error: err instanceof Error ? err.message.split('\n')[0] : String(err) }
      }
      const pageLive = loaded.status !== null && loaded.status < 400
      const verdict = analyzeAnchors(loaded.anchors, link.targetUrl, loaded.metaNofollow)
      const updated = linkRepo.update({
        id: link.id,
        pageLive,
        linkFound: pageLive ? verdict.linkFound : null,
        rel: verdict.rel,
        relRaw: verdict.relRaw,
        anchorFound: verdict.anchorFound,
        httpStatus: loaded.status,
        error: loaded.error || (pageLive ? '' : `HTTP ${loaded.status ?? 'error'}`),
        lastCheckedAt: new Date().toISOString()
      })
      // Learn the site's link policy from a verified placement.
      if (updated.siteId && updated.linkFound && updated.rel) {
        const site = siteRepo.get(updated.siteId)
        const learned = updated.rel === 'dofollow' ? 'dofollow' : updated.rel === 'ugc' ? 'ugc' : 'nofollow'
        if (site && site.linkType === 'unknown') siteRepo.setLinkType(site.id, learned)
      }
      return updated
    })
  )
}

/** Background monitor: re-checks links older than the configured interval. */
export function startLinkScheduler(getIntervalHours: () => number): () => void {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const cutoff = new Date(Date.now() - getIntervalHours() * 3600_000).toISOString()
      await checkLinkList(linkRepo.dueForCheck(cutoff))
    } catch (err) {
      console.warn('[scheduler] link check failed', err)
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, 60_000)
  const timer = setInterval(tick, 30 * 60_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
