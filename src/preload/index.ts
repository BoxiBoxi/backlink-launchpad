import { contextBridge, ipcRenderer } from 'electron'
import type { Api, AppEvent, Channel } from '@shared/types'

async function invoke<C extends Channel>(channel: C, ...args: Api[C][0]): Promise<Api[C][1]> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as { ok: boolean; data?: Api[C][1]; error?: string }
  if (!res.ok) throw new Error(res.error || 'Unknown error')
  return res.data as Api[C][1]
}

function onEvent(cb: (event: AppEvent) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, event: AppEvent) => cb(event)
  ipcRenderer.on('bb:event', handler)
  return () => ipcRenderer.off('bb:event', handler)
}

contextBridge.exposeInMainWorld('api', { invoke, onEvent })
