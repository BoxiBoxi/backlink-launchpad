// System tray: closing the window hides the app to the tray (Windows/Linux notification area, macOS menu bar),
// so the link monitor keeps running. "Quit" in the tray menu really exits.
import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { settingsRepo } from './repo'

let tray: Tray | null = null

/** The icon ships as an extra resource in the installed app (see electron-builder.yml), and in build/ during dev. */
function trayIcon(): Electron.NativeImage {
  const file = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png')
  const img = nativeImage.createFromPath(file)
  if (img.isEmpty()) return img
  const size = process.platform === 'darwin' ? 18 : 32
  return img.resize({ width: size, height: size, quality: 'best' })
}

/** Default on; the user can turn it off in Settings. */
export function closeToTrayEnabled(): boolean {
  return settingsRepo.get('closeToTray') !== '0'
}

export function showWindow(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function createTray(opts: { getWindow: () => BrowserWindow | null; onCheckUpdates: () => void }) {
  if (tray) return tray
  tray = new Tray(trayIcon())
  tray.setToolTip('Backlink Launchpad')
  const open = () => showWindow(opts.getWindow())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Backlink Launchpad', click: open },
      { label: 'Check for updates', click: opts.onCheckUpdates },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  // Windows/Linux: a left click opens the window (macOS shows the menu instead).
  if (process.platform !== 'darwin') tray.on('click', open)
  return tray
}

/** Tell the user once that the app is still running in the tray after they closed the window. */
export function notifyHiddenOnce() {
  if (!tray || settingsRepo.get('trayHintShown') === '1') return
  settingsRepo.set('trayHintShown', '1')
  if (process.platform === 'win32') {
    tray.displayBalloon({
      iconType: 'info',
      title: 'Backlink Launchpad is still running',
      content: 'It keeps checking your links in the background. Right-click the tray icon and choose Quit to exit.'
    })
  }
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
