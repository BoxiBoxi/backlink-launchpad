// Site form recipes: for each site, which form field means what (selector -> tagline, pricing, ...).
// They hold no personal values, so they can be shared: the app ships catalog/forms.json (built by the community,
// like catalog/sites.json), and what the extension learns on this computer is kept per site and wins over it.
import bundled from '../../catalog/forms.json'
import { settingsRepo } from './repo'

export interface RecipeField {
  key: string
  name: string
  label: string
}
export interface Recipe {
  fields: Record<string, RecipeField>
  updatedAt?: string
}
export interface RecipeFile {
  type: 'backlink-launchpad/form-recipes'
  version: 1
  sites: Record<string, Recipe>
}

const PREFIX = 'formRecipe:'
const MAX_FIELDS = 80
const BUNDLED = ((bundled as { sites?: Record<string, Recipe> }).sites ?? {}) as Record<string, Recipe>

function readLocal(host: string): Recipe | null {
  try {
    const raw = settingsRepo.get(PREFIX + host)
    return raw ? (JSON.parse(raw) as Recipe) : null
  } catch {
    return null
  }
}

/** The recipe for a site: the shared one, with what was learned on this computer on top. */
export function recipeFor(host: string): Recipe | null {
  const shared = BUNDLED[host]
  const local = readLocal(host)
  if (!shared && !local) return null
  return { fields: { ...(shared?.fields ?? {}), ...(local?.fields ?? {}) }, updatedAt: local?.updatedAt ?? shared?.updatedAt }
}

const validField = (selector: string, f: Partial<RecipeField>) =>
  typeof selector === 'string' && selector.length > 0 && selector.length < 300 && typeof f.key === 'string' && f.key.length > 0 && f.key.length < 130

/** Remember which selector holds which kind of value on this site. */
export function learnRecipe(host: string, items: { selector?: string; key: string; name: string; label: string }[]) {
  const r = readLocal(host) ?? { fields: {} }
  let changed = false
  for (const it of items) {
    if (!it.selector || !validField(it.selector, it)) continue
    const next = { key: it.key, name: String(it.name || it.key).slice(0, 80), label: String(it.label || '').slice(0, 120) }
    const prev = r.fields[it.selector]
    if (prev && prev.key === next.key && prev.label === next.label) continue
    r.fields[it.selector] = next
    changed = true
  }
  if (!changed) return
  const selectors = Object.keys(r.fields)
  if (selectors.length > MAX_FIELDS) selectors.slice(0, selectors.length - MAX_FIELDS).forEach((s) => delete r.fields[s])
  r.updatedAt = new Date().toISOString()
  settingsRepo.set(PREFIX + host, JSON.stringify(r))
}

function localHosts(): string[] {
  return settingsRepo.list(PREFIX).map((row) => row.key.slice(PREFIX.length))
}

export function recipeStats() {
  const local = localHosts()
  const fields = local.reduce((n, h) => n + Object.keys(readLocal(h)?.fields ?? {}).length, 0)
  return { sites: local.length, fields, sharedSites: Object.keys(BUNDLED).length }
}

/** Every recipe learned on this computer, merged with the shared ones, as one shareable file. */
export function exportRecipes(): RecipeFile {
  const sites: Record<string, Recipe> = {}
  for (const host of new Set([...Object.keys(BUNDLED), ...localHosts()])) {
    const r = recipeFor(host)
    if (r && Object.keys(r.fields).length) sites[host] = { fields: r.fields, updatedAt: r.updatedAt }
  }
  return { type: 'backlink-launchpad/form-recipes', version: 1, sites }
}

/** Merge recipes from a file (a teammate's export or catalog/forms.json). Returns what was added. */
export function importRecipes(data: unknown): { sites: number; fields: number } {
  const sites = (data as { sites?: Record<string, Recipe> })?.sites
  if (!sites || typeof sites !== 'object') throw new Error('This is not a Backlink Launchpad form recipes file')
  let siteCount = 0
  let fieldCount = 0
  for (const [host, recipe] of Object.entries(sites)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || !recipe || typeof recipe.fields !== 'object') continue
    const local = readLocal(host.toLowerCase()) ?? { fields: {} }
    let added = 0
    for (const [selector, f] of Object.entries(recipe.fields)) {
      if (!validField(selector, f) || local.fields[selector]) continue
      local.fields[selector] = { key: f.key, name: String(f.name || f.key).slice(0, 80), label: String(f.label || '').slice(0, 120) }
      added++
    }
    if (!added) continue
    local.updatedAt = new Date().toISOString()
    settingsRepo.set(PREFIX + host.toLowerCase(), JSON.stringify(local))
    siteCount++
    fieldCount += added
  }
  return { sites: siteCount, fields: fieldCount }
}
