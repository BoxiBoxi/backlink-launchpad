import { useEffect, useState } from 'react'
import { BookOpen, Compass, FolderKanban, LayoutDashboard, Link2, ListChecks, PenLine, Settings as SettingsIcon } from 'lucide-react'
import { invoke, requestRefresh, ToastProvider, useQuery, useToast } from './lib'
import { Dropdown } from './components/ui'
import SetupGuide from './components/SetupGuide'
import { APP_BY, APP_NAME, LogoMark } from './components/Logo'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Catalog from './pages/Catalog'
import ContentPage from './pages/Content'
import Queue from './pages/Queue'
import Links from './pages/Links'
import SettingsPage from './pages/Settings'

export type Page = 'dashboard' | 'projects' | 'catalog' | 'content' | 'queue' | 'links' | 'settings'

const NAV: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'catalog', label: 'Site catalog', icon: BookOpen },
  { id: 'content', label: 'AI content', icon: PenLine },
  { id: 'queue', label: 'Posting queue', icon: ListChecks },
  { id: 'links', label: 'Link monitor', icon: Link2 },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
]

export interface PageProps {
  projectId: number | null
  setProjectId: (id: number | null) => void
  go: (p: Page) => void
  refreshProjects: () => void
}

function Shell() {
  const [page, setPage] = useState<Page>('dashboard')
  const [projectId, setProjectId] = useState<number | null>(null)
  const projects = useQuery('projects:list')
  const toast = useToast()
  const [guideOpen, setGuideOpen] = useState(false)

  // First run: show the setup guide until it is finished or skipped (existing users with projects skip it).
  useEffect(() => {
    invoke('setup:status')
      .then((s) => {
        if (!s.done && !s.hasProjects) setGuideOpen(true)
      })
      .catch(() => undefined)
  }, [])

  // Events from the posting session (auto-detected posts) are shown on every page.
  useEffect(
    () =>
      window.api.onEvent((e) => {
        if (e.type === 'autoPosted') {
          toast('ok', `Posted on ${e.siteName}. Link saved:
${e.url}`, {
            label: 'Undo',
            onClick: () => void invoke('tasks:undoPosted', { taskId: e.taskId, linkId: e.linkId }).then(requestRefresh)
          })
        }
        requestRefresh()
      }),
    [toast]
  )

  useEffect(() => {
    if (projectId === null && projects.data?.length) setProjectId(projects.data[0].id)
    if (projectId !== null && projects.data && !projects.data.some((p) => p.id === projectId)) setProjectId(projects.data[0]?.id ?? null)
  }, [projects.data, projectId])

  const props: PageProps = { projectId, setProjectId, go: setPage, refreshProjects: projects.reload }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark className="size-9 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-gray-900">{APP_NAME}</div>
            <button className="text-xs text-gray-400 hover:text-emerald-600" onClick={() => invoke('shell:openExternal', 'https://wriai.com/')}>
              {APP_BY}
            </button>
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Active project</div>
          <Dropdown
            value={projectId}
            placeholder="No project yet"
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            onChange={setProjectId}
          />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                page === n.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <n.icon className="size-4" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-2">
          <button onClick={() => setGuideOpen(true)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <Compass className="size-4" />
            Setup guide
          </button>
        </div>
        <div className="px-5 pb-4 text-[11px] leading-relaxed text-gray-400">
          Human in the loop: the app fills drafts, you review and submit.
        </div>
      </aside>
      {guideOpen && (
        <SetupGuide
          onClose={() => {
            setGuideOpen(false)
            requestRefresh()
          }}
          onCreateProject={() => setPage('projects')}
        />
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">
          {page === 'dashboard' && <Dashboard {...props} />}
          {page === 'projects' && <Projects {...props} />}
          {page === 'catalog' && <Catalog {...props} />}
          {page === 'content' && <ContentPage {...props} />}
          {page === 'queue' && <Queue {...props} />}
          {page === 'links' && <Links {...props} />}
          {page === 'settings' && <SettingsPage {...props} />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}
