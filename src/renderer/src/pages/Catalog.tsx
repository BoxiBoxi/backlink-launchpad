import { useMemo, useState } from 'react'
import { Activity, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Site, SiteInput } from '@shared/types'
import type { PageProps } from '../App'
import { fmtDate, invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Dropdown, Field, Input, ListInput, Modal, PageHeader, Textarea, Toggle } from '../components/ui'

export const TYPE_OPTIONS = [
  { value: 'directory', label: 'Directory' },
  { value: 'launch', label: 'Launch platform' },
  { value: 'ugc_blog', label: 'UGC blog' },
  { value: 'community', label: 'Community' },
  { value: 'forum', label: 'Forum' },
  { value: 'qa', label: 'Q&A' }
] as const

export const typeLabel = (t: string) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t

export function LinkTypeBadge({ type }: { type: string | null }) {
  if (!type) return <Badge>-</Badge>
  const tone = type === 'dofollow' ? 'green' : type === 'unknown' ? 'gray' : 'amber'
  return <Badge tone={tone}>{type}</Badge>
}

export function PriorityBar({ value }: { value: number }) {
  const tone = value >= 70 ? 'bg-gray-900' : value >= 40 ? 'bg-gray-500' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2" title={`Priority ${value}`}>
      <span className="w-6 text-right text-xs font-semibold tabular-nums text-gray-900">{value}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100"><span className={`block h-full ${tone}`} style={{ width: `${value}%` }} /></span>
    </div>
  )
}

const blank: SiteInput = {
  name: '',
  url: '',
  submitUrl: '',
  type: 'directory',
  language: 'en',
  topics: [],
  dr: null,
  priority: 50,
  linkType: 'unknown',
  needsReview: false,
  format: 'plain',
  maxLength: null,
  rules: '',
  notes: '',
  status: 'active'
}

export default function Catalog(_: PageProps) {
  const sites = useQuery('sites:list')
  const [q, setQ] = useState('')
  const [type, setType] = useState<string>('all')
  const [lang, setLang] = useState<string>('all')
  const [tier, setTier] = useState<string>('all')
  const [editing, setEditing] = useState<(SiteInput & { id?: number }) | null>(null)
  const { busy, run } = useAction()
  const toast = useToast()

  const shown = useMemo(
    () =>
      (sites.data ?? []).filter(
        (s) =>
          (type === 'all' || s.type === type) &&
          (lang === 'all' || s.language === lang) &&
          (tier === 'all' || (tier === 'high' ? s.priority >= 70 : tier === 'mid' ? s.priority >= 40 && s.priority < 70 : s.priority < 40)) &&
          (!q || `${s.name} ${s.url} ${s.topics.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [sites.data, q, type, lang, tier]
  )

  const checkAll = async () => {
    const res = await run('check', () => invoke('sites:check', shown.map((s) => s.id)))
    if (res) {
      const down = res.filter((r) => r.alive === 'down').length
      sites.reload()
      toast('ok', `Checked ${res.length} sites: ${res.length - down} up, ${down} down`)
    }
  }

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim() || !editing.url.trim()) return toast('error', 'Name and URL are required')
    const ok = await run('save', () => invoke('sites:save', editing), 'Site saved')
    if (ok) {
      setEditing(null)
      sites.reload()
    }
  }

  const remove = async (s: Site) => {
    if (!confirm(`Remove ${s.name} from the catalog?`)) return
    await run('del', () => invoke('sites:delete', s.id))
    sites.reload()
  }

  return (
    <>
      <PageHeader
        title="Site catalog"
        subtitle={`${sites.data?.length ?? 0} places to publish. Link type stays "unknown" until a placed link is verified.`}
        actions={
          <>
            <Button icon={<Activity className="size-4" />} loading={busy === 'check'} onClick={checkAll}>Check {shown.length} alive</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ ...blank })}>Add site</Button>
          </>
        }
      />
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-gray-400" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, URL, topic" />
        </div>
        <Dropdown className="w-48" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...TYPE_OPTIONS]} />
        <Dropdown className="w-44" value={tier} onChange={setTier} options={[{ value: 'all', label: 'All priorities' }, { value: 'high', label: 'High (70+)' }, { value: 'mid', label: 'Medium (40-69)' }, { value: 'low', label: 'Low (<40)' }]} />
        <Dropdown className="w-40" value={lang} onChange={setLang} options={[{ value: 'all', label: 'All languages' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Vietnamese' }]} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium" title="0-100, higher = post here first">Priority</th>
              <th className="px-3 py-3 font-medium">Site</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Lang</th>
              <th className="px-3 py-3 font-medium">DR</th>
              <th className="px-3 py-3 font-medium">Link</th>
              <th className="px-3 py-3 font-medium">Alive</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-4 py-3"><PriorityBar value={s.priority} /></td>
                <td className="max-w-md px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{s.name}</span>
                    {s.needsReview && <Badge tone="blue">review</Badge>}
                    {s.status !== 'active' && <Badge tone="red">{s.status}</Badge>}
                  </div>
                  <div className="truncate text-xs text-gray-400" title={s.rules}>{s.rules || s.url}</div>
                </td>
                <td className="px-3 py-3 text-gray-600">{typeLabel(s.type)}</td>
                <td className="px-3 py-3 uppercase text-gray-600">{s.language}</td>
                <td className="px-3 py-3 text-gray-600">{s.dr ?? '-'}</td>
                <td className="px-3 py-3"><LinkTypeBadge type={s.linkType} /></td>
                <td className="px-3 py-3" title={s.lastCheckedAt ? `Checked ${fmtDate(s.lastCheckedAt)}` : 'Never checked'}>
                  <Badge tone={s.alive === 'up' ? 'green' : s.alive === 'down' ? 'red' : 'gray'}>
                    {s.alive}{s.httpStatus ? ` ${s.httpStatus}` : ''}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => invoke('shell:openExternal', s.url)} />
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing({ ...s })} />
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => remove(s)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'Add site'}
        wide
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={save}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-3 gap-4">
            <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="URL"><Input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://" /></Field>
            <Field label="Submit / new post URL"><Input value={editing.submitUrl} onChange={(e) => setEditing({ ...editing, submitUrl: e.target.value })} placeholder="https://" /></Field>
            <Field label="Type"><Dropdown value={editing.type} options={[...TYPE_OPTIONS]} onChange={(v) => setEditing({ ...editing, type: v })} /></Field>
            <Field label="Language"><Dropdown value={editing.language} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Vietnamese' }]} onChange={(v) => setEditing({ ...editing, language: v })} /></Field>
            <Field label="Content format">
              <Dropdown value={editing.format} options={[{ value: 'plain', label: 'Plain text' }, { value: 'markdown', label: 'Markdown' }, { value: 'html', label: 'HTML' }]} onChange={(v) => setEditing({ ...editing, format: v })} />
            </Field>
            <Field label="Priority (0-100)" hint="Higher = post here first">
              <Input type="number" min={0} max={100} value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
            </Field>
            <Field label="DR (manual)">
              <Input type="number" value={editing.dr ?? ''} onChange={(e) => setEditing({ ...editing, dr: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Link type">
              <Dropdown
                value={editing.linkType}
                options={[{ value: 'unknown', label: 'Unknown' }, { value: 'dofollow', label: 'Dofollow' }, { value: 'nofollow', label: 'Nofollow' }, { value: 'ugc', label: 'UGC' }]}
                onChange={(v) => setEditing({ ...editing, linkType: v })}
              />
            </Field>
            <Field label="Max length (chars)">
              <Input type="number" value={editing.maxLength ?? ''} onChange={(e) => setEditing({ ...editing, maxLength: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Status">
              <Dropdown value={editing.status} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'avoid', label: 'Avoid' }]} onChange={(v) => setEditing({ ...editing, status: v })} />
            </Field>
            <Field label="Topics" className="col-span-2"><ListInput value={editing.topics} onChange={(v) => setEditing({ ...editing, topics: v })} /></Field>
            <Field label="Link rules" className="col-span-3" hint="Passed to the AI when writing for this site.">
              <Textarea rows={2} value={editing.rules} onChange={(e) => setEditing({ ...editing, rules: e.target.value })} />
            </Field>
            <Field label="Private notes" className="col-span-3">
              <Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="col-span-3"><Toggle checked={editing.needsReview} onChange={(v) => setEditing({ ...editing, needsReview: v })} label="Submissions are moderated / reviewed" /></div>
          </div>
        )}
      </Modal>
    </>
  )
}
