import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { Api, Channel, OpenResult } from '@shared/types'
import { chat } from '@core/ai'
import { generateContent } from '@core/contentGen'
import { contentRepo, linkRepo, projectRepo, siteRepo, taskRepo } from './repo'
import { aiGateways, aiTimeoutMs, getBravePath, getSettings, profileDir, saveSettings } from './config'
import { closePostingBrowser, currentPostingUrl, isPostingBrowserRunning, openForPosting, openProfileForLogin } from './browser'
import { checkLinks, checkSites } from './checker'

type Handler<C extends Channel> = (...args: Api[C][0]) => Promise<Api[C][1]> | Api[C][1]

function handle<C extends Channel>(channel: C, fn: Handler<C>) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...(args as Api[C][0])) }
    } catch (err) {
      console.error(`[ipc] ${channel} failed`, err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

function requireBrave(): string {
  const p = getBravePath()
  if (!p) throw new Error('Brave was not found. Install Brave or set its path in Settings.')
  return p
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
}

export function registerIpc(getWindow: () => BrowserWindow | null) {
  // sites
  handle('sites:list', () => siteRepo.list())
  handle('sites:save', (input) => siteRepo.save(input))
  handle('sites:delete', (id) => void siteRepo.delete(id))
  handle('sites:check', (ids) => checkSites(ids))

  // projects
  handle('projects:list', () => projectRepo.list())
  handle('projects:save', (input) => {
    if (!input.name.trim()) throw new Error('Project name is required')
    return projectRepo.save(input)
  })
  handle('projects:delete', (id) => void projectRepo.delete(id))
  handle('projects:stats', () => projectRepo.stats())
  handle('projects:pickLogo', async () => {
    const win = getWindow()
    const opts = { properties: ['openFile' as const], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : res.filePaths[0]
  })

  // content
  handle('content:list', (projectId) => contentRepo.list(projectId))
  handle('content:generate', async ({ projectId, siteId, linkUrl, anchor, extra }) => {
    const project = projectRepo.get(projectId)
    const site = siteRepo.get(siteId)
    if (!project || !site) throw new Error('Project or site not found')
    const target = project.targets[0]
    const url = linkUrl || target?.url || (project.domain ? `https://${project.domain.replace(/^https?:\/\//, '')}` : '')
    if (!url) throw new Error('Add a target URL to the project first')
    const anchorText = anchor ?? target?.anchors[Math.floor(Math.random() * Math.max(1, target.anchors.length))] ?? project.name
    const gen = await generateContent(aiGateways(), { project, site, linkUrl: url, anchor: anchorText || project.name, extra }, aiTimeoutMs())
    return contentRepo.insert({
      projectId,
      siteId,
      title: gen.title,
      body: gen.body,
      tags: gen.tags,
      linkUrl: url,
      anchor: anchorText || project.name,
      model: gen.model,
      status: 'draft'
    })
  })
  handle('content:save', (c) => contentRepo.update(c))
  handle('content:delete', (id) => void contentRepo.delete(id))

  // tasks
  handle('tasks:list', (projectId) => taskRepo.list(projectId))
  handle('tasks:create', ({ projectId, siteIds }) => {
    const existing = taskRepo.list(projectId)
    return siteIds
      .filter((sid) => !existing.some((t) => t.siteId === sid && t.status !== 'skipped'))
      .map((siteId) => taskRepo.insert({ projectId, siteId, contentId: contentRepo.latestFor(projectId, siteId)?.id ?? null }))
  })
  handle('tasks:update', (t) => taskRepo.update(t))
  handle('tasks:delete', (id) => void taskRepo.delete(id))
  handle('tasks:open', async (taskId): Promise<OpenResult> => {
    const task = taskRepo.get(taskId)
    if (!task) throw new Error('Task not found')
    const site = siteRepo.get(task.siteId)
    if (!site) throw new Error('Site not found')
    const content = (task.contentId ? contentRepo.get(task.contentId) : undefined) ?? contentRepo.latestFor(task.projectId, task.siteId)
    if (content && task.contentId !== content.id) taskRepo.update({ id: task.id, contentId: content.id })

    let copied = false
    if (content) {
      clipboard.writeText(content.body)
      copied = true
    }
    const filled = await openForPosting({
      bravePath: requireBrave(),
      profileDir: profileDir(),
      url: site.submitUrl || site.url,
      title: content?.title ?? '',
      body: content ? (site.format === 'markdown' || site.format === 'html' ? content.body : stripMarkdown(content.body)) : ''
    })
    taskRepo.update({ id: task.id, status: task.status === 'queued' ? 'opened' : task.status })
    const parts = [
      filled.title ? 'title filled' : 'title not detected',
      filled.body ? 'body filled' : 'body not detected',
      copied ? 'body copied to clipboard' : 'no content yet (generate it first)'
    ]
    return {
      filled,
      copiedToClipboard: copied,
      message: `${parts.join(', ')}. Review in Brave, sign in or solve any CAPTCHA yourself, then submit manually.`
    }
  })
  handle('tasks:readCurrentUrl', () => currentPostingUrl())
  handle('tasks:markPosted', ({ taskId, postUrl }) => {
    const task = taskRepo.get(taskId)
    if (!task) throw new Error('Task not found')
    try {
      new URL(postUrl)
    } catch {
      throw new Error('Enter a valid post URL (https://...)')
    }
    const content = task.contentId ? contentRepo.get(task.contentId) : undefined
    const project = projectRepo.get(task.projectId)!
    const updated = taskRepo.update({ id: taskId, status: 'posted', postUrl, postedAt: new Date().toISOString() })
    if (content) contentRepo.update({ id: content.id, status: 'used' })
    const link = linkRepo.insert({
      projectId: task.projectId,
      siteId: task.siteId,
      taskId,
      pageUrl: postUrl,
      targetUrl: content?.linkUrl || project.targets[0]?.url || `https://${project.domain}`,
      expectedAnchor: content?.anchor || ''
    })
    return { task: updated, link }
  })

  // links
  handle('links:list', (projectId) => linkRepo.list(projectId))
  handle('links:add', (l) => {
    new URL(l.pageUrl)
    new URL(l.targetUrl)
    return linkRepo.insert({ ...l, taskId: null })
  })
  handle('links:delete', (id) => void linkRepo.delete(id))
  handle('links:check', (ids) => checkLinks(ids))

  // browser
  handle('browser:openProfile', (url) => openProfileForLogin(requireBrave(), profileDir(), url))
  handle('browser:close', () => closePostingBrowser())
  handle('browser:status', () => ({ bravePath: getBravePath(), running: isPostingBrowserRunning() }))

  // settings & misc
  handle('settings:get', () => getSettings())
  handle('settings:save', (input) => saveSettings(input))
  handle('ai:test', async () => {
    try {
      const r = await chat(aiGateways(), { system: 'Reply with the single word OK.', user: 'ping', maxTokens: 200, timeoutMs: 60000 })
      return { ok: true, model: r.model, message: `Connected via ${r.gateway} (${r.model})` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })
  handle('clipboard:write', (text) => clipboard.writeText(text))
  handle('shell:openExternal', async (url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs can be opened')
    await shell.openExternal(url)
  })
}
