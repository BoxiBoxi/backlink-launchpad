// Auto-update from GitHub Releases (electron-updater; feed configured by "publish" in electron-builder.yml).
// Windows/Linux: download in the background, then the user clicks "Restart to update".
// macOS: installing updates requires a signed + notarized app, so there we only announce the new version and
// open the release page.
import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { emit } from './events'

const RELEASES_URL = 'https://github.com/BoxiBoxi/backlink-launchpad/releases/latest'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const canInstall = process.platform !== 'darwin'

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion() }

function set(next: Partial<UpdateStatus>) {
  status = { ...status, ...next, current: app.getVersion() }
  emit({ type: 'update', status })
}

export function updateStatus(): UpdateStatus {
  return status
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status // dev build: no update feed
  if (status.state === 'downloading' || status.state === 'ready') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return status
}

export function installUpdate() {
  if (status.state === 'ready') {
    // isSilent=false shows the installer progress; isForceRunAfter=true restarts the app afterwards.
    autoUpdater.quitAndInstall(false, true)
  } else if (status.state === 'available') {
    void shell.openExternal(RELEASES_URL)
  }
}

export function initUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = canInstall
  autoUpdater.autoInstallOnAppQuit = canInstall
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => set({ state: 'checking', message: undefined }))
  autoUpdater.on('update-not-available', () => set({ state: 'none', version: undefined, percent: undefined }))
  autoUpdater.on('update-available', (info) => set({ state: canInstall ? 'downloading' : 'available', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => {
    // Keep a finished download usable even if a later background check fails (e.g. offline).
    if (status.state !== 'ready') set({ state: 'error', message: err?.message ?? String(err) })
  })

  setTimeout(() => void checkForUpdates(), 10_000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}
