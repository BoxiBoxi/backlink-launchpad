import { useMemo, useState } from 'react'
import { CheckCircle2, Globe, ListChecks, LogIn, Pencil, Plus, ScanLine, SkipForward, Sparkles, Trash2, X } from 'lucide-react'
import type { Content, Task } from '@shared/types'
import type { PageProps } from '../App'
import { invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Dropdown, Empty, Field, Input, Modal, PageHeader, Toggle } from '../components/ui'
import { LinkTypeBadge, typeLabel } from './Catalog'
import { ContentEditor } from './Content'

const statusTone = { queued: 'gray', opened: 'blue', posted: 'green', skipped: 'amber' } as const

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

  const siteMap = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s])), [sites.data])
  const contentMap = useMemo(() => new Map((contents.data ?? []).map((c) => [c.id, c])), [contents.data])
  const latestContent = (t: Task) =>
    (t.contentId ? contentMap.get(t.contentId) : undefined) ?? (contents.data ?? []).find((c) => c.siteId === t.siteId)

  if (!projectId || !project) {
    return (
      <>
        <PageHeader title="Posting queue" />
        <Card><Empty icon={<ListChecks className="size-6" />} title="Select or create a project first" action={<Button variant="primary" onClick={() => go('projects')}>Projects</Button>} /></Card>
      </>
    )
  }

  const reloadAll = () => {
    tasks.reload()
    contents.reload()
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
    const c = await run(`gen-${t.id}`, () => invoke('content:generate', { projectId, siteId: t.siteId }), (r) => `Generated with ${r.model}`)
    if (c) {
      await invoke('tasks:update', { id: t.id, contentId: c.id })
      reloadAll()
      setEditing(c)
    }
  }

  return (
    <>
      <PageHeader
        title="Posting queue"
        subtitle="Open a task: Brave goes to the submit page and pre-fills what it can. You review, sign in, solve CAPTCHAs and submit yourself."
        actions={
          <>
            <Button icon={<LogIn className="size-4" />} onClick={() => run('login', () => invoke('browser:openProfile', null), 'Brave opened on the BacklinkBuilder profile. Sign in to sites, then close that window before opening tasks.')}>
              Brave login window
            </Button>
            <Button icon={<X className="size-4" />} onClick={() => run('close', () => invoke('browser:close'), 'Automated Brave closed')}>Close Brave</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setPicked([]); setAdding(true) }}>Add sites</Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        {tasks.data?.length === 0 ? (
          <Empty icon={<ListChecks className="size-6" />} title="Queue is empty" text="Add target sites, generate content for each, then open them one by one in Brave." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-3 py-3 font-medium">Content</th>
                <th className="px-3 py-3 font-medium">Link</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {(tasks.data ?? []).map((t) => {
                const site = siteMap.get(t.siteId)
                const c = latestContent(t)
                return (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{site?.name ?? 'Deleted site'}</div>
                      <div className="text-xs text-gray-400">{site ? `${site.language.toUpperCase()} · ${typeLabel(site.type)}` : ''}</div>
                    </td>
                    <td className="max-w-xs px-3 py-3">
                      {c ? (
                        <button className="flex max-w-full items-center gap-1.5 text-left text-gray-700 hover:text-gray-900" onClick={() => setEditing(c)}>
                          <Pencil className="size-3.5 shrink-0 text-gray-400" />
                          <span className="truncate">{c.title || '(untitled)'}</span>
                        </button>
                      ) : (
                        <Button size="sm" icon={<Sparkles className="size-3.5" />} loading={busy === `gen-${t.id}`} onClick={() => generate(t)}>Generate</Button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {t.postUrl ? (
                        <button className="max-w-56 truncate text-left text-xs text-gray-600 underline" onClick={() => invoke('shell:openExternal', t.postUrl)}>{t.postUrl}</button>
                      ) : (
                        <LinkTypeBadge type={site?.linkType ?? null} />
                      )}
                    </td>
                    <td className="px-3 py-3"><Badge tone={statusTone[t.status]}>{t.status}</Badge></td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {t.status !== 'posted' && (
                          <>
                            <Button size="sm" variant="primary" icon={<Globe className="size-3.5" />} loading={busy === `open-${t.id}`} onClick={() => open(t)}>Open</Button>
                            <Button size="sm" icon={<CheckCircle2 className="size-3.5" />} onClick={() => { setPosting(t); setPostUrl('') }}>Posted</Button>
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
          {addable.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <Toggle checked={picked.includes(s.id)} onChange={(v) => setPicked(v ? [...picked, s.id] : picked.filter((x) => x !== s.id))} label={s.name} />
              <span className="text-xs text-gray-400">{s.language.toUpperCase()} · {typeLabel(s.type)}</span>
            </div>
          ))}
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

      <ContentEditor content={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); contents.reload() }} />
    </>
  )
}
