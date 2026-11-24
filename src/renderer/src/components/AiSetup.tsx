// AI provider picker shared by Settings and the first-run setup:
//   Wriai API (default, billed in Wriai credits) or any OpenAI-compatible endpoint.
import { useEffect, useState } from 'react'
import { Check, ExternalLink, KeyRound, Sparkles, Wrench } from 'lucide-react'
import type { AiProvider, Settings } from '@shared/types'
import { invoke, useAction, useToast } from '../lib'
import { Badge, Button, Field, Input } from './ui'

export const WRIAI_KEY_URL = 'https://wriai.com/dashboard/api-docs'
export const WRIAI_SIGNUP_URL = 'https://wriai.com/register'

function ProviderCard({ active, onClick, icon, title, badge, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-1.5 rounded-xl border p-4 text-left transition ${
        active ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {icon}
        {title}
        {badge && <Badge tone="dark">{badge}</Badge>}
        {active && <Check className="ml-auto size-4 text-gray-900" />}
      </div>
      <div className="text-xs leading-relaxed text-gray-500">{children}</div>
    </button>
  )
}

export default function AiSetup({ settings, onSaved, compact }: { settings: Settings; onSaved: (s: Settings) => void; compact?: boolean }) {
  const [provider, setProvider] = useState<AiProvider>(settings.aiProvider)
  const [wriaiKey, setWriaiKey] = useState('')
  const [endpoint, setEndpoint] = useState(settings.aiEndpoint)
  const [model, setModel] = useState(settings.aiModel.replace(/\s*\|\s*/g, '|'))
  const [customKey, setCustomKey] = useState('')
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null)
  const { busy, run } = useAction()
  const toast = useToast()

  useEffect(() => {
    setProvider(settings.aiProvider)
    setEndpoint(settings.aiEndpoint)
    setModel(settings.aiModel.replace(/\s*\|\s*/g, '|'))
  }, [settings])

  const saveAndTest = async () => {
    const input =
      provider === 'wriai'
        ? { aiProvider: provider, ...(wriaiKey.trim() ? { wriaiApiKey: wriaiKey.trim() } : {}) }
        : {
            aiProvider: provider,
            ...(endpoint !== settings.aiEndpoint ? { aiEndpoint: endpoint } : {}),
            ...(model !== settings.aiModel.replace(/\s*\|\s*/g, '|') ? { aiModel: model } : {}),
            ...(customKey.trim() ? { aiApiKey: customKey.trim() } : {})
          }
    const saved = await run('save', () => invoke('settings:save', input))
    if (!saved) return
    onSaved(saved)
    setWriaiKey('')
    setCustomKey('')
    const r = await run('test', () => invoke('ai:test'))
    if (r) {
      setTested(r)
      toast(r.ok ? 'ok' : 'error', r.message)
    }
  }

  const keySet = provider === 'wriai' ? settings.wriaiKeySet : settings.aiApiKeySet

  return (
    <div className="grid gap-4">
      <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <ProviderCard active={provider === 'wriai'} onClick={() => setProvider('wriai')} icon={<Sparkles className="size-4" />} title="Wriai API" badge="Recommended">
          No setup: paste the API key from your Wriai account. Generation is billed in Wriai credits by the number of characters written.
        </ProviderCard>
        <ProviderCard active={provider === 'custom'} onClick={() => setProvider('custom')} icon={<Wrench className="size-4" />} title="OpenAI-compatible">
          Bring your own endpoint and key (OpenAI, OpenRouter, a gateway, a local model). Billed by that provider.
        </ProviderCard>
      </div>

      {provider === 'wriai' ? (
        <div className="grid gap-3">
          <Field label={`Wriai API key${settings.wriaiKeySet ? ' (saved, leave empty to keep it)' : ''}`}>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 size-4 text-gray-400" />
              <Input type="password" className="pl-9" value={wriaiKey} onChange={(e) => setWriaiKey(e.target.value)} placeholder="wri_live_..." />
            </div>
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <button type="button" className="inline-flex items-center gap-1 font-medium text-gray-900 underline underline-offset-2" onClick={() => invoke('shell:openExternal', WRIAI_KEY_URL)}>
              Get your API key <ExternalLink className="size-3" />
            </button>
            <span>
              No account yet?{' '}
              <button type="button" className="font-medium text-gray-900 underline underline-offset-2" onClick={() => invoke('shell:openExternal', WRIAI_SIGNUP_URL)}>
                Create one on wriai.com
              </button>{' '}
              (API access needs an active Wriai plan)
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Endpoint"><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" /></Field>
          <Field label="Models" hint="Separated by | (first is primary)"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4.1-mini" /></Field>
          <Field label={`API key${settings.aiApiKeySet ? ' (configured, leave empty to keep it)' : ''}`} className="col-span-2">
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 size-4 text-gray-400" />
              <Input type="password" className="pl-9" value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="sk-..." />
            </div>
          </Field>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" loading={busy === 'save' || busy === 'test'} onClick={saveAndTest}>
          Save and test
        </Button>
        {tested ? (
          <span className={`whitespace-pre-line text-xs ${tested.ok ? 'text-emerald-700' : 'text-red-600'}`}>{tested.message.replace('All AI gateways failed:\n', 'Failed: ').slice(0, 240)}</span>
        ) : (
          <span className="text-xs text-gray-400">{keySet ? 'A key is saved for this provider.' : 'No key saved for this provider yet.'}</span>
        )}
      </div>
    </div>
  )
}
