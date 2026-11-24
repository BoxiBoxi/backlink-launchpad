import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Api, Channel } from '@shared/types'

export function invoke<C extends Channel>(channel: C, ...args: Api[C][0]): Promise<Api[C][1]> {
  return window.api.invoke(channel, ...args)
}

/** Load data from a channel; reload() re-runs it. */
export function useQuery<C extends Channel>(channel: C, ...args: Api[C][0]) {
  const [data, setData] = useState<Api[C][1] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(args)
  const argsRef = useRef(args)
  argsRef.current = args
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await invoke(channel, ...argsRef.current))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [channel, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload()
  }, [reload])
  return { data, error, loading, reload, setData }
}

// ---------- toasts ----------
export interface ToastAction {
  label: string
  onClick: () => void
}
interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
  action?: ToastAction
}
const ToastCtx = createContext<(kind: Toast['kind'], text: string, action?: ToastAction) => void>(() => undefined)
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: Toast['kind'], text: string, action?: ToastAction) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, text, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 15000 : kind === 'error' ? 9000 : 5000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex w-96 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : t.kind === 'ok'
                  ? 'border-gray-200 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-800'
            }`}
          >
            {t.text}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick()
                  setToasts((all) => all.filter((x) => x.id !== t.id))
                }}
                className="ml-3 rounded-md border border-white/30 px-2 py-0.5 text-xs font-semibold hover:bg-white/10"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/** Wrap an async action: shows errors as toasts and tracks busy state. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(label)
      try {
        const r = await fn()
        if (okText) toast('ok', typeof okText === 'function' ? okText(r) : okText)
        return r
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e))
        return undefined
      } finally {
        setBusy(null)
      }
    },
    [toast]
  )
  return { busy, run }
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/** URL for a local image file (served by the main process). */
export const localImage = (path: string) => `bb-file://img?p=${encodeURIComponent(path)}`

/** Ask pages to reload their data (fired after background changes such as an auto-detected post). */
export const REFRESH_EVENT = 'bb:refresh'
export const requestRefresh = () => window.dispatchEvent(new Event(REFRESH_EVENT))
export function useRefresh(fn: () => void) {
  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, fn)
    return () => window.removeEventListener(REFRESH_EVENT, fn)
  }, [fn])
}

/**
 * Render long lists in chunks: the first `step` items now, more as the sentinel scrolls into view.
 * Keeps page switches instant with hundreds of rows. Pass the filters as resetKey to start again from the top.
 */
export function useIncremental<T>(items: T[], resetKey = '', step = 60) {
  const [limit, setLimit] = useState(step)
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  useEffect(() => setLimit(step), [resetKey, step])
  const more = Math.max(0, items.length - limit)
  useEffect(() => {
    if (!node || more <= 0) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((l) => l + step), { rootMargin: '600px' })
    io.observe(node)
    return () => io.disconnect()
  }, [node, more, step])
  const visible = more > 0 ? items.slice(0, limit) : items
  const sentinel = more > 0 ? <div ref={setNode} className="py-4 text-center text-xs text-gray-400">Loading {more} more…</div> : null
  return { visible, sentinel }
}
