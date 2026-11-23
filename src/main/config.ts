// Runtime configuration: .env (same variable names as Wriai) + overrides saved in Settings.
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'
import { gatewaysFromEnv, parseModelList, type AiGateway } from '@core/ai'
import { settingsRepo } from './repo'
import { detectBrave } from './browser'
import type { Settings, SettingsInput } from '@shared/types'

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

export const profileDir = () => join(app.getPath('userData'), 'brave-profile')

export function getBravePath(): string | null {
  const saved = settingsRepo.get('bravePath')
  if (saved && existsSync(saved)) return saved
  return detectBrave()
}

export function aiGateways(): AiGateway[] {
  const env = { ...process.env }
  const endpoint = settingsRepo.get('aiEndpoint')
  const model = settingsRepo.get('aiModel')
  const key = settingsRepo.get('aiApiKey')
  if (endpoint) env.OPENAI_END_POINT = endpoint
  if (model) env.OPENAI_TEXT_MODEL = model
  if (key) env.OPENAI_API_KEY = key
  return gatewaysFromEnv(env)
}

export function ahrefsKey(): string {
  return settingsRepo.get('ahrefsApiKey') || process.env.AHREFS_API_KEY?.trim() || ''
}

export function aiTimeoutMs(): number {
  const v = parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10)
  return Number.isFinite(v) && v > 0 ? v : 120000
}

export function getSettings(): Settings {
  const gws = aiGateways()
  return {
    bravePath: getBravePath() || '',
    profileDir: profileDir(),
    linkCheckIntervalHours: Number(settingsRepo.get('linkCheckIntervalHours') || 24),
    aiEndpoint: gws[0]?.url || '',
    aiModel: gws[0] ? gws[0].models.join(' | ') : parseModelList(process.env.OPENAI_TEXT_MODEL).join(' | '),
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
  for (const [field, key] of [
    ['aiEndpoint', 'aiEndpoint'],
    ['aiModel', 'aiModel'],
    ['aiApiKey', 'aiApiKey'],
    ['ahrefsApiKey', 'ahrefsApiKey']
  ] as const) {
    const v = input[field]
    if (v === undefined) continue
    if (v.trim()) settingsRepo.set(key, v.trim())
    else settingsRepo.delete(key)
  }
  return getSettings()
}
