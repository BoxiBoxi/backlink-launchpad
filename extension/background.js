// Talks to the Backlink Launchpad app on 127.0.0.1. The port and token come from config.json, which the app
// writes when it copies this extension into its data folder. Content scripts cannot reach the app themselves.

// Stamped by the app when it installs the extension. The page script sends its own stamp: if they differ, this
// service worker is an older copy still running after an update, so it reloads the extension.
const BUILD = '__BB_BUILD__'
const UPDATED = 'Backlink Launchpad was just updated. Reload this page (F5) and click again.'

let configPromise = null
function config() {
  if (!configPromise) {
    configPromise = fetch(chrome.runtime.getURL('config.json'))
      .then((r) => r.json())
      .catch(() => null)
  }
  return configPromise
}

async function call(path, init = {}) {
  const cfg = await config()
  if (!cfg || !cfg.port) throw new Error('This copy of the extension was not set up by the Backlink Launchpad app.')
  let res
  try {
    res = await fetch(`http://127.0.0.1:${cfg.port}${path}`, {
      ...init,
      headers: { 'x-bb-token': cfg.token, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) }
    })
  } catch {
    throw new Error('Backlink Launchpad is not running. Open the app and try again.')
  }
  return res
}

async function json(path, init) {
  const res = await call(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function file(taskId, which) {
  const res = await call(`/v1/file?task=${encodeURIComponent(taskId)}&i=${encodeURIComponent(which)}`)
  if (!res.ok) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
  return { base64: btoa(bin), type: res.headers.get('content-type') || 'image/png', name: decodeURIComponent(res.headers.get('x-file-name') || 'image.png') }
}

/** CodeMirror 5 editors keep their text in page JavaScript, out of reach of the content script's isolated world. */
async function setCodeMirror(tabId, frameId, text) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    world: 'MAIN',
    args: [text],
    func: (value) => {
      const el = document.querySelector('.CodeMirror')
      if (!el || !el.CodeMirror) return false
      el.CodeMirror.setValue(value)
      return true
    }
  })
  return !!(r && r.result)
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.build !== BUILD) {
    reply({ ok: false, error: UPDATED })
    setTimeout(() => chrome.runtime.reload(), 100)
    return false
  }
  const run = async () => {
    switch (msg.type) {
      case 'hello':
        return json('/v1/hello')
      case 'match':
        return json(`/v1/match?url=${encodeURIComponent(msg.url)}`)
      case 'file':
        return file(msg.taskId, msg.which)
      case 'credentials':
        return json('/v1/credentials', { method: 'POST', body: JSON.stringify({ url: msg.url, mode: msg.mode }) })
      case 'learn':
        return json('/v1/memory', { method: 'POST', body: JSON.stringify({ url: msg.url, projectId: msg.projectId, items: msg.items }) })
      case 'posted':
        return json('/v1/posted', { method: 'POST', body: JSON.stringify({ taskId: msg.taskId, url: msg.url }) })
      case 'codemirror':
        return setCodeMirror(sender.tab.id, sender.frameId || 0, msg.text)
      default:
        throw new Error('unknown message')
    }
  }
  run().then(
    (data) => reply({ ok: true, data }),
    (err) => reply({ ok: false, error: err instanceof Error ? err.message : String(err) })
  )
  return true // async reply
})

// Let the app know the extension is installed and connected.
chrome.runtime.onStartup.addListener(() => void json('/v1/hello').catch(() => undefined))
chrome.runtime.onInstalled.addListener(() => void json('/v1/hello').catch(() => undefined))
