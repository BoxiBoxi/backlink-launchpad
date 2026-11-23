// Validates catalog/sites.json: required fields, allowed values, https URLs, no duplicates.
import sites from '../catalog/sites.json'
import { seedKey, type SeedSite } from '../src/core/catalogSeed'

const TYPES = ['directory', 'launch', 'ugc_blog', 'community', 'forum', 'qa']
const LANGS = ['en', 'vi']
const FORMATS = ['plain', 'markdown', 'html']
const errors: string[] = []
const seen = new Map<string, string>()

;(sites as SeedSite[]).forEach((s, i) => {
  const at = `#${i} ${s.name || '(no name)'}`
  if (!s.name?.trim()) errors.push(`${at}: name is required`)
  for (const f of ['url', 'submitUrl'] as const) {
    try {
      if (new URL(s[f]).protocol !== 'https:') errors.push(`${at}: ${f} must be https`)
    } catch {
      errors.push(`${at}: ${f} is not a valid URL`)
    }
  }
  if (!TYPES.includes(s.type)) errors.push(`${at}: type must be one of ${TYPES.join(', ')}`)
  if (!LANGS.includes(s.language)) errors.push(`${at}: language must be one of ${LANGS.join(', ')}`)
  if (!FORMATS.includes(s.format)) errors.push(`${at}: format must be one of ${FORMATS.join(', ')}`)
  if (!Array.isArray(s.topics)) errors.push(`${at}: topics must be an array`)
  if (s.priority !== undefined && !(Number.isInteger(s.priority) && s.priority >= 0 && s.priority <= 100)) errors.push(`${at}: priority must be an integer 0-100`)
  const key = seedKey(s.url)
  if (seen.has(key)) errors.push(`${at}: duplicate of ${seen.get(key)} (${key})`)
  seen.set(key, s.name)
})

if (errors.length) {
  console.log(errors.join('\n'))
  console.log(`catalog: ${errors.length} problem(s)`)
  process.exit(1)
}
console.log(`catalog: ${sites.length} sites OK`)
