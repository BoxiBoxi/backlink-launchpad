// Task actions shared by IPC handlers and the posting session.
import { clipboard } from 'electron'
import type { Page } from 'playwright-core'
import type { OpenResult, PlacedLink, Task } from '@shared/types'
import { contentRepo, linkRepo, projectRepo, siteRepo, taskRepo } from './repo'
import { getBravePath, profileDir } from './config'
import { openForPosting } from './browser'

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

/** Open the task's submit page in Brave and pre-fill it. Never submits. */
export async function openTask(taskId: number): Promise<OpenResult & { page: Page }> {
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
  const project = projectRepo.get(task.projectId)
  const { page, ...filled } = await openForPosting({
    logo: project?.logoPath || '',
    images: project?.images ?? [],
    bravePath: requireBrave(),
    profileDir: profileDir(),
    url: site.submitUrl || site.url,
    website: content?.linkUrl || project?.targets?.[0]?.url || (project?.domain ? `https://${project.domain}` : ''),
    // No AI content yet: fall back to the brand profile (fits directory/listing forms).
    title: content?.title ?? project?.name ?? '',
    body: content
      ? site.format === 'markdown' || site.format === 'html'
        ? content.body
        : stripMarkdown(content.body)
      : project?.shortDescription || project?.tagline || ''
  })
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
    message: `${parts.join(', ')}. Review in Brave, sign in or solve any CAPTCHA yourself, then submit manually.`
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
