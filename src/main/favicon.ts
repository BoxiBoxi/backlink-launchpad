// bb-favicon://icon?d=<domain> -> the site's favicon, fetched once and cached in <data>/favicons.
// Source: Google's public favicon service (only the catalog site's domain is sent, no user data).
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const inflight = new Map<string, Promise<Buffer | null>>()

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'favicons')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function load(domain: string): Promise<Buffer | null> {
  const dir = cacheDir()
  const file = join(dir, `${domain}.png`)
  const miss = join(dir, `${domain}.none`)
  if (existsSync(file)) return readFileSync(file)
  if (existsSync(miss)) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      writeFileSync(miss, '')
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(file, buf)
    return buf
  } catch {
    return null // network error: try again next time
  }
}

export async function handleFavicon(req: Request): Promise<Response> {
  const domain = (new URL(req.url).searchParams.get('d') || '').toLowerCase().replace(/^www\./, '')
  if (!/^[a-z0-9.-]{1,253}$/.test(domain)) return new Response('Bad domain', { status: 400 })
  let p = inflight.get(domain)
  if (!p) {
    p = load(domain).finally(() => inflight.delete(domain))
    inflight.set(domain, p)
  }
  const buf = await p
  if (!buf) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=604800' } })
}
