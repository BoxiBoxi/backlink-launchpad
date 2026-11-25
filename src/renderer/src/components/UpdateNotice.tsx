import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'
import { invoke } from '../lib'

/** Live update status from the main process (initial value + push events). */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    invoke('update:status').then(setStatus).catch(() => undefined)
    return window.api.onEvent((e) => {
      if (e.type === 'update') setStatus(e.status)
    })
  }, [])
  return status
}

/** Sidebar card shown while a new version downloads or is ready to install. */
export default function UpdateNotice() {
  const s = useUpdateStatus()
  if (!s || !['downloading', 'ready', 'available'].includes(s.state)) return null
  return (
    <div className="mx-3 mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
      {s.state === 'downloading' && (
        <>
          <div className="font-medium">Downloading version {s.version}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${s.percent ?? 0}%` }} />
          </div>
        </>
      )}
      {s.state === 'ready' && (
        <>
          <div className="font-medium">Version {s.version} is ready</div>
          <div className="mt-0.5 text-emerald-800/80">It also installs automatically the next time you quit.</div>
          <button
            onClick={() => void invoke('update:install')}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
          >
            <RefreshCw className="size-3.5" />
            Restart to update
          </button>
        </>
      )}
      {s.state === 'available' && (
        <>
          <div className="font-medium">Version {s.version} is available</div>
          <button
            onClick={() => void invoke('update:install')}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
          >
            <Download className="size-3.5" />
            Download
          </button>
        </>
      )}
    </div>
  )
}
