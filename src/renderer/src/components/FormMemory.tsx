// What the browser extension remembered from submit forms for one project: review, edit or forget it.
import { useEffect, useState } from 'react'
import { Brain, Download, Save, Trash2, Upload } from 'lucide-react'
import type { FormMemoryEntry, Project } from '@shared/types'
import { fmtDate, invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Empty, Input, Modal, Textarea, Toggle } from './ui'

export default function FormMemoryModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const entries = useQuery('memory:list', project?.id ?? 0)
  const learning = useQuery('memory:learning')
  const { busy, run } = useAction()
  const toast = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  useEffect(() => setDrafts({}), [entries.data])
  if (!project) return null

  const list = entries.data ?? []
  const save = async (e: FormMemoryEntry) => {
    const value = drafts[e.key]
    if (value === undefined) return
    await run(`save-${e.key}`, () => invoke('memory:save', { projectId: project.id, key: e.key, value }), 'Saved')
    entries.reload()
  }
  const forget = async (key: string | null) => {
    if (key === null && !confirm(`Forget everything remembered for ${project.name}?`)) return
    await run('forget', () => invoke('memory:delete', { projectId: project.id, key }))
    entries.reload()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Form memory · ${project.name}`}
      wide
      footer={
        <>
          {list.length > 0 && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => forget(null)}>Forget all</Button>}
          <Button icon={<Download className="size-4" />} loading={busy === 'imp'} title="Merge values from a teammate's file" onClick={async () => {
            const n = await run('imp', () => invoke('memory:import', project.id))
            if (n !== undefined && n !== null) {
              toast('ok', `Imported ${n} value(s)`)
              entries.reload()
            }
          }}>Import</Button>
          {list.length > 0 && (
            <Button icon={<Upload className="size-4" />} loading={busy === 'exp'} title="Save these values to a file for a teammate" onClick={async () => {
              const path = await run('exp', () => invoke('memory:export', project.id))
              if (path) toast('ok', `Saved to ${path}. It contains your answers: share it only with people you trust.`)
            }}>Export</Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-gray-500">
          When you type into a submit form on a catalog site, the browser extension remembers the value for this project and fills the same field on the
          next sites (tagline, pricing, category, social links...). Fields it is not sure about are shown on the page as suggestions. Passwords, card numbers
          and codes are never remembered. The project&apos;s own name, tagline and descriptions are used too.
        </p>
        {learning.data !== undefined && (
          <Toggle
            checked={learning.data}
            label="Learn from what I type in submit forms"
            onChange={async (v) => {
              const r = await run('learn', () => invoke('memory:setLearning', v))
              if (r !== undefined) learning.setData(r)
            }}
          />
        )}
        {list.length === 0 ? (
          <Empty icon={<Brain className="size-6" />} title="Nothing remembered yet" text="Fill a submit form on a catalog site in the app's browser window: what you type shows up here." />
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {list.map((e) => {
              const draft = drafts[e.key]
              const long = e.value.length > 80 || e.value.includes('\n')
              return (
                <div key={e.key} className="grid gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900">{e.name}</span>
                    {!e.key.startsWith('label:') && <Badge tone="green">known field</Badge>}
                    <span className="text-xs text-gray-400">
                      from {e.site} · {fmtDate(e.updatedAt)}
                      {e.label && e.label !== e.name ? ` · "${e.label}"` : ''}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    {long ? (
                      <Textarea rows={3} value={draft ?? e.value} onChange={(ev) => setDrafts({ ...drafts, [e.key]: ev.target.value })} />
                    ) : (
                      <Input value={draft ?? e.value} onChange={(ev) => setDrafts({ ...drafts, [e.key]: ev.target.value })} />
                    )}
                    <Button size="sm" icon={<Save className="size-3.5" />} disabled={draft === undefined || draft === e.value} loading={busy === `save-${e.key}`} onClick={() => save(e)} title="Save" />
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} title="Forget" onClick={() => forget(e.key)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
