import { useEffect, useState } from 'react'
import { Brain, FolderKanban, ImageIcon, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Project, ProjectInput } from '@shared/types'
import type { PageProps } from '../App'
import { invoke, localImage, useAction, useQuery } from '../lib'
import { Badge, Button, Card, Dropdown, Empty, Field, Input, ListInput, Modal, PageHeader, Textarea } from '../components/ui'
import FormMemoryModal from '../components/FormMemory'

const blank: ProjectInput = {
  name: '',
  domain: '',
  tagline: '',
  shortDescription: '',
  longDescription: '',
  logoPath: '',
  images: [],
  language: 'en',
  topics: [],
  targets: [{ url: '', anchors: [] }]
}

export default function Projects({ refreshProjects, setProjectId, newProjectRequested, clearNewProjectRequest }: PageProps) {
  const projects = useQuery('projects:list')
  const [editing, setEditing] = useState<(ProjectInput & { id?: number }) | null>(null)
  const [memoryOf, setMemoryOf] = useState<Project | null>(null)
  const startNew = () => setEditing({ ...blank, targets: [{ url: '', anchors: [] }] })
  useEffect(() => {
    if (newProjectRequested) {
      startNew()
      clearNewProjectRequest()
    }
  }, [newProjectRequested])
  const { busy, run } = useAction()

  const save = async () => {
    if (!editing) return
    const clean = { ...editing, targets: editing.targets.filter((t) => t.url.trim()) }
    const saved = await run('save', () => invoke('projects:save', clean), 'Project saved')
    if (saved) {
      setEditing(null)
      projects.reload()
      refreshProjects()
      setProjectId(saved.id)
    }
  }

  const remove = async (p: Project) => {
    if (!confirm(`Delete project "${p.name}" with its content, tasks and tracked links?`)) return
    await run('delete', () => invoke('projects:delete', p.id), 'Project deleted')
    projects.reload()
    refreshProjects()
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Brand profiles for the sites you promote. The AI uses them to write each post."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={startNew}>New project</Button>}
      />
      {projects.data?.length === 0 && (
        <Card>
          <Empty icon={<FolderKanban className="size-6" />} title="No projects yet" text="Add Wriai, AIKTP, yupvox or any site you want to promote." />
        </Card>
      )}
      <div className="flex flex-col gap-4">
        {(projects.data ?? []).map((p) => (
          <Card key={p.id} className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                {p.logoPath ? <img src={localImage(p.logoPath)} className="size-full object-contain" /> : <ImageIcon className="size-5 text-gray-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">{p.name}</span>
                  <Badge>{p.language.toUpperCase()}</Badge>
                  {p.domain && <span className="text-sm text-gray-500">{p.domain}</span>}
                </div>
                {p.tagline && <p className="mt-0.5 text-sm text-gray-600">{p.tagline}</p>}
                {p.shortDescription && <p className="mt-2 text-sm text-gray-500">{p.shortDescription}</p>}
                {p.images.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {p.images.map((img) => (
                      <img key={img} src={localImage(img)} title={img} className="h-16 w-24 shrink-0 rounded-lg border border-gray-200 object-cover object-top" />
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-1.5">
                  {p.targets.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium text-gray-800">{t.url}</span>
                      {t.anchors.map((a) => (
                        <Badge key={a} tone="gray">{a}</Badge>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" icon={<Brain className="size-3.5" />} title="What the browser extension remembered from submit forms" onClick={() => setMemoryOf(p)}>Form memory</Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing({ ...p })}>Edit</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => remove(p)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {memoryOf && <FormMemoryModal project={memoryOf} onClose={() => setMemoryOf(null)} />}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit project' : 'New project'}
        wide
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={save}>Save project</Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Wriai" />
            </Field>
            <Field label="Domain">
              <Input value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value })} placeholder="wriai.com" />
            </Field>
            <Field label="Tagline" className="col-span-2">
              <Input value={editing.tagline} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} />
            </Field>
            <Field label="Short description" className="col-span-2" hint="1-2 sentences, used for directories.">
              <Textarea rows={2} value={editing.shortDescription} onChange={(e) => setEditing({ ...editing, shortDescription: e.target.value })} />
            </Field>
            <Field label="Long description" className="col-span-2" hint="Features, audience, pricing, what makes it different. Facts only: the AI will not invent anything else.">
              <Textarea rows={5} value={editing.longDescription} onChange={(e) => setEditing({ ...editing, longDescription: e.target.value })} />
            </Field>
            <Field label="Main language">
              <Dropdown value={editing.language} options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Vietnamese' }]} onChange={(v) => setEditing({ ...editing, language: v })} />
            </Field>
            <Field label="Topics" hint="Comma separated">
              <ListInput value={editing.topics} onChange={(v) => setEditing({ ...editing, topics: v })} placeholder="ai writing, seo" />
            </Field>
            <Field label="Logo" className="col-span-2">
              <div className="flex gap-2">
                <Input value={editing.logoPath} onChange={(e) => setEditing({ ...editing, logoPath: e.target.value })} placeholder="C:\\path\\logo.png" />
                <Button
                  onClick={async () => {
                    const p = await invoke('projects:pickLogo')
                    if (p) setEditing({ ...editing, logoPath: p })
                  }}
                >
                  Browse
                </Button>
              </div>
            </Field>
            <div className="col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Screenshots / mockups ({editing.images.length})</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ImagePlus className="size-3.5" />}
                  onClick={async () => {
                    const picked = await invoke('projects:pickImages')
                    if (picked.length) setEditing({ ...editing, images: [...new Set([...editing.images, ...picked])] })
                  }}
                >
                  Add images
                </Button>
              </div>
              <p className="mb-2 text-xs text-gray-400">Attached to image upload fields when a task is opened (logo fields get the logo).</p>
              <div className="flex flex-wrap gap-2">
                {editing.images.map((img) => (
                  <div key={img} className="group relative">
                    <img src={localImage(img)} title={img} className="h-20 w-32 rounded-lg border border-gray-200 object-cover object-top" />
                    <button
                      onClick={() => setEditing({ ...editing, images: editing.images.filter((x) => x !== img) })}
                      className="absolute right-1 top-1 hidden rounded-md bg-white/90 p-0.5 text-gray-600 shadow group-hover:block"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Target URLs and anchor texts</span>
                <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ ...editing, targets: [...editing.targets, { url: '', anchors: [] }] })}>
                  Add URL
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {editing.targets.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      value={t.url}
                      placeholder="https://wriai.com/"
                      onChange={(e) => {
                        const targets = [...editing.targets]
                        targets[i] = { ...t, url: e.target.value }
                        setEditing({ ...editing, targets })
                      }}
                    />
                    <ListInput
                      value={t.anchors}
                      placeholder="Anchors, comma separated"
                      onChange={(v) => {
                        const targets = [...editing.targets]
                        targets[i] = { ...t, anchors: v }
                        setEditing({ ...editing, targets })
                      }}
                    />
                    <Button variant="ghost" icon={<X className="size-4" />} onClick={() => setEditing({ ...editing, targets: editing.targets.filter((_, j) => j !== i) })} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
