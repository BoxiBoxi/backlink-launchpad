import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, CheckCircle2, FolderPlus, Globe, Link2, ListChecks, PenLine, Plus, Rocket, ShieldCheck, Sparkles } from 'lucide-react'
import type { PageProps } from '../App'
import { localImage, useQuery } from '../lib'
import { Button, Card, PageHeader } from '../components/ui'

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{value.toLocaleString()}</div>
        <div className="text-xs font-medium text-gray-500">{label}</div>
      </div>
    </Card>
  )
}

function MiniStat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

const STEPS = [
  { icon: FolderPlus, title: 'Add a project', text: 'Name, description, target URLs with anchors, logo and screenshots.' },
  { icon: BookOpen, title: 'Pick sites', text: 'Filter the catalog by priority or DR and add 10 to 30 sites to the queue.' },
  { icon: Sparkles, title: 'Generate posts', text: 'AI writes a unique post per site, in its language and format.' },
  { icon: Rocket, title: 'Post and track', text: 'Start a session, publish each post, and the link monitor checks it.' }
]

export default function Dashboard({ setProjectId, go, createProject }: PageProps) {
  const projects = useQuery('projects:list')
  const stats = useQuery('projects:stats')
  const sites = useQuery('sites:list')

  const byId = new Map((stats.data ?? []).map((s) => [s.projectId, s]))
  const totals = (stats.data ?? []).reduce(
    (a, s) => ({ placed: a.placed + s.placed, live: a.live + s.live, dofollow: a.dofollow + s.dofollow, pending: a.pending + s.pendingTasks }),
    { placed: 0, live: 0, dofollow: 0, pending: 0 }
  )
  const noProjects = projects.data !== undefined && projects.data.length === 0
  const open = (id: number, page: 'queue' | 'content' | 'links') => {
    setProjectId(id)
    go(page)
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Placed, live and dofollow links for every site you promote."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={createProject}>Add project</Button>}
      />

      {noProjects ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col items-start gap-6 border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white p-8 lg:flex-row lg:items-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white">
              <Rocket className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-gray-900">Start your first campaign</h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Add the site you want to promote. {sites.data?.length ?? 0} directories, launch sites, blogs and communities are ready in the catalog.
              </p>
            </div>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={createProject}>Add project</Button>
          </div>
          <ol className="grid gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 bg-white p-6">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                  <s.icon className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{i + 1}. {s.title}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard icon={<Link2 className="size-5" />} label="Links placed" value={totals.placed} tone="bg-gray-100 text-gray-700" />
            <StatCard icon={<CheckCircle2 className="size-5" />} label="Live" value={totals.live} tone="bg-emerald-50 text-emerald-600" />
            <StatCard icon={<ShieldCheck className="size-5" />} label="Dofollow" value={totals.dofollow} tone="bg-sky-50 text-sky-600" />
            <StatCard icon={<ListChecks className="size-5" />} label="Tasks to post" value={totals.pending} tone="bg-amber-50 text-amber-600" />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Projects</h2>
            <span className="text-xs text-gray-400">{projects.data?.length ?? 0} total</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {(projects.data ?? []).map((p) => {
              const s = byId.get(p.id)
              const total = (s?.pendingTasks ?? 0) + (s?.postedTasks ?? 0)
              const pct = total ? Math.round(((s?.postedTasks ?? 0) / total) * 100) : 0
              return (
                <Card key={p.id} className="flex flex-col p-6">
                  <div className="mb-5 flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                      {p.logoPath ? <img src={localImage(p.logoPath)} className="size-full object-contain p-1" /> : <Globe className="size-5 text-gray-400" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold text-gray-900">{p.name}</div>
                      <div className="truncate text-sm text-gray-500">{p.domain || 'No domain'}</div>
                    </div>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-500">{p.language}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <MiniStat label="Placed" value={s?.placed ?? 0} />
                    <MiniStat label="Live" value={s?.live ?? 0} tone="text-emerald-600" />
                    <MiniStat label="Dofollow" value={s?.dofollow ?? 0} tone="text-sky-600" />
                  </div>
                  <div className="mt-5">
                    <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                      <span>Queue progress</span>
                      <span className="tabular-nums">{s?.postedTasks ?? 0} / {total} posted</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    <Button size="sm" variant="ghost" icon={<PenLine className="size-3.5" />} onClick={() => open(p.id, 'content')}>{s?.drafts ?? 0} drafts</Button>
                    <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => open(p.id, 'links')}>Links</Button>
                    <Button size="sm" className="ml-auto" icon={<ArrowRight className="size-3.5" />} onClick={() => open(p.id, 'queue')}>Posting queue</Button>
                  </div>
                </Card>
              )
            })}
            <button
              type="button"
              onClick={createProject}
              className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:bg-white hover:text-gray-900"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-gray-100"><Plus className="size-5" /></span>
              Add project
            </button>
          </div>
        </>
      )}
    </>
  )
}
