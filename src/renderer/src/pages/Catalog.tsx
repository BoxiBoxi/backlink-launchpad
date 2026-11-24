import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Site, SiteInput } from '@shared/types'
import type { PageProps } from '../App'
import { fmtDate, invoke, useAction, useIncremental, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Dropdown, Field, Input, ListInput, Menu, Modal, PageHeader, Textarea, Toggle } from '../components/ui'
import { AliveBadge, DrValue, LangBadge, LinkTypeBadge, PriorityScore, SiteCell, TYPE_OPTIONS, TypeBadge } from '../components/site'

// Site visuals live in components/site.tsx; re-exported for older imports.
export { LinkTypeBadge, TYPE_OPTIONS, typeLabel } from '../components/site'

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
  const [sort, setSort] = useState<'priority' | 'dr'>('priority')
  const [drProgress, setDrProgress] = useState<{ done: number; total: number } | null>(null)
  useEffect(() => window.api.onEvent((e) => e.type === 'drProgress' && setDrProgress({ done: e.done, total: e.total })), [])
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
      )
        .sort((a, b) => (sort === 'dr' ? (b.dr ?? -1) - (a.dr ?? -1) || b.priority - a.priority : 0)),
    [sites.data, q, type, lang, tier, sort]
  )
  const { visible: rows, sentinel } = useIncremental(shown, `${q}|${type}|${lang}|${tier}|${sort}`)

  const fetchDr = async (force: boolean) => {
    const ids = shown.map((s) => s.id)
    setDrProgress({ done: 0, total: 0 })
    const r = await run('dr', () => invoke('sites:fetchDr', { ids, force }))
    setDrProgress(null)
    if (r) {
      sites.reload()
      toast(r.error ? 'error' : 'ok', `DR: ${r.updated} site(s) updated from ${r.domains} domain(s)${r.failed ? `, ${r.failed} without DR` : ''}${r.skipped ? `, ${r.skipped} skipped (already had DR)` : ''}.${r.error ? `
${r.error}` : ''}`)
    }
  }

  const checkAll = async () => {
    const res = await run('check', () => invoke('sites:check', shown.map((s) => s.id)))
    if (res) {
      const down = res.filter((r) => r.alive === 'down').length
      const unreachable = res.filter((r) => r.alive === 'unreachable').length
      sites.reload()
      toast(
        'ok',
        `Checked ${res.length} sites: ${res.length - down - unreachable} up, ${down} down${unreachable ? `, ${unreachable} unreachable from your network (blocked or failing here, not necessarily dead)` : ''}`
      )
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
            {busy === 'dr' ? (
              <Button icon={<BarChart3 className="size-4" />} loading>
                Fetching DR {drProgress?.total ? `${drProgress.done}/${drProgress.total}` : ''}
              </Button>
            ) : (
              <Menu
                label="Fetch DR"
                icon={<BarChart3 className="size-4" />}
                items={[
                  { label: 'Sites without DR', hint: String(shown.filter((s) => s.dr === null).length), disabled: !shown.filter((s) => s.dr === null).length, onClick: () => fetchDr(false) },
                  { label: 'Refresh all shown', hint: String(shown.length), disabled: !shown.length, onClick: () => fetchDr(true) }
                ]}
              />
            )}
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
        <Dropdown className="w-40" value={sort} onChange={setSort} options={[{ value: 'priority', label: 'Sort: Priority' }, { value: 'dr', label: 'Sort: DR' }]} />
        <Dropdown className="w-40" value={lang} onChange={setLang} options={[{ value: 'all', label: 'All languages' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Vietnamese' }]} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium" title="Our score 0-100: researched relevance, cost/effort and link value, blended 70/30 with Ahrefs DR once fetched. A score you edit by hand is kept.">
                Priority
              </th>
              <th className="px-3 py-3 font-medium">Site</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Lang</th>
              <th className="px-3 py-3 font-medium" title="Domain Rating by Ahrefs (Fetch DR), or entered manually">DR</th>
              <th className="px-3 py-3 font-medium">Link</th>
              <th className="px-3 py-3 font-medium">Alive</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-4 py-3"><PriorityScore value={s.priority} /></td>
                <td className="max-w-[18rem] px-3 py-3" title={s.rules}>
                  <SiteCell site={s} sub={s.rules || s.url}>
                    {s.needsReview && <Badge tone="amber">review</Badge>}
                    {s.status !== 'active' && <Badge tone="red">{s.status}</Badge>}
                  </SiteCell>
                </td>
                <td className="px-3 py-3"><TypeBadge type={s.type} /></td>
                <td className="px-3 py-3"><LangBadge lang={s.language} /></td>
                <td className="px-3 py-3"><DrValue dr={s.dr} checkedAt={s.drCheckedAt} /></td>
                <td className="px-3 py-3"><LinkTypeBadge type={s.linkType} /></td>
                <td className="whitespace-nowrap px-3 py-3">
                  <AliveBadge alive={s.alive} httpStatus={s.httpStatus} error={s.checkError} title={s.lastCheckedAt ? `Checked ${fmtDate(s.lastCheckedAt)}` : 'Never checked'} />
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
        {sentinel}
      </Card>
      {(sites.data ?? []).some((s) => s.dr !== null) && (
        // Required by the Ahrefs Domain Rating license: attribution next to displayed DR values.
        <p className="-mt-2 text-right text-xs text-gray-400">
          Domain Rating by{' '}
          <button type="button" className="font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900" onClick={() => invoke('shell:openExternal', 'https://ahrefs.com/')}>
            Ahrefs
          </button>
        </p>
      )}

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
