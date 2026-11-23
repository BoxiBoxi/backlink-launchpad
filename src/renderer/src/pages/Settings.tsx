import { useEffect, useState } from 'react'
import { Bot, Globe, KeyRound, Save, Timer } from 'lucide-react'
import type { SettingsInput } from '@shared/types'
import type { PageProps } from '../App'
import { invoke, useAction, useQuery, useToast } from '../lib'
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui'

export default function SettingsPage(_: PageProps) {
  const settings = useQuery('settings:get')
  const [form, setForm] = useState<Required<SettingsInput>>({ bravePath: '', linkCheckIntervalHours: 24, aiEndpoint: '', aiModel: '', aiApiKey: '' })
  const [touched, setTouched] = useState<Set<keyof SettingsInput>>(new Set())
  const { busy, run } = useAction()
  const toast = useToast()

  useEffect(() => {
    if (!settings.data) return
    setForm({
      bravePath: settings.data.bravePath,
      linkCheckIntervalHours: settings.data.linkCheckIntervalHours,
      aiEndpoint: settings.data.aiEndpoint,
      aiModel: settings.data.aiModel,
      aiApiKey: ''
    })
    setTouched(new Set())
  }, [settings.data])

  const set = <K extends keyof SettingsInput>(k: K, v: Required<SettingsInput>[K]) => {
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
  return (
    <>
      <PageHeader title="Settings" actions={<Button variant="primary" icon={<Save className="size-4" />} loading={busy === 'save'} disabled={!touched.size} onClick={save}>Save</Button>} />
      <div className="grid gap-4">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-semibold text-gray-900"><Globe className="size-4" />Brave browser</div>
          <div className="grid gap-4">
            <Field label="brave.exe path" hint="Auto-detected from Program Files / LocalAppData when empty.">
              <Input value={form.bravePath} onChange={(e) => set('bravePath', e.target.value)} placeholder="C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" />
            </Field>
            <Field label="Dedicated profile folder" hint="Separate from your main Brave profile. Sign in to each site once here; sessions persist.">
              <Input value={s?.profileDir ?? ''} readOnly className="bg-gray-50 text-gray-500" />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900"><Bot className="size-4" />AI (OpenAI-compatible)</div>
            {s && <Badge tone={s.aiApiKeySet ? 'green' : 'red'}>{s.aiApiKeySet ? 'key configured' : 'no key'}</Badge>}
          </div>
          <p className="mb-4 text-sm text-gray-500">Defaults come from .env (OPENAI_END_POINT, OPENAI_API_KEY, OPENAI_TEXT_MODEL, with OPENAI_*_BK_1 as fallback). Values saved here override the primary gateway.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Endpoint"><Input value={form.aiEndpoint} onChange={(e) => set('aiEndpoint', e.target.value)} placeholder="https://api.openai.com/v1" /></Field>
            <Field label="Models" hint="Separated by | (first is primary)"><Input value={form.aiModel} onChange={(e) => set('aiModel', e.target.value.replace(/\s*\|\s*/g, '|'))} /></Field>
            <Field label="API key override" className="col-span-2" hint="Leave empty to keep the current key. Stored locally in the app database.">
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 size-4 text-gray-400" />
                <Input type="password" className="pl-9" value={form.aiApiKey} onChange={(e) => set('aiApiKey', e.target.value)} placeholder="sk-..." />
              </div>
            </Field>
          </div>
          <div className="mt-4">
            <Button
              loading={busy === 'test'}
              onClick={async () => {
                const r = await run('test', () => invoke('ai:test'))
                if (r) toast(r.ok ? 'ok' : 'error', r.message)
              }}
            >
              Test connection
            </Button>
          </div>
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
