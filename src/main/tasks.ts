// Task actions shared by IPC handlers and the posting session.
import { clipboard } from 'electron'
import type { Page } from 'playwright-core'
import type { OpenResult, PlacedLink, Task } from '@shared/types'
import { contentRepo, linkRepo, projectRepo, siteRepo, taskRepo } from './repo'
import { getBravePath, profileDir } from './config'
import { browserName, openForPosting, openInNormalWindow } from './browser'
import { bridgeStatus, setHandoff } from './bridge'

export function requireBrave(): string {
  const p = getBravePath()
  if (!p) throw new Error('No browser found. Install Brave (recommended), Chrome or Edge, or set the browser path in Settings.')
  return p
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
}

/** What gets filled into a task's submit page: shared by the automated browser and the browser extension. */
export interface PostPayload {
  task: Task
  siteName: string
  siteFormat: string
  url: string
  title: string
  body: string
  website: string
  logo: string
  images: string[]
  hasContent: boolean
}

export function postPayload(taskId: number): PostPayload {
  const task = taskRepo.get(taskId)
  if (!task) throw new Error('Task not found')
  const site = siteRepo.get(task.siteId)
  if (!site) throw new Error('Site not found')
  const content = (task.contentId ? contentRepo.get(task.contentId) : undefined) ?? contentRepo.latestFor(task.projectId, task.siteId)
  if (content && task.contentId !== content.id) taskRepo.update({ id: task.id, contentId: content.id })
  const project = projectRepo.get(task.projectId)
  return {
    task,
    siteName: site.name,
    siteFormat: site.format,
    url: site.submitUrl || site.url,
    website: content?.linkUrl || project?.targets?.[0]?.url || (project?.domain ? `https://${project.domain}` : ''),
    // No AI content yet: fall back to the brand profile (fits directory/listing forms).
    title: content?.title ?? project?.name ?? '',
    body: content
      ? site.format === 'markdown' || site.format === 'html'
        ? content.body
        : stripMarkdown(content.body)
      : project?.shortDescription || project?.tagline || '',
    logo: project?.logoPath || '',
    images: project?.images ?? [],
    hasContent: !!content
  }
}

/**
 * Open the task's submit page in a normal (not automated) browser window, for sites whose bot checks
 * (Cloudflare and the like) block the automated one. The Backlink Launchpad extension in that window fills the form.
 */
export async function openTaskManual(taskId: number): Promise<{ message: string }> {
  const p = postPayload(taskId)
  if (p.hasContent) clipboard.writeText(p.body)
  await openInNormalWindow(requireBrave(), profileDir(), p.url)
  taskRepo.update({ id: p.task.id, status: p.task.status === 'queued' ? 'opened' : p.task.status })
  setHandoff(p.task.id)
  // No message normally (the page and its panel speak for themselves); only Chrome without the extension needs a hint.
  const chromeSetup = browserName(getBravePath()) === 'Chrome' && !bridgeStatus().extensionSeenAt
  return {
    message: chromeSetup ? 'Chrome needs the Backlink Launchpad extension added once: see Settings, Browser extension. Until then, paste the body from your clipboard.' : ''
  }
}

/** Open the task's submit page in the browser and pre-fill it. Never submits. */
export async function openTask(taskId: number): Promise<OpenResult & { page: Page }> {
  const p = postPayload(taskId)
  const task = p.task
  let copied = false
  if (p.hasContent) {
    clipboard.writeText(p.body)
    copied = true
  }
  const { page, ...filled } = await openForPosting({
    logo: p.logo,
    images: p.images,
    browserPath: requireBrave(),
    profileDir: profileDir(),
    url: p.url,
    website: p.website,
    title: p.title,
    body: p.body
  })
  setHandoff(task.id)
  taskRepo.update({ id: task.id, status: task.status === 'queued' ? 'opened' : task.status })
  const parts = [
    filled.title ? 'title filled' : 'title not detected',
    filled.body ? 'body filled' : 'body not detected',
    ...(filled.website ? ['website URL filled'] : []),
    ...(filled.files ? [`${filled.files} image field(s) attached`] : []),
    copied ? 'body copied to clipboard' : 'no AI content yet, used the project name and short description'
  ]
  return {
    page,
    filled,
    copiedToClipboard: copied,
    message: `${parts.join(', ')}. Review in ${browserName(getBravePath())}, sign in or solve any CAPTCHA yourself, then submit manually.`
  }
}

/** Record the live post URL: task -> posted, content -> used, link tracked in the monitor. */
export function markPosted(taskId: number, postUrl: string): { task: Task; link: PlacedLink } {
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
}

/** Revert an (auto-detected) posting: task back to opened, tracked link removed. */
export function undoPosted(taskId: number, linkId: number): Task {
  const task = taskRepo.get(taskId)
  if (!task) throw new Error('Task not found')
  const link = linkRepo.get(linkId)
  if (link && link.taskId === taskId) linkRepo.delete(linkId)
  if (task.contentId) contentRepo.update({ id: task.contentId, status: 'ready' })
  return taskRepo.update({ id: taskId, status: 'opened', postUrl: '', postedAt: null })
}
