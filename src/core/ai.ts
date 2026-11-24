// Minimal OpenAI-compatible chat client with gateway + model fallback.
// Mirrors the behaviour of Wriai's src/lib/ai.ts (models split by "|" or ",",
// GPT-5+/o-series use max_completion_tokens without temperature, relax params on HTTP 400).
// No Electron or env access here: callers pass the gateways in, so this module can move into Wriai later.

export interface AiGateway {
  name: string
  url: string
  key: string
  models: string[]
}

export interface ChatOptions {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  json?: boolean
}

export interface ChatResult {
  content: string
  model: string
  gateway: string
  /** Wriai API only: credits charged for this call and balance left (from response headers or body). */
  credits?: { charged: number | null; remaining: number | null }
}

/** Wriai's OpenAI-compatible AI endpoint (see docs/wriai-ai-api.md). Paid in Wriai credits. */
export const WRIAI_API_BASE = 'https://wriai.com/api/v1/ai'
export const WRIAI_MODEL = 'wriai-auto'

export function wriaiGateway(apiKey: string, base = WRIAI_API_BASE): AiGateway {
  return { name: 'wriai', url: base, key: apiKey.trim(), models: [WRIAI_MODEL] }
}

export function parseModelList(value: string | undefined, fallback: string[] = []): string[] {
  if (!value || !value.trim()) return fallback
  const list = value.split(/[|,]/).map((m) => m.trim()).filter(Boolean)
  return list.length ? list : fallback
}

export function usesMaxCompletionTokens(model: string): boolean {
  const name = model.trim().split('/').pop() || ''
  return /^gpt-(?:[5-9]|\d{2,})(?:[.-]|$)|^o\d+(?:[.-]|$)/i.test(name)
}

/** Build gateways from env-style variables (OPENAI_* primary, OPENAI_*_BK_1 fallback). */
export function gatewaysFromEnv(env: Record<string, string | undefined>): AiGateway[] {
  const out: AiGateway[] = []
  const defaults = ['gpt-4.1-mini', 'gpt-4o-mini']
  if (env.OPENAI_API_KEY?.trim()) {
    out.push({
      name: 'primary',
      url: env.OPENAI_END_POINT || 'https://api.openai.com/v1',
      key: env.OPENAI_API_KEY.trim(),
      models: parseModelList(env.OPENAI_TEXT_MODEL, defaults)
    })
  }
  if (env.OPENAI_API_KEY_BK_1?.trim()) {
    out.push({
      name: 'backup-1',
      url: env.OPENAI_END_POINT_BK_1 || 'https://api.openai.com/v1',
      key: env.OPENAI_API_KEY_BK_1.trim(),
      models: parseModelList(env.OPENAI_TEXT_MODEL_BK_1, parseModelList(env.OPENAI_TEXT_MODEL, defaults))
    })
  }
  return out
}

class HttpError extends Error {
  constructor(public status: number, public detail: string, public retryAfterMs: number | null = null) {
    super(`HTTP ${status}: ${detail.slice(0, 300)}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function postChat(gw: AiGateway, payload: Record<string, unknown>, timeoutMs: number): Promise<{ content: string; credits?: ChatResult['credits'] }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${gw.url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gw.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = text
      try {
        detail = JSON.parse(text)?.error?.message || text
      } catch {
        // A web page instead of JSON: the URL is not an API endpoint (wrong base URL, or not deployed yet).
        if (/^\s*</.test(text)) detail = `no API endpoint at ${gw.url.replace(/\/$/, '')}/chat/completions (the server returned a web page)`
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      throw new HttpError(res.status, detail, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null)
    }
    const json = JSON.parse(text)
    const msg = json?.choices?.[0]?.message
    const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
    const charged = num(res.headers.get('x-wriai-credits-charged') ?? json?.wriai?.credits_charged)
    const remaining = num(res.headers.get('x-wriai-credits-remaining') ?? json?.wriai?.credits_remaining)
    return {
      content: (msg?.content || msg?.reasoning_content || '').toString(),
      credits: charged !== null || remaining !== null ? { charged, remaining } : undefined
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`timeout after ${timeoutMs}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function relaxParams(payload: Record<string, any>, detail: string, maxTokens: number): boolean {
  const msg = detail.toLowerCase()
  let changed = false
  if (msg.includes('response_format') && 'response_format' in payload) {
    delete payload.response_format
    changed = true
  }
  if (msg.includes('max_completion_tokens') && 'max_completion_tokens' in payload) {
    delete payload.max_completion_tokens
    payload.max_tokens = maxTokens
    changed = true
  } else if (msg.includes('max_tokens') && 'max_tokens' in payload) {
    delete payload.max_tokens
    payload.max_completion_tokens = maxTokens
    changed = true
  }
  if (msg.includes('temperature') && 'temperature' in payload) {
    delete payload.temperature
    changed = true
  }
  return changed
}

export async function chat(gateways: AiGateway[], opts: ChatOptions): Promise<ChatResult> {
  if (!gateways.length) throw new Error('No AI gateway configured. Set OPENAI_API_KEY in .env or in Settings.')
  const maxTokens = opts.maxTokens ?? 4000
  const timeoutMs = opts.timeoutMs ?? 120000
  const errors: string[] = []

  for (const gw of gateways) {
    for (const model of gw.models) {
      const completionTokens = usesMaxCompletionTokens(model)
      const payload: Record<string, any> = {
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user }
        ],
        ...(completionTokens ? {} : { temperature: opts.temperature ?? 0.7 }),
        [completionTokens ? 'max_completion_tokens' : 'max_tokens']: maxTokens,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {})
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { content, credits } = await postChat(gw, payload, timeoutMs)
          if (content.trim().length > 0) return { content, model, gateway: gw.name, credits }
          errors.push(`${gw.name}/${model}: empty response`)
          break
        } catch (err) {
          if (err instanceof HttpError && err.status === 400 && relaxParams(payload, err.detail, maxTokens)) continue
          // Rate limited or a transient upstream failure: wait (Retry-After, capped at 20s) and retry the same model.
          if (err instanceof HttpError && (err.status === 429 || err.status === 502 || err.status === 503) && attempt < 2) {
            await sleep(Math.min(err.retryAfterMs ?? 2000 * (attempt + 1), 20000))
            continue
          }
          if (err instanceof HttpError && err.status === 402) {
            throw new Error(`Not enough credits on ${gw.name === 'wriai' ? 'your Wriai account (top up at https://wriai.com/dashboard/billing)' : gw.name}: ${err.detail.slice(0, 200)}`)
          }
          errors.push(`${gw.name}/${model}: ${err instanceof Error ? err.message : String(err)}`)
          if (err instanceof HttpError && err.status === 401) break
          break
        }
      }
      if (errors.at(-1)?.includes('HTTP 401')) break // bad key: skip the rest of this gateway
    }
  }
  throw new Error(`All AI gateways failed:\n${errors.slice(-4).join('\n')}`)
}

/** Extract a JSON object from a model reply (tolerates ```json fences and leading text). */
export function parseJsonReply<T>(content: string): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : content
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error(`AI reply did not contain a JSON object: ${content.trim().slice(0, 160) || '(empty reply)'}`)
  return JSON.parse(raw.slice(start, end + 1)) as T
}
