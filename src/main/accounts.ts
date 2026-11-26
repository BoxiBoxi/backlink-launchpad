// Sign-up profile and per-site accounts for the browser extension's form filling (RoboForm style).
// - The profile (names, username, email, phone) is plain settings.
// - Each site gets its own generated password, encrypted with the OS keychain (Electron safeStorage) and stored
//   per host. Without a working keychain, passwords are generated but never stored.
import { safeStorage } from 'electron'
import { randomInt } from 'node:crypto'
import type { SavedAccount, SignupProfile } from '@shared/types'
import { settingsRepo, siteRepo } from './repo'

const PROFILE_KEY = 'signupProfile'
const ACCOUNT_PREFIX = 'account:'
const AUTOFILL_KEY = 'extensionAutofill'

const EMPTY_PROFILE: SignupProfile = { firstName: '', lastName: '', username: '', email: '', phone: '' }

export function getProfile(): SignupProfile {
  try {
    return { ...EMPTY_PROFILE, ...JSON.parse(settingsRepo.get(PROFILE_KEY) || '{}') }
  } catch {
    return { ...EMPTY_PROFILE }
  }
}

export function saveProfile(p: SignupProfile): SignupProfile {
  const clean: SignupProfile = {
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    username: p.username.trim(),
    email: p.email.trim(),
    phone: p.phone.trim()
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new Error('Enter a valid email address')
  settingsRepo.set(PROFILE_KEY, JSON.stringify(clean))
  return clean
}

/** Fill sign-up and login forms as soon as the page opens (on catalog sites). On by default. */
export function autofillEnabled(): boolean {
  return settingsRepo.get(AUTOFILL_KEY) !== '0'
}
export function setAutofill(on: boolean) {
  settingsRepo.set(AUTOFILL_KEY, on ? '1' : '0')
}

export const canStorePasswords = () => safeStorage.isEncryptionAvailable()

export function hostKey(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Catalog site whose host matches the page host (also subdomains such as accounts.viblo.asia). */
export function catalogSiteFor(pageUrl: string): { id: number; name: string; host: string } | null {
  const host = hostKey(pageUrl)
  if (!host) return null
  let best: { id: number; name: string; host: string } | null = null
  for (const s of siteRepo.list()) {
    for (const u of [s.url, s.submitUrl]) {
      const h = hostKey(u)
      if (!h) continue
      if (h === host || host.endsWith(`.${h}`)) {
        // The account belongs to the site's main host, so accounts.viblo.asia and viblo.asia share one.
        if (!best || h.length < best.host.length) best = { id: s.id, name: s.name, host: h }
      }
    }
  }
  return best
}

interface StoredAccount {
  siteName: string
  username: string
  email: string
  password: string // base64 of safeStorage-encrypted bytes
  createdAt: string
}

function readStored(host: string): StoredAccount | null {
  const raw = settingsRepo.get(ACCOUNT_PREFIX + host)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredAccount
  } catch {
    return null
  }
}

function decrypt(b64: string): string {
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return ''
  }
}

/** Strong password with every character class, which satisfies the usual site rules. */
export function generatePassword(length = 16): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_?']
  const all = sets.join('')
  const chars = sets.map((s) => s[randomInt(s.length)])
  while (chars.length < length) chars.push(all[randomInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** The saved account for this host, with the password decrypted (for filling). */
export function accountFor(host: string): { username: string; email: string; password: string } | null {
  const a = readStored(host)
  if (!a) return null
  const password = decrypt(a.password)
  return password ? { username: a.username, email: a.email, password } : null
}

/**
 * Password for a sign-up form on this host: the one saved earlier, or a new one that is saved now
 * (so the account can be signed in to later even if the user changes nothing).
 */
export function signupPasswordFor(host: string, siteName: string): { password: string; saved: boolean } {
  const existing = accountFor(host)
  if (existing) return { password: existing.password, saved: true }
  const password = generatePassword()
  if (!canStorePasswords()) return { password, saved: false }
  const profile = getProfile()
  const stored: StoredAccount = {
    siteName,
    username: profile.username,
    email: profile.email,
    password: safeStorage.encryptString(password).toString('base64'),
    createdAt: new Date().toISOString()
  }
  settingsRepo.set(ACCOUNT_PREFIX + host, JSON.stringify(stored))
  return { password, saved: true }
}

export function listAccounts(): SavedAccount[] {
  return settingsRepo
    .list(ACCOUNT_PREFIX)
    .map(({ key, value }) => {
      try {
        const a = JSON.parse(value) as StoredAccount
        return { host: key.slice(ACCOUNT_PREFIX.length), siteName: a.siteName, username: a.username, email: a.email, createdAt: a.createdAt }
      } catch {
        return null
      }
    })
    .filter((a): a is SavedAccount => a !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function revealPassword(host: string): string {
  const a = readStored(host)
  if (!a) throw new Error('No saved account for this site')
  const p = decrypt(a.password)
  if (!p) throw new Error('This password cannot be decrypted on this computer')
  return p
}

export function deleteAccount(host: string) {
  settingsRepo.delete(ACCOUNT_PREFIX + host)
}
