import { useEffect, useState } from 'react'
import { AppWindow, BarChart3, Bot, Check, Copy, Download, Globe, KeyRound, Puzzle, RefreshCw, Save, Timer, Trash2, Upload, UserRound } from 'lucide-react'
import type { SettingsInput, SignupProfile } from '@shared/types'
import type { PageProps } from '../App'
import { invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Field, Input, PageHeader, Toggle } from '../components/ui'
import AiSetup from '../components/AiSetup'
import { useUpdateStatus } from '../components/UpdateNotice'

export default function SettingsPage(_: PageProps) {
  const settings = useQuery('settings:get')
  const [form, setForm] = useState<{ bravePath: string; linkCheckIntervalHours: number; ahrefsApiKey: string }>({ bravePath: '', linkCheckIntervalHours: 24, ahrefsApiKey: '' })
  type FormKey = 'bravePath' | 'linkCheckIntervalHours' | 'ahrefsApiKey'
  const [touched, setTouched] = useState<Set<FormKey>>(new Set())
  const { busy, run } = useAction()

  useEffect(() => {
    if (!settings.data) return
    setForm({
      bravePath: settings.data.bravePath,
      linkCheckIntervalHours: settings.data.linkCheckIntervalHours,
      ahrefsApiKey: ''
    })
    setTouched(new Set())
  }, [settings.data])

  const set = <K extends FormKey>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setTouched((t) => new Set(t).add(k))
  }

  const save = async () => {
    const input: SettingsInput = {}
    for (const k of touched) (input as Record<string, unknown>)[k] = form[k]
    const r = await run('save', () => invoke('settings:save', input), 'Settings saved')
    if (r) settings.setData(r)
  }

  const s = settings.data
  const update = useUpdateStatus()
  const updateText = !update
    ? ''
    : {
        unsupported: 'Updates are checked only in the installed app.',
        idle: 'Checks GitHub for a new version at startup and every 6 hours.',
        checking: 'Checking for updates...',
        none: 'You have the latest version.',
        available: `Version ${update.version} is available.`,
        downloading: `Downloading version ${update.version} (${update.percent ?? 0}%)...`,
        ready: `Version ${update.version} is ready: restart to install it.`,
        error: `Update check failed: ${update.message ?? 'unknown error'}`
      }[update.state]
  return (
    <>
      <PageHeader title="Settings" subtitle="The Save button applies to Browser, Ahrefs and Link monitor. AI writing has its own Save and test." actions={<Button variant="primary" icon={<Save className="size-4" />} loading={busy === 'save'} disabled={!touched.size} onClick={save}>Save</Button>} />
      <div className="grid gap-4">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900"><Bot className="size-4" />AI writing</div>
            {s && <Badge tone={(s.aiProvider === 'wriai' ? s.wriaiKeySet : s.aiApiKeySet) ? 'green' : 'red'}>{s.aiProvider === 'wriai' ? 'Wriai API' : 'OpenAI-compatible'}</Badge>}
          </div>
          {s && <AiSetup settings={s} onSaved={settings.setData} />}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-semibold text-gray-900"><Globe className="size-4" />Browser</div>
          <div className="grid gap-4">
            <Field label="Browser path" hint="Leave empty to auto-detect (Brave first, then Chrome, then Edge).">
              <Input value={form.bravePath} onChange={(e) => set('bravePath', e.target.value)} placeholder="C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" />
            </Field>
            <Field label="Dedicated profile folder" hint={`Separate from your main browser profile, one folder per browser${s?.browserName && s.browserName !== "none" ? ` (now: ${s.browserName})` : ""}. Sign in to each site once here; sessions persist. Switching browser means signing in again.`}>
              <Input value={s?.profileDir ?? ''} readOnly className="bg-gray-50 text-gray-500" />
            </Field>
          </div>
        </Card>

        <ExtensionCard browserName={s?.browserName ?? 'none'} />
        <SignupProfileCard />
        <SavedAccountsCard />

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900"><AppWindow className="size-4" />App</div>
            {update && <Badge tone="gray">v{update.current}</Badge>}
          </div>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {update?.state === 'ready' || update?.state === 'available' ? (
                <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => void invoke('update:install')}>
                  {update.state === 'ready' ? 'Restart to update' : 'Download update'}
                </Button>
              ) : (
                <Button
                  icon={<RefreshCw className="size-4" />}
                  loading={busy === 'update' || update?.state === 'checking'}
                  disabled={update?.state === 'unsupported' || update?.state === 'downloading'}
                  onClick={() => run('update', () => invoke('update:check'))}
                >
                  Check for updates
                </Button>
              )}
              <span className="text-sm text-gray-500">{updateText}</span>
            </div>
            {s && (
              <div>
                <Toggle
                  checked={s.closeToTray}
                  label="Keep running in the tray when the window is closed"
                  onChange={async (v) => {
                    const r = await run('tray', () => invoke('settings:save', { closeToTray: v }))
                    if (r) settings.setData(r)
                  }}
                />
                <p className="mt-1 pl-6 text-xs text-gray-500">The link monitor keeps checking in the background. Use Quit in the tray icon menu to exit.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900"><BarChart3 className="size-4" />Ahrefs (Domain Rating)</div>
            {s && <Badge tone={s.ahrefsKeySet ? 'green' : 'gray'}>{s.ahrefsKeySet ? 'key configured' : 'no key'}</Badge>}
          </div>
          <p className="mb-4 text-sm text-gray-500">Used by Site catalog, Fetch DR (free DR endpoint, 0 API units). Defaults to AHREFS_API_KEY in .env.</p>
          <Field label="API key override" hint="Leave empty to keep the current key. Stored locally in the app database.">
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 size-4 text-gray-400" />
              <Input type="password" className="pl-9" value={form.ahrefsApiKey} onChange={(e) => set('ahrefsApiKey', e.target.value)} />
            </div>
          </Field>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-semibold text-gray-900"><Timer className="size-4" />Link monitor</div>
          <Field label="Re-check every (hours)" className="max-w-xs">
            <Input type="number" min={1} value={form.linkCheckIntervalHours} onChange={(e) => set('linkCheckIntervalHours', Number(e.target.value))} />
          </Field>
        </Card>
      </div>
    </>
  )
}

/** Status of the Backlink Launchpad browser extension, and how to add it where it cannot be loaded automatically (Chrome). */
function ExtensionCard({ browserName }: { browserName: string }) {
  const status = useQuery('bridge:status')
  const recipes = useQuery('recipes:stats')
  const toast = useToast()
  const { busy, run } = useAction()
  const [copied, setCopied] = useState(false)
  const st = status.data
  const connected = !!st?.extensionSeenAt
  const isChrome = browserName === 'Chrome'
  const copyPath = async () => {
    if (!st?.extensionDir) return
    await invoke('clipboard:write', st.extensionDir)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900"><Puzzle className="size-4" />Browser extension</div>
        <div className="flex items-center gap-2">
          <Badge tone={connected ? 'green' : 'gray'}>{connected ? 'connected' : 'not seen yet'}</Badge>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} title="Refresh" onClick={() => status.reload()} />
        </div>
      </div>
      <p className="text-sm text-gray-500">
        Open in Publish opens the submit page in a normal browser window, so bot checks such as Cloudflare pass. The Backlink Launchpad panel on the
        page fills the form, remembers what you type for the next sites, and saves the live post URL. You still review and submit yourself.
      </p>
      {connected && <p className="mt-2 text-xs text-gray-400">Last seen {new Date(st!.extensionSeenAt!).toLocaleString()}.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-gray-900">Form recipes</div>
          <div className="text-xs text-gray-500">
            Which field means what on each site, learned as you fill forms: {recipes.data ? `${recipes.data.fields} fields on ${recipes.data.sites} site(s)` : '...'}
            {recipes.data?.sharedSites ? `, plus ${recipes.data.sharedSites} shared site(s) built in` : ''}. No personal values: safe to share with your team,
            or to add to catalog/forms.json on GitHub so everyone gets them.
          </div>
        </div>
        <Button size="sm" icon={<Upload className="size-3.5" />} loading={busy === 'rexp'} onClick={async () => {
          const path = await run('rexp', () => invoke('recipes:export'))
          if (path) toast('ok', `Saved to ${path}`)
        }}>Export</Button>
        <Button size="sm" icon={<Download className="size-3.5" />} loading={busy === 'rimp'} onClick={async () => {
          const r = await run('rimp', () => invoke('recipes:import'))
          if (r) {
            toast('ok', `Imported ${r.fields} field(s) for ${r.sites} site(s)`)
            recipes.reload()
          }
        }}>Import</Button>
      </div>
      {isChrome ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Chrome needs the extension added once</b>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Click Login window in Publish to open the app&apos;s Chrome window.</li>
            <li>Type <code className="rounded bg-white/70 px-1">chrome://extensions</code> in the address bar and turn on Developer mode (top right).</li>
            <li>Click Load unpacked and choose this folder (Copy path, then paste it in the folder box):</li>
          </ol>
          <div className="flex gap-2">
            <Input value={st?.extensionDir ?? ''} readOnly className="bg-white text-xs" />
            <Button size="sm" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copyPath} disabled={!st?.extensionDir}>{copied ? 'Copied' : 'Copy path'}</Button>
          </div>
          <p className="text-xs text-amber-800/80">It stays in the app&apos;s profile. Brave and Microsoft Edge load it by themselves.</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{browserName === 'none' ? 'Install a browser first.' : `${browserName} loads the extension by itself when the app opens it.`}</p>
      )}
    </Card>
  )
}

/** Default details the extension fills into sign-up forms, and whether it fills them by itself. */
function SignupProfileCard() {
  const identity = useQuery('identity:get')
  const { busy, run } = useAction()
  const [p, setP] = useState<SignupProfile>({ firstName: '', lastName: '', username: '', email: '', phone: '' })
  const [dirty, setDirty] = useState(false)
  const [pw, setPw] = useState('')
  useEffect(() => {
    if (identity.data) {
      setP(identity.data.profile)
      setPw(identity.data.password)
      setDirty(false)
    }
  }, [identity.data])
  const set = (k: keyof SignupProfile, v: string) => {
    setP((x) => ({ ...x, [k]: v }))
    setDirty(true)
  }
  const save = async () => {
    const r = await run('profile', () => invoke('identity:save', { profile: p, password: pw.trim() }), 'Sign-up profile saved')
    if (r) identity.setData(r)
  }
  const d = identity.data
  return (
    <Card className="p-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900"><UserRound className="size-4" />Sign-up profile</div>
        <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={busy === 'profile'} disabled={!dirty} onClick={save}>Save profile</Button>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        The browser extension fills these into sign-up and sign-in forms on catalog sites, with your password below or, if it is empty, a strong one made for each site. Only what you enter here is used.
        It never ticks terms boxes and never clicks the sign-up button.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="First name (Tên)"><Input value={p.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="An" /></Field>
        <Field label="Last name (Họ và chữ đệm)"><Input value={p.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Nguyễn Văn" /></Field>
        <Field label="Username"><Input value={p.username} onChange={(e) => set('username', e.target.value)} placeholder="annguyen" /></Field>
        <Field label="Email"><Input type="email" value={p.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" /></Field>
        <Field label="Phone (optional)"><Input value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field
          label="Password (optional)"
          hint="Filled into sign-up and sign-in forms on every site. Leave empty to get a strong, different password for each site (safer, see Saved accounts)."
        >
          <Input
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value)
              setDirty(true)
            }}
          />
        </Field>
      </div>
      {d && (
        <div className="mt-4">
          <Toggle
            checked={d.autofill}
            label="Fill sign-up and sign-in forms as soon as the page opens"
            onChange={async (v) => {
              const r = await run('autofill', () => invoke('identity:save', { autofill: v }))
              if (r) identity.setData(r)
            }}
          />
          <p className="mt-1 pl-6 text-xs text-gray-500">Off: the panel on the page shows a Fill button instead. Full names are written family name first on Vietnamese pages.</p>
          {!d.canStorePasswords && (
            <p className="mt-2 text-xs text-amber-700">This computer has no keychain, so passwords are generated but not saved. Copy each one when it is filled.</p>
          )}
        </div>
      )}
    </Card>
  )
}

/** Accounts the extension created passwords for: copy or remove them. */
function SavedAccountsCard() {
  const accounts = useQuery('accounts:list')
  const { run } = useAction()
  const [copiedHost, setCopiedHost] = useState<string | null>(null)
  const copyPassword = async (host: string, pw: string) => {
    if (!pw) return
    await invoke('clipboard:write', pw)
    setCopiedHost(host)
    setTimeout(() => setCopiedHost(null), 2000)
  }
  const list = accounts.data ?? []
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900"><KeyRound className="size-4" />Saved accounts</div>
        <div className="flex items-center gap-2">
          <Badge tone="gray">{list.length}</Badge>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} title="Refresh" onClick={() => accounts.reload()} />
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">None yet. When the extension fills a sign-up form, the site&apos;s password is kept here, encrypted with your computer&apos;s keychain.</p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {list.map((a) => (
            <div key={a.host} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-gray-900">{a.siteName}</div>
                <div className="truncate text-xs text-gray-500">{a.host} · {a.username || a.email || 'no username'}</div>
              </div>
              <code className="max-w-[14rem] truncate rounded-md bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800" title={a.password}>
                {a.password || 'cannot be read on this computer'}
              </code>
              <Button size="sm" icon={copiedHost === a.host ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} disabled={!a.password} onClick={() => copyPassword(a.host, a.password)}>
                {copiedHost === a.host ? 'Copied' : 'Copy'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-3.5" />}
                title="Forget this account"
                onClick={async () => {
                  if (!confirm(`Forget the saved password for ${a.siteName}? The account on the site is not affected.`)) return
                  await run('del', () => invoke('accounts:delete', a.host))
                  accounts.reload()
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
