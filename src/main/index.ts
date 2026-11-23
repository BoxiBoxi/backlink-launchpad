import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { loadEnv } from './config'
import { settingsRepo } from './repo'
import { startLinkScheduler } from './checker'
import { closePostingBrowser } from './browser'

// Optional isolated data dir (used by tests): BB_USER_DATA=C:\some\dir
if (process.env['BB_USER_DATA']) app.setPath('userData', process.env['BB_USER_DATA'])

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
