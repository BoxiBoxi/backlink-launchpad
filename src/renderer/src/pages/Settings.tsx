import { useEffect, useState } from 'react'
import { AppWindow, BarChart3, Bot, Globe, KeyRound, RefreshCw, Save, Timer } from 'lucide-react'
import type { SettingsInput } from '@shared/types'
import type { PageProps } from '../App'
import { invoke, useAction, useQuery } from '../lib'
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
            <div className="flex items-center gap-2 font-semibold text-gray-900"><Bot className="size-4" />AI writing</div>
            {s && <Badge tone={(s.aiProvider === 'wriai' ? s.wriaiKeySet : s.aiApiKeySet) ? 'green' : 'red'}>{s.aiProvider === 'wriai' ? 'Wriai API' : 'OpenAI-compatible'}</Badge>}
          </div>
          {s && <AiSetup settings={s} onSaved={settings.setData} />}
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
