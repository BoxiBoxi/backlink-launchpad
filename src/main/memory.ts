// Form memory: what the user typed into submit forms, kept per project and offered on the next sites.
// The browser extension decides what a field means (tagline, pricing, twitter...) and sends key + value here.
// Passwords, card numbers, one-time codes and captchas are never sent (filtered in the extension and here).
import type { FormMemoryEntry, Project } from '@shared/types'
import { projectRepo, settingsRepo } from './repo'

const PREFIX = 'formMemory:'
const LEARN_KEY = 'formMemoryLearn'
const MAX_VALUE = 5000
const MAX_ENTRIES = 200

type Store = Record<string, Omit<FormMemoryEntry, 'key'>>

function read(projectId: number): Store {
  try {
    return JSON.parse(settingsRepo.get(PREFIX + projectId) || '{}') as Store
  } catch {
    return {}
  }
}

function write(projectId: number, store: Store) {
  settingsRepo.set(PREFIX + projectId, JSON.stringify(store))
}

export function learningEnabled(): boolean {
  return settingsRepo.get(LEARN_KEY) !== '0'
}
export function setLearning(on: boolean) {
  settingsRepo.set(LEARN_KEY, on ? '1' : '0')
}

export function listMemory(projectId: number): FormMemoryEntry[] {
  return Object.entries(read(projectId))
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const SECRET = /pass|pwd|card|cvc|cvv|iban|otp|one-time|captcha|secret|token|api ?key|private key|security code|ssn|tax id|mat khau/i

export interface LearnItem {
  key: string
  name: string
  label: string
  value: string
}

/** Remember values typed on a page (newest wins). Returns how many entries changed. */
export function learn(projectId: number, site: string, items: LearnItem[]): number {
  if (!learningEnabled() || !projectRepo.get(projectId)) return 0
  const store = read(projectId)
  let changed = 0
  for (const it of items.slice(0, 50)) {
    const key = String(it.key || '').slice(0, 120)
    const value = String(it.value ?? '').trim().slice(0, MAX_VALUE)
    if (!key || !value || SECRET.test(key) || SECRET.test(it.label || '')) continue
    if (store[key]?.value === value) continue
    store[key] = { name: String(it.name || key).slice(0, 80), label: String(it.label || '').slice(0, 120), value, site, updatedAt: new Date().toISOString() }
    changed++
  }
  if (!changed) return 0
  // Keep the newest entries only.
  const keys = Object.keys(store)
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => store[a].updatedAt.localeCompare(store[b].updatedAt))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete store[k])
  }
  write(projectId, store)
  return changed
}

export interface MemoryFile {
  type: 'backlink-launchpad/form-memory'
  version: 1
  project: string
  entries: FormMemoryEntry[]
}

/** The project's remembered values as a file to share with a teammate (it holds your answers: share with care). */
export function exportMemory(projectId: number): MemoryFile {
  const project = projectRepo.get(projectId)
  if (!project) throw new Error('Project not found')
  return { type: 'backlink-launchpad/form-memory', version: 1, project: project.name, entries: listMemory(projectId) }
}

/** Merge a teammate's values into this project: entries that are new or newer replace ours. Returns the count. */
export function importMemory(projectId: number, data: unknown): number {
  if (!projectRepo.get(projectId)) throw new Error('Project not found')
  const entries = (data as { entries?: FormMemoryEntry[] })?.entries
  if (!Array.isArray(entries)) throw new Error('This is not a Backlink Launchpad form memory file')
  const store = read(projectId)
  let n = 0
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    if (!e || typeof e.key !== 'string' || typeof e.value !== 'string' || SECRET.test(e.key) || SECRET.test(e.label || '')) continue
    const mine = store[e.key]
    const updatedAt = typeof e.updatedAt === 'string' ? e.updatedAt : new Date().toISOString()
    if (mine && mine.updatedAt >= updatedAt) continue
    store[e.key] = { name: String(e.name || e.key).slice(0, 80), label: String(e.label || '').slice(0, 120), value: e.value.slice(0, MAX_VALUE), site: String(e.site || '').slice(0, 120), updatedAt }
    n++
  }
  if (n) write(projectId, store)
  return n
}

export function saveMemoryValue(projectId: number, key: string, value: string) {
  const store = read(projectId)
  if (!store[key]) throw new Error('Unknown entry')
  store[key] = { ...store[key], value: value.slice(0, MAX_VALUE), updatedAt: new Date().toISOString() }
  write(projectId, store)
}

export function deleteMemory(projectId: number, key: string | null) {
  if (key === null) return void settingsRepo.delete(PREFIX + projectId)
  const store = read(projectId)
  delete store[key]
  write(projectId, store)
}

/** Values the project already has, used for the same fields before anything is learned. */
export function projectDefaults(project: Project, website: string): Record<string, string> {
  const d: Record<string, string> = {
    productName: project.name,
    tagline: project.tagline,
    shortDescription: project.shortDescription,
    longDescription: project.longDescription,
    website,
    tags: project.topics.join(', ')
  }
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v && v.trim()))
}

/** Everything the extension may fill on a page for this project: learned values over project defaults. */
export function memoryForExtension(projectId: number) {
  const project = projectRepo.get(projectId)
  if (!project) return null
  const website = project.targets[0]?.url || (project.domain ? `https://${project.domain.replace(/^https?:\/\//, '')}` : '')
  const values: Record<string, { value: string; label: string; learned: boolean }> = {}
  for (const [key, value] of Object.entries(projectDefaults(project, website))) values[key] = { value, label: '', learned: false }
  for (const [key, e] of Object.entries(read(projectId))) values[key] = { value: e.value, label: e.label, learned: true }
  return { projectId, projectName: project.name, learn: learningEnabled(), values }
}
