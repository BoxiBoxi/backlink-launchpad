import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { initEvents } from './events'
import { loadEnv } from './config'
import { settingsRepo } from './repo'
import { startLinkScheduler } from './checker'
import { closePostingBrowser, isPostingBrowserRunning } from './browser'
import { closeToTrayEnabled, createTray, notifyHiddenOnce, showWindow } from './tray'
import { checkForUpdates, initUpdater } from './updater'
import { handleFavicon } from './favicon'
import { startBridge, stopBridge } from './bridge'

// Pin the data folder (SQLite DB, browser profiles with cookies/logins, media) so it never depends on how Electron
// was launched:
//   - BB_USER_DATA=C:\some\dir    explicit override (tests)
//   - dev (pnpm dev)              <project>\data  (gitignored: contains login cookies)
//   - installed app               %APPDATA%\BacklinkBuilder
app.setName('Backlink Launchpad')
const devDataDir = join(__dirname, '..', '..', 'data') // out/main -> project root
app.setPath(
  'userData',
  process.env['BB_USER_DATA'] || (app.isPackaged ? join(app.getPath('appData'), 'BacklinkBuilder') : devDataDir)
)

// bb-file://img?p=<absolute path> serves local images (logo, screenshots) to the renderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'bb-file', privileges: { secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'bb-favicon', privileges: { secure: true, supportFetchAPI: true } }
])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

let mainWindow: BrowserWindow | null = null
/** Set once a real quit starts (tray Quit, OS shutdown, installing an update), so closing the window is not turned into hiding. */
let quitting = false

// One running copy only: launching the app again (shortcut, taskbar) brings back the existing window, e.g. from the tray.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    console.log('[app] launched again: showing the existing window')
    if (mainWindow) showWindow(mainWindow)
    else if (app.isReady()) createWindow()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#F6F8FA',
    title: 'Backlink Launchpad',
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Closing the window hides it to the tray (unless turned off in Settings); Quit in the tray menu exits.
  mainWindow.on('close', (e) => {
    if (quitting || !closeToTrayEnabled()) return
    e.preventDefault()
    mainWindow?.hide()
    notifyHiddenOnce()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  // Links clicked inside the app (e.g. in a content preview) open in the default browser, never in the app window.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file:')) return
    e.preventDefault()
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (!gotLock) return
  const envFiles = loadEnv()
  console.log('[env] loaded', envFiles.length ? envFiles : 'no .env file')
  const userData = app.getPath('userData')
  initDb(userData)
  console.log('[db] ready in', userData)
  protocol.handle('bb-file', (req) => {
    const p = new URL(req.url).searchParams.get('p') || ''
    if (!IMAGE_EXT.has(extname(p).toLowerCase())) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(p).toString())
  })
  protocol.handle('bb-favicon', handleFavicon)
  initEvents(() => mainWindow)
  registerIpc(() => mainWindow)
  void startBridge()
  startLinkScheduler(() => Number(settingsRepo.get('linkCheckIntervalHours') || 24))
  createWindow()
  createTray({
    getWindow: () => mainWindow,
    onCheckUpdates: () => {
      showWindow(mainWindow)
      void checkForUpdates()
    }
  })
  initUpdater()
  app.on('activate', () => {
    if (mainWindow) showWindow(mainWindow)
    else createWindow()
  })
})

// Reached only when close-to-tray is off (otherwise the window is hidden, not closed).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Close the automated browser / login window before exiting, so the profile is left unlocked and cookies are saved.
let browserClosed = false
app.on('before-quit', (e) => {
  quitting = true
  stopBridge()
  if (browserClosed || !isPostingBrowserRunning()) return
  e.preventDefault()
  void closePostingBrowser().finally(() => {
    browserClosed = true
    app.quit()
  })
})
