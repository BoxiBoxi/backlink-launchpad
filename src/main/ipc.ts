import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { Api, Channel, OpenResult } from '@shared/types'
import { chat } from '@core/ai'
import { generateContent } from '@core/contentGen'
import { contentRepo, linkRepo, projectRepo, settingsRepo, siteRepo, taskRepo } from './repo'
import { aiGateways, aiProvider, aiTimeoutMs, getBravePath, getSettings, profileDir, saveSettings } from './config'
import { browserName, closePostingBrowser, currentPostingUrl, isPostingBrowserRunning, openProfileForLogin } from './browser'
import { markPosted, openTask, requireBrave, undoPosted } from './tasks'
import { nextInSession, onTaskPostedManually, sessionStatus, startSession, stopSession } from './session'
import { exportContentPdf } from './pdf'
import { scanDr } from './drScan'
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

export function registerIpc(getWindow: () => BrowserWindow | null) {
  // sites
  handle('sites:list', () => siteRepo.list())
  handle('sites:save', (input) => siteRepo.save(input))
  handle('sites:delete', (id) => void siteRepo.delete(id))
  handle('sites:check', (ids) => checkSites(ids))
  handle('sites:fetchDr', ({ ids, force }) => scanDr(ids, force))

  // projects
  handle('projects:list', () => projectRepo.list())
  handle('projects:save', (input) => {
    if (!input.name.trim()) throw new Error('Project name is required')
    return projectRepo.save(input)
  })
  handle('projects:delete', (id) => void projectRepo.delete(id))
  handle('projects:stats', () => projectRepo.stats())
  handle('projects:pickImages', async () => {
    const win = getWindow()
    const opts = { properties: ['openFile' as const, 'multiSelections' as const], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? [] : res.filePaths
  })
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
    const saved = contentRepo.insert({
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
    return { ...saved, creditsRemaining: gen.credits?.remaining ?? undefined }
  })
  handle('content:save', (c) => contentRepo.update(c))
  handle('content:delete', (id) => void contentRepo.delete(id))
  handle('content:exportPdf', async ({ contentId, bodyHtml, includeImages }) => {
    const content = contentRepo.get(contentId)
    if (!content) throw new Error('Content not found')
    const project = projectRepo.get(content.projectId)
    if (!project) throw new Error('Project not found')
    return exportContentPdf(getWindow(), content, project, bodyHtml, includeImages)
  })

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
  handle('tasks:clear', ({ projectId, statuses }) => {
    const st = sessionStatus()
    if (st.active && st.projectId === projectId && statuses.some((s) => s === 'queued' || s === 'opened')) {
      throw new Error('Stop the posting session before clearing tasks that are still to do.')
    }
    const doomed = taskRepo.list(projectId).filter((t) => statuses.includes(t.status))
    for (const t of doomed) taskRepo.delete(t.id) // placed_links.task_id is ON DELETE SET NULL: links are kept
    return doomed.length
  })
  handle('tasks:open', async (taskId): Promise<OpenResult> => {
    const { page: _page, ...result } = await openTask(taskId)
    return result
  })
  handle('tasks:readCurrentUrl', () => currentPostingUrl())
  handle('tasks:markPosted', ({ taskId, postUrl }) => {
    const res = markPosted(taskId, postUrl)
    onTaskPostedManually(taskId)
    return res
  })
  handle('tasks:undoPosted', ({ taskId, linkId }) => undoPosted(taskId, linkId))

  // posting session
  handle('session:start', (projectId) => startSession(projectId))
  handle('session:next', () => nextInSession())
  handle('session:stop', () => stopSession())
  handle('session:status', () => sessionStatus())

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
  handle('setup:status', () => {
    const browserPath = getBravePath()
    return {
      done: settingsRepo.get('setupDone') === '1',
      hasProjects: projectRepo.list().length > 0,
      platform: process.platform,
      browserPath,
      browserName: browserName(browserPath),
      aiReady: aiGateways().length > 0
    }
  })
  handle('setup:complete', () => void settingsRepo.set('setupDone', '1'))
  handle('settings:get', () => getSettings())
  handle('settings:save', (input) => saveSettings(input))
  handle('ai:test', async () => {
    try {
      const gws = aiGateways()
      if (!gws.length) {
        return { ok: false, message: aiProvider() === 'wriai' ? 'Add your Wriai API key first.' : 'No OpenAI-compatible key configured.' }
      }
      const r = await chat(gws, { system: 'Reply with the single word OK.', user: 'ping', maxTokens: 200, timeoutMs: 60000 })
      const left = r.credits?.remaining
      return {
        ok: true,
        model: r.model,
        creditsRemaining: left,
        message: `Connected via ${r.gateway} (${r.model})${typeof left === 'number' ? ` · ${left.toLocaleString()} credits left` : ''}`
      }
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
