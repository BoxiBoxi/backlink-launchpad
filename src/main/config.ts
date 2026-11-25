// Runtime configuration: .env (same variable names as Wriai) + overrides saved in Settings.
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'
import { gatewaysFromEnv, parseModelList, wriaiGateway, WRIAI_API_BASE, type AiGateway } from '@core/ai'
import { settingsRepo } from './repo'
import { browserKind, browserName, detectBrave } from './browser'
import type { AiProvider, Settings, SettingsInput } from '@shared/types'

/** .env lookup order: userData, next to the exe (packaged), project root (dev). First file wins per variable. */
export function loadEnv(): string[] {
  const candidates = [
    join(app.getPath('userData'), '.env'),
    join(dirname(app.getPath('exe')), '.env'),
    join(app.getAppPath(), '.env'),
    join(process.cwd(), '.env')
  ]
  const loaded: string[] = []
  for (const file of [...new Set(candidates)]) {
    if (existsSync(file)) {
      dotenv.config({ path: file, override: false, quiet: true })
      loaded.push(file)
    }
  }
  return loaded
}

/**
 * Dedicated profile folder for the current browser. Each browser gets its own folder: Chrome, Edge and Brave
 * encrypt cookies with a browser-specific key, so a profile written by one is logged out in another, and a
 * profile from a newer browser version can break an older one.
 *
 * Older versions used a single "brave-profile" folder for whatever browser was installed. On first run it is
 * claimed by the current browser (recorded in a marker file), so existing users keep their logins.
 */
export function profileDir(): string {
  const userData = app.getPath('userData')
  const path = getBravePath()
  const kind = browserKind(path)
  const legacy = join(userData, 'brave-profile')
  if (existsSync(legacy)) {
    const marker = join(legacy, '.backlink-browser')
    let owner = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : ''
    if (!owner && path) {
      owner = kind
      try {
        writeFileSync(marker, kind)
      } catch {
        /* read-only: still use it this run */
      }
    }
    if (owner === kind) return legacy
  }
  return join(userData, `profile-${kind}`)
}

export function getBravePath(): string | null {
  const saved = settingsRepo.get('bravePath')
  if (saved && existsSync(saved)) return saved
  return detectBrave()
}

function customGateways(): AiGateway[] {
  const env = { ...process.env }
  const endpoint = settingsRepo.get('aiEndpoint')
  const model = settingsRepo.get('aiModel')
  const key = settingsRepo.get('aiApiKey')
  if (endpoint) env.OPENAI_END_POINT = endpoint
  if (model) env.OPENAI_TEXT_MODEL = model
  if (key) env.OPENAI_API_KEY = key
  return gatewaysFromEnv(env)
}

export function wriaiKey(): string {
  return settingsRepo.get('wriaiApiKey') || process.env.WRIAI_API_KEY?.trim() || ''
}

/** Wriai is the default for new users; existing setups with an OpenAI-compatible key keep "custom". */
export function aiProvider(): AiProvider {
  const saved = settingsRepo.get('aiProvider')
  if (saved === 'wriai' || saved === 'custom') return saved
  return customGateways().length && !wriaiKey() ? 'custom' : 'wriai'
}

export function aiGateways(): AiGateway[] {
  if (aiProvider() === 'wriai') {
    const key = wriaiKey()
    return key ? [wriaiGateway(key, process.env.WRIAI_API_BASE || WRIAI_API_BASE)] : []
  }
  return customGateways()
}

export function ahrefsKey(): string {
  return settingsRepo.get('ahrefsApiKey') || process.env.AHREFS_API_KEY?.trim() || ''
}

export function aiTimeoutMs(): number {
  const v = parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10)
  return Number.isFinite(v) && v > 0 ? v : 120000
}

export function getSettings(): Settings {
  const gws = customGateways()
  return {
    aiProvider: aiProvider(),
    wriaiKeySet: !!wriaiKey(),
    bravePath: getBravePath() || '',
    browserName: browserName(getBravePath()),
    profileDir: profileDir(),
    linkCheckIntervalHours: Number(settingsRepo.get('linkCheckIntervalHours') || 24),
    // Nothing configured yet: show the standard OpenAI endpoint and a default model, so "paste your key" is enough.
    aiEndpoint: gws[0]?.url || settingsRepo.get('aiEndpoint') || process.env.OPENAI_END_POINT || 'https://api.openai.com/v1',
    aiModel: gws[0] ? gws[0].models.join(' | ') : parseModelList(settingsRepo.get('aiModel') || process.env.OPENAI_TEXT_MODEL, ['gpt-4.1-mini']).join(' | '),
    aiApiKeySet: gws.length > 0,
    ahrefsKeySet: !!ahrefsKey()
  }
}

export function saveSettings(input: SettingsInput): Settings {
  if (input.bravePath !== undefined) {
    if (input.bravePath.trim()) settingsRepo.set('bravePath', input.bravePath.trim())
    else settingsRepo.delete('bravePath')
  }
  if (input.linkCheckIntervalHours !== undefined) {
    settingsRepo.set('linkCheckIntervalHours', String(Math.max(1, Math.round(input.linkCheckIntervalHours))))
  }
  if (input.aiProvider) settingsRepo.set('aiProvider', input.aiProvider)
  for (const [field, key] of [
    ['aiEndpoint', 'aiEndpoint'],
    ['aiModel', 'aiModel'],
    ['aiApiKey', 'aiApiKey'],
    ['ahrefsApiKey', 'ahrefsApiKey'],
    ['wriaiApiKey', 'wriaiApiKey']
  ] as const) {
    const v = input[field]
    if (v === undefined) continue
    if (v.trim()) settingsRepo.set(key, v.trim())
    else settingsRepo.delete(key)
  }
  return getSettings()
}
