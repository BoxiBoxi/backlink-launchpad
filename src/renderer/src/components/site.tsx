// Visual building blocks for catalog sites: favicon, priority score, type / language / link / alive badges.
import { useState } from 'react'
import type { Alive, Lang, LinkType, Site, SiteType } from '@shared/types'

export const TYPE_OPTIONS = [
  { value: 'directory', label: 'Directory' },
  { value: 'launch', label: 'Launch platform' },
  { value: 'ugc_blog', label: 'UGC blog' },
  { value: 'community', label: 'Community' },
  { value: 'forum', label: 'Forum' },
  { value: 'qa', label: 'Q&A' }
] as const

export const typeLabel = (t: string) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Deterministic soft color for the letter fallback.
const AVATAR_TONES = ['bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700']

export function SiteIcon({ url, name, size = 'md' }: { url: string; name: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false)
  const domain = domainOf(url)
  const box = size === 'sm' ? 'size-6 rounded-md' : 'size-8 rounded-lg'
  const img = size === 'sm' ? 'size-4' : 'size-5'
  if (!domain || failed) {
    const tone = AVATAR_TONES[[...(domain || name)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]
    return <span className={`flex shrink-0 items-center justify-center text-xs font-semibold uppercase ${box} ${tone}`}>{name.trim().charAt(0) || '?'}</span>
  }
  return (
    <span className={`flex shrink-0 items-center justify-center border border-gray-200 bg-white ${box}`}>
      <img src={`bb-favicon://icon?d=${encodeURIComponent(domain)}`} alt="" className={img} loading="lazy" onError={() => setFailed(true)} />
    </span>
  )
}

export const priorityTone = (v: number) =>
  v >= 70
    ? { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', bar: 'bg-emerald-500' }
    : v >= 40
      ? { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', bar: 'bg-amber-400' }
      : { text: 'text-gray-500', bg: 'bg-gray-50', ring: 'ring-gray-200', bar: 'bg-gray-300' }

/** Priority score 0-100 (our own score, not DA/DR). */
export function PriorityScore({ value }: { value: number }) {
  const t = priorityTone(value)
  return (
    <div className="flex items-center gap-2" title={`Priority ${value}/100: relevance + authority + cost/effort + link value (not DA/DR)`}>
      <span className={`inline-flex h-7 w-9 items-center justify-center rounded-lg text-xs font-bold tabular-nums ring-1 ${t.bg} ${t.text} ${t.ring}`}>{value}</span>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-gray-100">
        <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${value}%` }} />
      </span>
    </div>
  )
}

const TYPE_TONE: Record<SiteType, string> = {
  directory: 'bg-sky-50 text-sky-700 ring-sky-200',
  launch: 'bg-violet-50 text-violet-700 ring-violet-200',
  ugc_blog: 'bg-teal-50 text-teal-700 ring-teal-200',
  community: 'bg-orange-50 text-orange-700 ring-orange-200',
  forum: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  qa: 'bg-pink-50 text-pink-700 ring-pink-200'
}

export function TypeBadge({ type }: { type: SiteType }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${TYPE_TONE[type] ?? 'bg-gray-50 text-gray-600 ring-gray-200'}`}>{typeLabel(type)}</span>
}

export function LangBadge({ lang }: { lang: Lang }) {
  const tone = lang === 'vi' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-blue-50 text-blue-700 ring-blue-200'
  return <span className={`inline-flex w-8 justify-center rounded-md py-0.5 text-[11px] font-semibold ring-1 ${tone}`}>{lang.toUpperCase()}</span>
}

export function LinkTypeBadge({ type }: { type: LinkType | string | null }) {
  if (!type) return <span className="text-xs text-gray-400">-</span>
  const tone =
    type === 'dofollow'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : type === 'unknown'
        ? 'bg-white text-gray-400 ring-gray-200'
        : type === 'ugc'
          ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : 'bg-amber-50 text-amber-700 ring-amber-200'
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${tone}`}>{type}</span>
}

export function AliveBadge({ alive, httpStatus, title }: { alive: Alive; httpStatus: number | null; title?: string }) {
  const dot = alive === 'up' ? 'bg-emerald-500' : alive === 'down' ? 'bg-red-500' : 'bg-gray-300'
  const text = alive === 'up' ? 'text-emerald-700' : alive === 'down' ? 'text-red-600' : 'text-gray-400'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text}`} title={title}>
      <span className={`size-2 rounded-full ${dot}`} />
      {alive === 'unknown' ? 'not checked' : alive}
      {httpStatus ? <span className="text-gray-400">{httpStatus}</span> : null}
    </span>
  )
}

/** Favicon + name + optional subtitle, used in tables. */
export function SiteCell({ site, sub, children }: { site: Pick<Site, 'url' | 'name'>; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <SiteIcon url={site.url} name={site.name} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-gray-900">{site.name}</span>
          {children}
        </div>
        {sub && <div className="truncate text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  )
}
