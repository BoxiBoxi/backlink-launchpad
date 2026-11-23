import { useMemo, useState } from 'react'
import { ExternalLink, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { PlacedLink } from '@shared/types'
import type { PageProps } from '../App'
import { fmtDate, invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Dropdown, Empty, Field, Input, Modal, PageHeader, Stat } from '../components/ui'

function RelBadge({ link }: { link: PlacedLink }) {
  if (link.lastCheckedAt === null) return <Badge>not checked</Badge>
  if (!link.pageLive) return <Badge tone="red">page down</Badge>
  if (!link.linkFound) return <Badge tone="red">link missing</Badge>
  return <Badge tone={link.rel === 'dofollow' ? 'green' : 'amber'}>{link.rel}</Badge>
}

export default function Links({ projectId }: PageProps) {
  const projects = useQuery('projects:list')
  const sites = useQuery('sites:list')
  const [scope, setScope] = useState<'project' | 'all'>('project')
  const links = useQuery('links:list', scope === 'all' ? null : projectId)
  const { busy, run } = useAction()
  const toast = useToast()
  const project = projects.data?.find((p) => p.id === projectId)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ pageUrl: '', targetUrl: '', expectedAnchor: '', siteId: null as number | null })

  const siteMap = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s])), [sites.data])
  const projectMap = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data])
  const list = links.data ?? []
  const live = list.filter((l) => l.pageLive && l.linkFound)

  const check = async (ids: number[] | null) => {
    const r = await run(ids?.length === 1 ? `check-${ids[0]}` : 'check-all', () => invoke('links:check', ids))
    if (r) {
      toast('ok', `Checked ${r.length} link(s): ${r.filter((l) => l.pageLive && l.linkFound).length} live`)
      links.reload()
      sites.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="Link monitor"
        subtitle="Checks each placed link: page live, link present, rel attribute and anchor text. Runs automatically on the interval set in Settings."
        actions={
          <>
            <Dropdown className="w-44" value={scope} onChange={setScope} options={[{ value: 'project', label: project ? project.name : 'Active project' }, { value: 'all', label: 'All projects' }]} />
            <Button icon={<RefreshCw className="size-4" />} loading={busy === 'check-all'} disabled={!list.length} onClick={() => check(list.map((l) => l.id))}>Check all</Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              disabled={!project}
              onClick={() => {
                setForm({ pageUrl: '', targetUrl: project?.targets[0]?.url ?? '', expectedAnchor: '', siteId: null })
                setAdding(true)
              }}
            >
              Add link
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="p-5"><Stat label="Placed" value={list.length} /></Card>
        <Card className="p-5"><Stat label="Live" value={live.length} /></Card>
        <Card className="p-5"><Stat label="Dofollow" value={live.filter((l) => l.rel === 'dofollow').length} /></Card>
      </div>
      <Card className="overflow-x-auto">
        {!list.length ? (
          <Empty icon={<Link2 className="size-6" />} title="No links tracked yet" text='Links are added when you mark a task as posted, or add one manually.' />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-3 py-3 font-medium">Target / anchor</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Checked</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="max-w-xs px-4 py-3">
                    <div className="font-medium text-gray-900">{(l.siteId && siteMap.get(l.siteId)?.name) || new URL(l.pageUrl).hostname}</div>
                    <div className="truncate text-xs text-gray-400" title={l.pageUrl}>{l.pageUrl}</div>
                    {scope === 'all' && <div className="text-xs text-gray-400">{projectMap.get(l.projectId)?.name}</div>}
                  </td>
                  <td className="max-w-xs px-3 py-3">
                    <div className="truncate text-gray-700" title={l.targetUrl}>{l.targetUrl}</div>
                    <div className="truncate text-xs text-gray-400">
                      {l.anchorFound ? `"${l.anchorFound}"` : l.expectedAnchor ? `expected "${l.expectedAnchor}"` : ''}
                      {l.relRaw ? ` · rel="${l.relRaw}"` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <RelBadge link={l} />
                      {l.error && <span className="max-w-48 truncate text-xs text-red-500" title={l.error}>{l.error}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-500">{fmtDate(l.lastCheckedAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={busy === `check-${l.id}`} onClick={() => check([l.id])} />
                      <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => invoke('shell:openExternal', l.pageUrl)} />
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={async () => { if (confirm('Stop tracking this link?')) { await run('del', () => invoke('links:delete', l.id)); links.reload() } }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Track a placed link"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'add'}
              onClick={async () => {
                if (!projectId) return
                const l = await run('add', () => invoke('links:add', { projectId, ...form }))
                if (l) {
                  setAdding(false)
                  links.reload()
                  check([l.id])
                }
              }}
            >
              Add and check
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Page URL (where the link was placed)"><Input value={form.pageUrl} onChange={(e) => setForm({ ...form, pageUrl: e.target.value })} placeholder="https://" /></Field>
          <Field label="Target URL (your site)"><Input value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} placeholder="https://" /></Field>
          <Field label="Expected anchor (optional)"><Input value={form.expectedAnchor} onChange={(e) => setForm({ ...form, expectedAnchor: e.target.value })} /></Field>
          <Field label="Catalog site (optional)">
            <Dropdown searchable value={form.siteId} onChange={(v) => setForm({ ...form, siteId: v })} placeholder="None" options={(sites.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
        </div>
      </Modal>
    </>
  )
}
