// Push events from the main process to the renderer window.
import type { BrowserWindow } from 'electron'
import type { AppEvent } from '@shared/types'

let getWindow: () => BrowserWindow | null = () => null

export function initEvents(fn: () => BrowserWindow | null) {
  getWindow = fn
}

export function emit(event: AppEvent) {
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('bb:event', event)
}
