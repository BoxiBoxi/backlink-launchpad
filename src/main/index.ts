import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { initEvents } from './events'
import { loadEnv } from './config'
import { settingsRepo } from './repo'
import { startLinkScheduler } from './checker'
import { closePostingBrowser } from './browser'

// Pin the data folder (SQLite DB, Brave profile with cookies/logins, media) so it never depends on how Electron
// was launched:
//   - BB_USER_DATA=C:\some\dir    explicit override (tests)
//   - dev (pnpm dev)              <project>\data  (gitignored: contains login cookies)
//   - installed app               %APPDATA%\BacklinkBuilder
app.setName('BacklinkBuilder')
const devDataDir = join(__dirname, '..', '..', 'data') // out/main -> project root
app.setPath(
  'userData',
  process.env['BB_USER_DATA'] || (app.isPackaged ? join(app.getPath('appData'), 'BacklinkBuilder') : devDataDir)
)

// bb-file://img?p=<absolute path> serves local images (logo, screenshots) to the renderer.
protocol.registerSchemesAsPrivileged([{ scheme: 'bb-file', privileges: { secure: true, supportFetchAPI: true, stream: true } }])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#F6F8FA',
    title: 'BacklinkBuilder',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
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
  initEvents(() => mainWindow)
  registerIpc(() => mainWindow)
  startLinkScheduler(() => Number(settingsRepo.get('linkCheckIntervalHours') || 24))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await closePostingBrowser()
  if (process.platform !== 'darwin') app.quit()
})
