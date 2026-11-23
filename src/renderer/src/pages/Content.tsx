import { useEffect, useMemo, useState } from 'react'
import { Copy, FileDown, ListPlus, PenLine, Sparkles, Trash2 } from 'lucide-react'
import type { Content, ContentFormat } from '@shared/types'
import type { PageProps } from '../App'
import { fmtDate, invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Dropdown, Empty, Field, Input, ListInput, Modal, PageHeader, Toggle } from '../components/ui'
import BodyEditor, { bodyToHtml } from '../components/BodyEditor'
import { SiteIcon, typeLabel } from '../components/site'

export function ContentEditor({ content, format, siteName, onClose, onSaved }: { content: Content | null; format: ContentFormat; siteName?: string; onClose: () => void; onSaved: (c: Content) => void }) {
  const [draft, setDraft] = useState<Content | null>(content)
  const { busy, run } = useAction()
  const toast = useToast()
  const [withImages, setWithImages] = useState(true)
  useEffect(() => setDraft(content), [content])
  if (!draft) return null
  const copy = async (text: string, what: string) => {
    await invoke('clipboard:write', text)
    toast('info', `${what} copied`)
  }
  return (
    <Modal
      open={!!content}
      onClose={onClose}
      title={siteName ? `Edit content for ${siteName}` : 'Edit content'}
      wide
      footer={
        <>
          <div className="mr-auto flex items-center gap-3">
            <Button
              icon={<FileDown className="size-4" />}
              loading={busy === 'pdf'}
              onClick={() =>
                run(
                  'pdf',
                  async () => {
                    await invoke('content:save', draft) // export what is on screen
                    return invoke('content:exportPdf', { contentId: draft.id, bodyHtml: bodyToHtml(draft.body, format), includeImages: withImages })
                  },
                  (path) => (path ? `PDF saved: ${path}` : 'Export cancelled')
                )
              }
            >
              Export PDF
            </Button>
            <Toggle checked={withImages} onChange={setWithImages} label="Include screenshots" />
          </div>
          <Button icon={<Copy className="size-4" />} onClick={() => copy(draft.title, 'Title')}>Copy title</Button>
          <Button icon={<Copy className="size-4" />} onClick={() => copy(draft.body, 'Body')}>Copy body</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={async () => {
              const saved = await run('save', () => invoke('content:save', draft), 'Content saved')
              if (saved) onSaved(saved)
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" className="col-span-2"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
        <Field label="Body" className="col-span-2" asDiv>
          <BodyEditor key={draft.id} format={format} value={draft.body} onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))} />
        </Field>
        <Field label="Link URL"><Input value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} /></Field>
        <Field label="Anchor"><Input value={draft.anchor} onChange={(e) => setDraft({ ...draft, anchor: e.target.value })} /></Field>
        <Field label="Tags"><ListInput value={draft.tags} onChange={(v) => setDraft({ ...draft, tags: v })} /></Field>
        <Field label="Status">
          <Dropdown value={draft.status} options={[{ value: 'draft', label: 'Draft' }, { value: 'ready', label: 'Ready' }, { value: 'used', label: 'Used' }]} onChange={(v) => setDraft({ ...draft, status: v })} />
        </Field>
      </div>
    </Modal>
  )
}

export default function ContentPage({ projectId, go }: PageProps) {
  const projects = useQuery('projects:list')
  const sites = useQuery('sites:list')
  const contents = useQuery('content:list', projectId)
  const project = projects.data?.find((p) => p.id === projectId)
  const [siteId, setSiteId] = useState<number | null>(null)
  const [linkUrl, setLinkUrl] = useState<string>('')
  const [anchor, setAnchor] = useState('')
  const [extra, setExtra] = useState('')
  const [editing, setEditing] = useState<Content | null>(null)
  const { busy, run } = useAction()

  useEffect(() => {
    setLinkUrl(project?.targets[0]?.url ?? '')
    setAnchor('')
  }, [project?.id])

  const siteMap = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s])), [sites.data])
  const siteOptions = (sites.data ?? [])
    .filter((s) => s.status === 'active')
    .sort((a, b) => Number(b.language === project?.language) - Number(a.language === project?.language))
    .map((s) => ({ value: s.id, label: s.name, hint: `${s.language.toUpperCase()} · ${typeLabel(s.type)}` }))
  const target = project?.targets.find((t) => t.url === linkUrl)

  if (!projectId || !project) {
    return (
      <>
        <PageHeader title="AI content" />
        <Card><Empty icon={<PenLine className="size-6" />} title="Select or create a project first" action={<Button variant="primary" onClick={() => go('projects')}>Projects</Button>} /></Card>
      </>
    )
  }

  const generate = async () => {
    if (!siteId) return
    const c = await run(
      'gen',
      () => invoke('content:generate', { projectId, siteId, linkUrl: linkUrl || undefined, anchor: anchor || undefined, extra: extra || undefined }),
      (r) => `Generated with ${r.model}${typeof r.creditsRemaining === 'number' ? ` · ${r.creditsRemaining.toLocaleString()} Wriai credits left` : ''}`
    )
    if (c) {
      contents.reload()
      setEditing(c)
    }
  }

  return (
    <>
      <PageHeader title="AI content" subtitle={`Unique posts for ${project.name}, one per target site. Always edit before posting.`} />
      <Card className="mb-6 p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Target site"><Dropdown searchable value={siteId} options={siteOptions} onChange={setSiteId} placeholder="Choose a site" /></Field>
          <Field label="Link to promote">
            <Dropdown value={linkUrl} options={project.targets.map((t) => ({ value: t.url, label: t.url }))} onChange={setLinkUrl} placeholder="Add target URLs in Projects" />
          </Field>
          <Field label="Anchor text" hint={target?.anchors.length ? `Suggestions: ${target.anchors.join(', ')} (random if empty)` : 'Defaults to the project name'}>
            <Input value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          </Field>
          <Field label="Extra instructions (optional)"><Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. focus on the free plan" /></Field>
        </div>
        {siteId && siteMap.get(siteId)?.rules && <p className="mt-3 text-xs text-gray-500">Site rules: {siteMap.get(siteId)!.rules}</p>}
        <div className="mt-4 flex justify-end">
          <Button variant="primary" icon={<Sparkles className="size-4" />} loading={busy === 'gen'} disabled={!siteId} onClick={generate}>
            {busy === 'gen' ? 'Writing...' : 'Generate'}
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {contents.data?.length === 0 ? (
          <Empty icon={<PenLine className="size-6" />} title="No content yet" text="Pick a site above and generate the first post." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Site</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Updated</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {(contents.data ?? []).map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/50" onClick={() => setEditing(c)}>
                  <td className="max-w-md px-4 py-3">
                    <div className="truncate font-medium text-gray-900">{c.title || '(untitled)'}</div>
                    <div className="truncate text-xs text-gray-400">{c.body.slice(0, 140)}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {siteMap.get(c.siteId) ? (
                      <span className="flex items-center gap-2">
                        <SiteIcon url={siteMap.get(c.siteId)!.url} name={siteMap.get(c.siteId)!.name} size="sm" />
                        {siteMap.get(c.siteId)!.name}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-3"><Badge tone={c.status === 'ready' ? 'blue' : c.status === 'used' ? 'green' : 'gray'}>{c.status}</Badge></td>
                  <td className="px-3 py-3 text-gray-500">{fmtDate(c.updatedAt)}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ListPlus className="size-3.5" />}
                        onClick={() => run('q', () => invoke('tasks:create', { projectId, siteIds: [c.siteId] }), (r) => (r.length ? 'Added to posting queue' : 'Already in the queue'))}
                      >
                        Queue
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-3.5" />}
                        onClick={async () => {
                          if (!confirm('Delete this content?')) return
                          await run('del', () => invoke('content:delete', c.id))
                          contents.reload()
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <ContentEditor
        content={editing}
        format={(editing && siteMap.get(editing.siteId)?.format) || 'plain'}
        siteName={editing ? siteMap.get(editing.siteId)?.name : undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          contents.reload()
        }}
      />
    </>
  )
}
