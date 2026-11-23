// Built-in site catalog. The data lives in catalog/sites.json (edit that file to add or fix sites; run `pnpm test`).
// Link types start as "unknown" until a placed link is verified; DR is fetched from Ahrefs or entered manually.

import type { SiteInput } from '@shared/types'
import sites from '../../catalog/sites.json'

/** Shape of one entry in catalog/sites.json. */
export type SeedSite = Pick<SiteInput, 'name' | 'url' | 'submitUrl' | 'type' | 'language' | 'topics' | 'format' | 'rules'> &
  Partial<Pick<SiteInput, 'needsReview' | 'maxLength' | 'notes' | 'priority'>>

/** Bump when catalog/sites.json gains sites: existing databases get the missing ones (matched by seedKey). */
export const CATALOG_VERSION = 4

export const seedHost = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Identity of a catalog entry: the hostname, plus the subreddit for reddit.com/r/... entries. */
export const seedKey = (url: string) => {
  const host = seedHost(url)
  if (host.endsWith('reddit.com')) {
    const sub = url.match(/reddit\.com\/(r\/[^/?#]+)/i)
    if (sub) return `reddit.com/${sub[1].toLowerCase()}`
  }
  return host
}

export const CATALOG_SEED: SiteInput[] = (sites as SeedSite[])
  .map((s) => ({
    needsReview: false,
    maxLength: null,
    notes: '',
    ...s,
    priority: s.priority ?? 50,
    dr: null,
    linkType: 'unknown' as const,
    status: 'active' as const
  }))
  .sort((a, b) => b.priority - a.priority)
