// Pure helpers for the link monitor: decide whether a page links to a target and how.

import type { Rel } from '@shared/types'

export interface PageAnchor {
  href: string
  rel: string
  text: string
}

export interface LinkVerdict {
  linkFound: boolean
  rel: Rel | null
  relRaw: string
  anchorFound: string
  matchedHref: string
}

/** Normalise a URL for comparison: lower-case host without www, no hash, no trailing slash, no tracking params. */
export function normalizeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim())
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const params = new URLSearchParams(u.search)
    for (const key of [...params.keys()]) if (/^(utm_|ref$|fbclid|gclid)/i.test(key)) params.delete(key)
    const query = params.toString()
    const path = u.pathname.replace(/\/+$/, '') || ''
    return `${host}${path}${query ? `?${query}` : ''}`
  } catch {
    return null
  }
}

export function hostOf(input: string): string | null {
  try {
    return new URL(input.trim()).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export function classifyRel(relRaw: string): Rel {
  const tokens = relRaw.toLowerCase().split(/\s+/).filter(Boolean)
  const flags = ['nofollow', 'ugc', 'sponsored'].filter((t) => tokens.includes(t))
  if (flags.length === 0) return 'dofollow'
  if (flags.length > 1) return 'mixed'
  return flags[0] as Rel
}

/**
 * Pick the best anchor pointing at `targetUrl`: exact normalised URL first, then same host.
 * Several matches: prefer a dofollow one (that is what counts for SEO).
 */
export function analyzeAnchors(anchors: PageAnchor[], targetUrl: string, metaNofollow = false): LinkVerdict {
  const target = normalizeUrl(targetUrl)
  const targetHost = hostOf(targetUrl)
  const exact: PageAnchor[] = []
  const sameHost: PageAnchor[] = []
  for (const a of anchors) {
    const n = normalizeUrl(a.href)
    if (!n) continue
    if (target && n === target) exact.push(a)
    else if (targetHost && hostOf(a.href) === targetHost) sameHost.push(a)
  }
  const pool = exact.length ? exact : sameHost
  if (!pool.length) return { linkFound: false, rel: null, relRaw: '', anchorFound: '', matchedHref: '' }
  const best = pool.find((a) => classifyRel(a.rel) === 'dofollow') || pool[0]
  let rel = classifyRel(best.rel)
  if (metaNofollow && rel === 'dofollow') rel = 'nofollow'
  return {
    linkFound: true,
    rel,
    relRaw: metaNofollow ? `${best.rel} (meta robots nofollow)`.trim() : best.rel,
    anchorFound: best.text.replace(/\s+/g, ' ').trim().slice(0, 200),
    matchedHref: best.href
  }
}

/** Fallback HTML parser (used when no browser is available): regex over <a> tags. */
export function extractAnchorsFromHtml(html: string, baseUrl: string): PageAnchor[] {
  const out: PageAnchor[] = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = m[1]
    const href = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    if (!href) continue
    const rawHref = href[2] ?? href[3] ?? href[4] ?? ''
    const rel = attrs.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    let abs = rawHref
    try {
      abs = new URL(rawHref, baseUrl).toString()
    } catch {
      /* keep raw */
    }
    out.push({ href: abs, rel: rel ? (rel[2] ?? rel[3] ?? rel[4] ?? '') : '', text: m[2].replace(/<[^>]+>/g, ' ') })
  }
  return out
}

export function hasMetaNofollow(html: string): boolean {
  const metas = html.match(/<meta[^>]+name\s*=\s*["']?robots["']?[^>]*>/gi) || []
  return metas.some((t) => /content\s*=\s*["'][^"']*nofollow/i.test(t))
}
