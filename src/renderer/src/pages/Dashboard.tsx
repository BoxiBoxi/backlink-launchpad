import { ArrowRight, CheckCircle2, FolderKanban, Link2, ListChecks, PenLine, ShieldCheck } from 'lucide-react'
import type { PageProps } from '../App'
import { useQuery } from '../lib'
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui'

export default function Dashboard({ setProjectId, go }: PageProps) {
  const projects = useQuery('projects:list')
  const stats = useQuery('projects:stats')
  const sites = useQuery('sites:list')

  const byId = new Map((stats.data ?? []).map((s) => [s.projectId, s]))
  const totals = (stats.data ?? []).reduce(
    (a, s) => ({ placed: a.placed + s.placed, live: a.live + s.live, dofollow: a.dofollow + s.dofollow, pending: a.pending + s.pendingTasks }),
    { placed: 0, live: 0, dofollow: 0, pending: 0 }
  )

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Placed, live and dofollow links per promoted site." />
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card className="p-5"><Stat icon={<Link2 className="size-3.5" />} label="Links placed" value={totals.placed} /></Card>
        <Card className="p-5"><Stat icon={<CheckCircle2 className="size-3.5" />} label="Live" value={totals.live} /></Card>
        <Card className="p-5"><Stat icon={<ShieldCheck className="size-3.5" />} label="Dofollow" value={totals.dofollow} /></Card>
        <Card className="p-5"><Stat icon={<ListChecks className="size-3.5" />} label="Tasks pending" value={totals.pending} /></Card>
      </div>

      {projects.data && projects.data.length === 0 ? (
        <Card>
          <Empty
            icon={<FolderKanban className="size-6" />}
            title="Add your first project"
            text={`Create a brand profile (Wriai, AIKTP, ...). ${sites.data?.length ?? 0} target sites are ready in the catalog.`}
            action={<Button variant="primary" onClick={() => go('projects')}>Create project</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {(projects.data ?? []).map((p) => {
            const s = byId.get(p.id)
            return (
              <Card key={p.id} className="p-6">
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.domain || 'No domain'}</div>
                  </div>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-500">{p.language}</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Placed" value={s?.placed ?? 0} />
                  <Stat label="Live" value={s?.live ?? 0} />
                  <Stat label="Dofollow" value={s?.dofollow ?? 0} />
                </div>
                <div className="mt-5 flex items-center gap-4 border-t border-gray-100 pt-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5"><PenLine className="size-3.5" />{s?.drafts ?? 0} drafts</span>
                  <span className="flex items-center gap-1.5"><ListChecks className="size-3.5" />{s?.pendingTasks ?? 0} to post</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5" />{s?.postedTasks ?? 0} posted</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    icon={<ArrowRight className="size-3.5" />}
                    onClick={() => {
                      setProjectId(p.id)
                      go('queue')
                    }}
                  >
                    Queue
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
