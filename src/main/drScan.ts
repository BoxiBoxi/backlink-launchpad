// Fill the catalog's DR column from Ahrefs (free endpoint). One request per root domain, 3 in parallel.
import { fetchDomainRating, rootDomain } from '@core/ahrefs'
import type { DrScanResult } from '@shared/types'
import { siteRepo } from './repo'
import { ahrefsKey } from './config'
import { emit } from './events'

let running = false

export async function scanDr(ids: number[] | null, force = false): Promise<DrScanResult> {
  const key = ahrefsKey()
  if (!key) throw new Error('No Ahrefs API key. Set AHREFS_API_KEY in .env or add it in Settings.')
  if (running) throw new Error('A DR scan is already running.')
  running = true
  try {
    const all = siteRepo.list()
    const chosen = ids ? all.filter((s) => ids.includes(s.id)) : all
    const todo = force ? chosen : chosen.filter((s) => s.dr === null)
    const byRoot = new Map<string, number[]>()
    for (const s of todo) {
      const root = rootDomain(s.url)
      byRoot.set(root, [...(byRoot.get(root) ?? []), s.id])
    }
    const roots = [...byRoot.keys()]
    const result: DrScanResult = { domains: roots.length, updated: 0, failed: 0, skipped: chosen.length - todo.length }
    let done = 0
    let next = 0
    let fatal = ''
    emit({ type: 'drProgress', done, total: roots.length })
    const worker = async () => {
      while (!fatal && next < roots.length) {
        const root = roots[next++]
        const r = await fetchDomainRating(key, root)
        if (r.dr !== null) {
          for (const id of byRoot.get(root)!) siteRepo.setDr(id, r.dr)
          result.updated += byRoot.get(root)!.length
        } else {
          result.failed += byRoot.get(root)!.length
          if (r.status === 401 || r.status === 403) fatal = `Ahrefs rejected the API key (HTTP ${r.status}).`
          if (r.status === 429) fatal = 'Ahrefs rate limit reached (HTTP 429). Try again later; sites done so far are saved.'
        }
        done++
        if (done % 3 === 0 || done === roots.length) emit({ type: 'drProgress', done, total: roots.length })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    if (fatal) result.error = fatal
    emit({ type: 'drProgress', done: roots.length, total: roots.length })
    return result
  } finally {
    running = false
  }
}
