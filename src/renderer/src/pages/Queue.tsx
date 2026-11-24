import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Eraser, Globe, ListChecks, Loader2, LogIn, Pencil, Play, Plus, Radar, ScanLine, SkipForward, Sparkles, Square, Trash2, X } from 'lucide-react'
import type { Content, SessionStatus, Task, TaskStatus } from '@shared/types'
import type { PageProps } from '../App'
import { invoke, useAction, useIncremental, useQuery, useRefresh, useToast } from '../lib'
import { Badge, Button, Card, Dropdown, Empty, Field, Input, Menu, Modal, PageHeader, Tabs, Toggle } from '../components/ui'
import { LinkTypeBadge, priorityTone, SiteCell, SiteIcon, typeLabel } from '../components/site'
import { ContentEditor } from '../components/ContentEditor'

const statusTone = { queued: 'gray', opened: 'blue', posted: 'green', skipped: 'amber' } as const
const STATUS_ORDER: Record<TaskStatus, number> = { opened: 0, queued: 1, posted: 2, skipped: 3 }
type View = 'all' | 'todo' | 'posted' | 'skipped'

export default function Queue({ projectId, go }: PageProps) {
  const projects = useQuery('projects:list')
  const sites = useQuery('sites:list')
  const tasks = useQuery('tasks:list', projectId)
  const contents = useQuery('content:list', projectId)
  const project = projects.data?.find((p) => p.id === projectId)
  const { busy, run } = useAction()
  const toast = useToast()

  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [langFilter, setLangFilter] = useState<string>('project')
  const [posting, setPosting] = useState<Task | null>(null)
  const [postUrl, setPostUrl] = useState('')
  const [editing, setEditing] = useState<Content | null>(null)
  const [session, setSession] = useState<SessionStatus | null>(null)
  const [view, setView] = useState<View>('all')

  useEffect(() => {
    invoke('session:status').then(setSession).catch(() => undefined)
    return window.api.onEvent((e) => {
      if (e.type === 'session') setSession(e.status)
    })
  }, [])
  const reloadTasks = tasks.reload
  const reloadContents = contents.reload
  useRefresh(
    useCallback(() => {
      reloadTasks()
      reloadContents()
    }, [reloadTasks, reloadContents])
  )

  const siteMap = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s])), [sites.data])
  const contentMap = useMemo(() => new Map((contents.data ?? []).map((c) => [c.id, c])), [contents.data])
  const latestContent = (t: Task) =>
    (t.contentId ? contentMap.get(t.contentId) : undefined) ?? (contents.data ?? []).find((c) => c.siteId === t.siteId)

  const all = tasks.data ?? []
  const count = (pred: (t: Task) => boolean) => all.filter(pred).length
  const isTodo = (t: Task) => t.status === 'queued' || t.status === 'opened'
  const shownTasks = all
    .filter((t) => view === 'all' || (view === 'todo' ? isTodo(t) : t.status === view))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (siteMap.get(b.siteId)?.priority ?? 0) - (siteMap.get(a.siteId)?.priority ?? 0)
    )
  const { visible: taskRows, sentinel } = useIncremental(shownTasks, `${view}|${projectId}`)

  if (!projectId || !project) {
    return (
      <>
        <PageHeader title="Publish" />
        <Card><Empty icon={<ListChecks className="size-6" />} title="Select or create a project first" action={<Button variant="primary" onClick={() => go('projects')}>Projects</Button>} /></Card>
      </>
    )
  }

  const reloadAll = () => {
    tasks.reload()
    contents.reload()
  }


  const clear = async (statuses: TaskStatus[], what: string) => {
    const n = count((t) => statuses.includes(t.status))
    if (!n) return
    if (!confirm(`${what}: remove ${n} task(s) from the queue? Links already saved stay in the Link monitor.`)) return
    const removed = await run('clear', () => invoke('tasks:clear', { projectId, statuses }), (r) => `Removed ${r} task(s)`)
    if (removed !== undefined) reloadAll()
  }

  const queuedSiteIds = new Set((tasks.data ?? []).filter((t) => t.status !== 'skipped').map((t) => t.siteId))
  const addable = (sites.data ?? []).filter(
    (s) => s.status === 'active' && !queuedSiteIds.has(s.id) && (langFilter === 'all' || s.language === (langFilter === 'project' ? project.language : langFilter))
  )

  const open = async (t: Task) => {
    const r = await run(`open-${t.id}`, () => invoke('tasks:open', t.id))
    if (r) {
      toast('info', r.message)
      reloadAll()
    }
  }

  const generate = async (t: Task) => {
    const c = await run(`gen-${t.id}`, () => invoke('content:generate', { projectId, siteId: t.siteId }), (r) => `Generated with ${r.model}${typeof r.creditsRemaining === 'number' ? ` · ${r.creditsRemaining.toLocaleString()} Wriai credits left` : ''}`)
    if (c) {
      await invoke('tasks:update', { id: t.id, contentId: c.id })
      reloadAll()
      setEditing(c)
    }
  }

  return (
    <>
      <PageHeader
        title="Publish"
        subtitle="Open a task: Brave goes to the submit page and pre-fills what it can. You review, sign in, solve CAPTCHAs and submit yourself."
        actions={
          <>
            <Button icon={<LogIn className="size-4" />} onClick={() => run('login', () => invoke('browser:openProfile', null), 'Brave opened on the BacklinkBuilder profile. Sign in to sites, then close that window before opening tasks.')}>
              Login window
            </Button>
            <Button icon={<X className="size-4" />} onClick={() => run('close', () => invoke('browser:close'), 'Automated Brave closed')}>Close Brave</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => { setPicked([]); setAdding(true) }}>Add sites</Button>
            <Menu
              label="Clear"
              icon={<Eraser className="size-4" />}
              items={[
                { label: 'Remove skipped', hint: String(count((t) => t.status === 'skipped')), disabled: !count((t) => t.status === 'skipped'), onClick: () => clear(['skipped'], 'Skipped') },
                { label: 'Remove not started', hint: String(count((t) => t.status === 'queued')), disabled: !count((t) => t.status === 'queued'), onClick: () => clear(['queued'], 'Not started') },
                { label: 'Remove posted (keep links)', hint: String(count((t) => t.status === 'posted')), disabled: !count((t) => t.status === 'posted'), onClick: () => clear(['posted'], 'Posted') },
                { label: 'Remove everything', hint: String(all.length), danger: true, disabled: !all.length, onClick: () => clear(['queued', 'opened', 'posted', 'skipped'], 'Everything') }
              ]}
            />
            <Button
              variant="primary"
              icon={<Play className="size-4" />}
              loading={busy === 'session'}
              disabled={!!session?.active}
              onClick={() => run('session', () => invoke('session:start', projectId))}
            >
              Start session
            </Button>
          </>
        }
      />

      {session && session.projectId === projectId && (session.active || session.message) && (
        <Card className={`mb-4 p-4 ${session.active ? 'border-gray-900' : ''}`}>
          <div className="flex items-center gap-4">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${session.active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {session.active ? <Radar className="size-5" /> : <CheckCircle2 className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {session.active ? (
                  <>
                    Session: {session.currentSiteName || '...'}
                    <span className="font-normal text-gray-500">site {session.position} of {session.total} · {session.posted} posted</span>
                    <Loader2 className="size-3.5 animate-spin text-gray-400" />
                  </>
                ) : (
                  'Session ended'
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{session.message}</p>
            </div>
            {session.active && (
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  icon={<CheckCircle2 className="size-3.5" />}
                  onClick={() => {
                    const t = (tasks.data ?? []).find((x) => x.id === session.currentTaskId)
                    if (t) {
                      setPosting(t)
                      setPostUrl('')
                    }
                  }}
                >
                  Posted
                </Button>
                <Button size="sm" icon={<SkipForward className="size-3.5" />} loading={busy === 'next'} onClick={() => run('next', () => invoke('session:next'))}>
                  Next site
                </Button>
                <Button size="sm" variant="danger" icon={<Square className="size-3.5" />} onClick={() => run('stop', () => invoke('session:stop'))}>
                  Stop
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {all.length > 0 && (
        <div className="mb-3">
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: 'all', label: 'All', count: all.length },
              { value: 'todo', label: 'To do', count: count(isTodo) },
              { value: 'posted', label: 'Posted', count: count((t) => t.status === 'posted') },
              { value: 'skipped', label: 'Skipped', count: count((t) => t.status === 'skipped') }
            ]}
          />
        </div>
      )}

      <Card className="overflow-x-auto">
        {tasks.data?.length === 0 ? (
          <Empty icon={<ListChecks className="size-6" />} title="Queue is empty" text="Add target sites, generate content for each, then open them one by one in Brave." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-3 py-3 font-medium">Link</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {taskRows.map((t) => {
                const site = siteMap.get(t.siteId)
                const c = latestContent(t)
                return (
                  <tr key={t.id} className={`border-b border-gray-50 last:border-0 ${session?.active && session.currentTaskId === t.id ? 'bg-gray-50' : ''}`}>
                    <td className="max-w-[16rem] px-4 py-3">
                      {site ? (
                        <SiteCell site={site} sub={`P${site.priority} · ${site.language.toUpperCase()} · ${typeLabel(site.type)}`} />
                      ) : (
                        <span className="text-gray-400">Deleted site</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {t.postUrl ? (
                        <button className="block max-w-44 truncate text-left text-xs text-gray-600 underline" title={t.postUrl} onClick={() => invoke('shell:openExternal', t.postUrl)}>{t.postUrl}</button>
                      ) : (
                        <LinkTypeBadge type={site?.linkType ?? null} />
                      )}
                    </td>
                    <td className="px-3 py-3"><Badge tone={statusTone[t.status]}>{t.status}</Badge></td>
                    <td className="w-px whitespace-nowrap px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {c ? (
                          <Button size="sm" variant="soft" className="w-28" icon={<Pencil className="size-3.5" />} title={c.title || '(untitled)'} onClick={() => setEditing(c)}>Edit post</Button>
                        ) : (
                          <Button size="sm" className="w-28" icon={<Sparkles className="size-3.5" />} loading={busy === `gen-${t.id}`} onClick={() => generate(t)}>Generate</Button>
                        )}
                        {t.status !== 'posted' && (
                          <>
                            <Button size="sm" variant="primary" icon={<Globe className="size-3.5" />} loading={busy === `open-${t.id}`} onClick={() => open(t)}>Open</Button>
                            <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-3.5" />} title="Mark as posted" onClick={() => { setPosting(t); setPostUrl('') }} />
                            <Button size="sm" variant="ghost" icon={<SkipForward className="size-3.5" />} title="Skip" onClick={async () => { await run('skip', () => invoke('tasks:update', { id: t.id, status: 'skipped' })); tasks.reload() }} />
                          </>
                        )}
                        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} title="Delete" onClick={async () => { await run('del', () => invoke('tasks:delete', t.id)); tasks.reload() }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {sentinel}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add sites to the queue"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!picked.length}
              onClick={async () => {
                const r = await run('add', () => invoke('tasks:create', { projectId, siteIds: picked }), (r) => `${r.length} tasks added`)
                if (r) {
                  setAdding(false)
                  tasks.reload()
                }
              }}
            >
              Add {picked.length || ''}
            </Button>
          </>
        }
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <Dropdown
            className="w-56"
            value={langFilter}
            onChange={setLangFilter}
            options={[{ value: 'project', label: `Project language (${project.language.toUpperCase()})` }, { value: 'all', label: 'All languages' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Vietnamese' }]}
          />
          <Toggle checked={addable.length > 0 && addable.every((s) => picked.includes(s.id))} onChange={(v) => setPicked(v ? addable.map((s) => s.id) : [])} label="Select all" />
        </div>
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {addable.map((s) => {
            const on = picked.includes(s.id)
            return (
              <div
                key={s.id}
                onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 ${on ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-2">
                  <Toggle checked={on} onChange={() => undefined} label="" />
                  <SiteIcon url={s.url} name={s.name} size="sm" />
                  <span className="text-sm text-gray-800">{s.name}</span>
                </div>
                <span className="text-xs text-gray-400">
                  <span className={`font-semibold ${priorityTone(s.priority).text}`}>P{s.priority}</span> · {s.language.toUpperCase()} · {typeLabel(s.type)}
                </span>
              </div>
            )
          })}
          {!addable.length && <p className="py-6 text-center text-sm text-gray-400">Every matching site is already queued.</p>}
        </div>
      </Modal>

      <Modal
        open={!!posting}
        onClose={() => setPosting(null)}
        title={`Mark as posted: ${posting ? siteMap.get(posting.siteId)?.name ?? '' : ''}`}
        footer={
          <>
            <Button onClick={() => setPosting(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'posted'}
              onClick={async () => {
                if (!posting) return
                const r = await run('posted', () => invoke('tasks:markPosted', { taskId: posting.id, postUrl: postUrl.trim() }), 'Saved. The link is now tracked in Link monitor.')
                if (r) {
                  setPosting(null)
                  reloadAll()
                }
              }}
            >
              Save and track link
            </Button>
          </>
        }
      >
        <Field label="Live post URL" hint="Paste the URL of the published post or listing, or read it from the active Brave tab.">
          <div className="flex gap-2">
            <Input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://" />
            <Button
              icon={<ScanLine className="size-4" />}
              onClick={async () => {
                const url = await run('read', () => invoke('tasks:readCurrentUrl'))
                if (url) setPostUrl(url)
                else if (url === null) toast('error', 'No automated Brave tab is open')
              }}
            >
              Read from Brave
            </Button>
          </div>
        </Field>
      </Modal>

      <ContentEditor content={editing} format={(editing && siteMap.get(editing.siteId)?.format) || 'plain'} siteName={editing ? siteMap.get(editing.siteId)?.name : undefined} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); contents.reload() }} />
    </>
  )
}
