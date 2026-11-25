// First-run guide: browser check, AI provider, sign-in to sites, first project.
// Shown automatically for new installs (no projects, guide not finished); reopen it from the sidebar.
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, ExternalLink, Globe, Hand, LogIn, RefreshCw, Rocket, Sparkles } from 'lucide-react'
import type { Settings, SetupStatus } from '@shared/types'
import { invoke, useAction } from '../lib'
import { Button, Field, Input } from './ui'
import AiSetup from './AiSetup'
import { APP_BY, APP_NAME, LogoMark } from './Logo'

const STEPS = ['Welcome', 'Browser', 'AI writing', 'Sign in', 'Start'] as const

const BROWSER_DOWNLOAD = 'https://brave.com/download/'

export default function SetupGuide({ onClose, onCreateProject }: { onClose: () => void; onCreateProject: () => void }) {
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [browserPath, setBrowserPath] = useState('')
  const { busy, run } = useAction()

  const refresh = async () => {
    const [st, s] = await Promise.all([invoke('setup:status'), invoke('settings:get')])
    setStatus(st)
    setSettings(s)
  }
  useEffect(() => {
    void refresh()
  }, [])

  const finish = async (thenCreate: boolean) => {
    await invoke('setup:complete')
    onClose()
    if (thenCreate) onCreateProject()
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-6 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* progress */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
              </span>
              <span className={`hidden text-xs sm:inline ${i === step ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="overflow-y-auto px-8 py-7">
          {step === 0 && (
            <div className="grid gap-5">
              <div className="flex items-center gap-4">
                <LogoMark className="size-14" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Welcome to {APP_NAME}</h2>
                  <p className="text-sm text-gray-500">{APP_BY} · plan, write and track your launch posts and backlinks</p>
                </div>
              </div>
              <ul className="grid gap-3 text-sm text-gray-700">
                <li className="flex gap-3"><Globe className="mt-0.5 size-4 shrink-0 text-gray-400" />A catalog of 500+ directories, launch sites, blogs and communities, scored by priority and Ahrefs DR.</li>
                <li className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-gray-400" />AI writes a unique, value-first post for each site, in its language and format.</li>
                <li className="flex gap-3"><Rocket className="mt-0.5 size-4 shrink-0 text-gray-400" />A posting session opens each submit page pre-filled and saves the live URL when you publish.</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-gray-400" />The link monitor checks that your links stay live, and whether they are dofollow.</li>
              </ul>
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <Hand className="mt-0.5 size-4 shrink-0" />
                <div>
                  <b>You stay in control.</b> The app never submits forms, never solves CAPTCHAs and never creates accounts. You review every post and click submit yourself, and follow each community&apos;s rules.
                </div>
              </div>
            </div>
          )}

          {step === 1 && status && (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Browser</h2>
                <p className="text-sm text-gray-500">The app drives a separate browser profile to open submit pages. Brave, Chrome or Microsoft Edge all work; the first one found is used.</p>
              </div>
              {status.browserPath ? (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <b>{status.browserName} found.</b>
                    <div className="truncate text-xs text-emerald-800/80">{status.browserPath}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <b>No browser found.</b> Install Brave, Chrome or Microsoft Edge, then click Check again, or enter the path of an installed Chromium browser.
                    <div className="mt-2">
                      <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => invoke('shell:openExternal', BROWSER_DOWNLOAD)}>Download Brave</Button>
                    </div>
                  </div>
                </div>
              )}
              <Field label="Browser path (optional)" hint="Leave empty to auto-detect.">
                <div className="flex gap-2">
                  <Input value={browserPath} onChange={(e) => setBrowserPath(e.target.value)} placeholder={status.platform === 'win32' ? 'C:\\...\\msedge.exe' : '/Applications/Google Chrome.app/...'} />
                  <Button
                    icon={<RefreshCw className="size-4" />}
                    loading={busy === 'browser'}
                    onClick={() => run('browser', async () => {
                      if (browserPath.trim()) await invoke('settings:save', { bravePath: browserPath.trim() })
                      await refresh()
                    })}
                  >
                    Check again
                  </Button>
                </div>
              </Field>
            </div>
          )}

          {step === 2 && settings && (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI writing</h2>
                <p className="text-sm text-gray-500">Pick how posts are written. You can change this later in Settings, or skip it and write posts yourself.</p>
              </div>
              <AiSetup settings={settings} onSaved={(s) => { setSettings(s); void refresh() }} />
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sign in to the sites you will use</h2>
                <p className="text-sm text-gray-500">
                  This opens the app&apos;s own browser profile (not your everyday browser). Sign in to Product Hunt, Reddit, dev.to, Medium and so on once;
                  the logins are remembered. Close that window when you are done.
                </p>
              </div>
              <div>
                <Button icon={<LogIn className="size-4" />} loading={busy === 'login'} disabled={!status?.browserPath} onClick={() => run('login', () => invoke('browser:openProfile', 'https://www.producthunt.com/'))}>
                  Open the login window
                </Button>
              </div>
              <p className="text-xs text-gray-400">You can do this any time from Publish, Login window.</p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">You are ready</h2>
                <p className="text-sm text-gray-500">Next: create a project for the site you want to promote.</p>
              </div>
              <ol className="grid gap-2 text-sm text-gray-700">
                <li><b>1. Projects:</b> name, description, target URLs and anchors, logo and screenshots.</li>
                <li><b>2. Site catalog:</b> filter by priority or DR, Fetch DR if you have an Ahrefs key.</li>
                <li><b>3. Publish:</b> add 10 to 30 high-priority sites, generate posts, then Start session.</li>
                <li><b>4. Link monitor:</b> check which links are live and dofollow.</li>
              </ol>
              <div className="grid gap-1 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
                <div>Browser: {status?.browserPath ? <span className="text-emerald-700">{status.browserName}</span> : <span className="text-red-600">not set</span>}</div>
                <div>AI writing: {status?.aiReady ? <span className="text-emerald-700">ready</span> : <span className="text-amber-700">not set (posts can still be written by hand)</span>}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <button className="text-xs text-gray-400 hover:text-gray-700" onClick={() => finish(false)}>Skip setup</button>
          <div className="flex gap-2">
            {step > 0 && <Button icon={<ArrowLeft className="size-4" />} onClick={back}>Back</Button>}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                {step === 0 ? 'Get started' : 'Next'}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="primary" icon={<Rocket className="size-4" />} onClick={() => finish(true)}>Create my first project</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
