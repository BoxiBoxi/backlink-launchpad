// Ahrefs Domain Rating via the free public endpoint (same call as Wriai's src/lib/authority.ts).
// GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<root domain>  (costs 0 API units)
// DR is a domain-level metric, so subdomains and subreddits are looked up by their root domain.

const TWO_PART_TLDS = new Set(['com.vn', 'org.vn', 'edu.vn', 'gov.vn', 'net.vn', 'co.uk', 'org.uk', 'com.au', 'co.jp', 'com.sg', 'co.in', 'com.br'])

export function rootDomain(urlOrHost: string): string {
  let host = urlOrHost.trim().toLowerCase()
  try {
    host = new URL(host.includes('://') ? host : `https://${host}`).hostname
  } catch {
    /* keep as is */
  }
  host = host.replace(/^www\./, '')
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const lastTwo = parts.slice(-2).join('.')
  return TWO_PART_TLDS.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo
}

export interface DrResult {
  dr: number | null
  /** HTTP status, or 0 on network error / timeout */
  status: number
  error?: string
}

export async function fetchDomainRating(apiKey: string, domain: string, timeoutMs = 15000): Promise<DrResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(rootDomain(domain))}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { dr: null, status: res.status, error: text.slice(0, 200) }
    }
    const data = (await res.json()) as { domain_rating?: { domain_rating?: unknown } }
    const dr = data?.domain_rating?.domain_rating
    return { dr: typeof dr === 'number' ? Math.round(dr) : null, status: res.status }
  } catch (err) {
    return { dr: null, status: 0, error: controller.signal.aborted ? `timeout after ${timeoutMs}ms` : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Catalog priority once the real DR is known: 70% the researched score (relevance, cost/effort, link value and an
 * authority estimate), 30% Ahrefs DR. Keep PRIORITY_SQL in sync (used to re-score existing rows on startup).
 */
export const PRIORITY_DR_WEIGHT = 0.3
export function priorityWithDr(base: number, dr: number): number {
  return Math.max(0, Math.min(100, Math.round((1 - PRIORITY_DR_WEIGHT) * base + PRIORITY_DR_WEIGHT * dr)))
}
export const PRIORITY_SQL = `MAX(0, MIN(100, CAST(ROUND(${1 - PRIORITY_DR_WEIGHT} * priority_base + ${PRIORITY_DR_WEIGHT} * dr) AS INTEGER)))`
