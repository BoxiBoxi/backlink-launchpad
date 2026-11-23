// Decide whether a browser URL is the published post/listing for a target site.
// Used by the posting session to save the live URL automatically after the user submits.
// Pure logic: no Electron, no DB.

import { hostOf } from './linkAnalysis'

/** Site-specific post URL shapes (host suffix -> path regex). Checked before the generic rule. */
const KNOWN: [string, RegExp][] = [
  ['dev.to', /^\/[\w-]+\/[\w-]*-[a-z0-9]{3,}\/?$/i],
  ['reddit.com', /\/comments\/[a-z0-9]+/i],
  ['medium.com', /^\/(@[\w.-]+\/|p\/)?[\w-]*-[a-f0-9]{8,}\/?$/i],
  ['hashnode.dev', /^\/[\w-]{6,}\/?$/i],
  ['producthunt.com', /^\/(posts|products)\/[\w-]+\/?$/i],
  ['indiehackers.com', /^\/post\/[\w-]+/i],
  ['news.ycombinator.com', /^\/item$/i],
  ['viblo.asia', /^\/p\/[\w-]+/i],
  ['telegra.ph', /^\/[\w%-]+-\d{2}-\d{2}(-\d+)?\/?$/i],
  ['linkedin.com', /^\/pulse\/[\w%-]+/i],
  ['quora.com', /\/answer\//i],
  ['spiderum.com', /^\/bai-dang\/[\w-]+/i],
  ['tumblr.com', /\/(post\/)?\d{6,}/i]
]

/** Path segments that mean "still in the editor / auth / dashboard", never a published post. */
const NOT_A_POST =
  /(^|\/)(new|submit|submission|create|compose|write|draft|drafts|edit|editor|preview|login|log-in|signin|sign-in|signup|sign-up|register|auth|oauth|sso|callback|verify|confirm|settings|account|dashboard|onboarding|notifications|search|admin|me|home|feed|logout|checkout|pricing|cart|payment|thank-you|thanks|success|pending|manage-item|launch|add-new|new-story|new-post|publish)(\/|$)/i

function sameSite(url: string, siteUrl: string): boolean {
  const a = hostOf(url)
  const b = hostOf(siteUrl)
  if (!a || !b) return false
  const root = (h: string) => h.split('.').slice(-2).join('.')
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`) || root(a) === root(b)
}

const norm = (u: string) => u.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase()

export interface DetectInput {
  url: string
  siteUrl: string
  submitUrl: string
}

/** True when `url` looks like the live post on the target site (not the submit page, editor, login or home). */
export function looksLikePostUrl({ url, siteUrl, submitUrl }: DetectInput): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (!/^https?:$/.test(u.protocol)) return false
  if (!sameSite(url, siteUrl) && !sameSite(url, submitUrl)) {
    // Hashnode / Substack / Blogger style blogs live on the user's own subdomain or custom domain:
    // only the known per-platform rules can vouch for those.
    const host = u.hostname.toLowerCase()
    if (!KNOWN.some(([h]) => host.endsWith(h))) return false
  }
  if (norm(url) === norm(submitUrl) || norm(url) === norm(siteUrl)) return false
  const path = u.pathname
  if (path === '/' || path === '') {
    // Hacker News items: /item?id=123
    return false
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const known = KNOWN.find(([h]) => host === h || host.endsWith(`.${h}`))
  if (known) {
    if (known[0] === 'news.ycombinator.com') return known[1].test(path) && u.searchParams.has('id')
    return known[1].test(path) && !/\/edit\/?$/i.test(path)
  }

  if (NOT_A_POST.test(path)) return false
  // Generic: last path segment is a slug or an id (contains a hyphen or a digit run, reasonably long).
  const last = path.split('/').filter(Boolean).pop() || ''
  return last.length >= 6 && (/[a-z0-9]-[a-z0-9]/i.test(last) || /\d{4,}/.test(last))
}
