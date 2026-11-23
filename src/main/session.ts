// Posting session: walks the project's open tasks in priority order.
// For each task it opens the submit page (pre-filled), then watches the Brave tabs. When the user has submitted and
// the browser lands on the live post URL, the session saves it and opens the next task.
// The user still reviews, signs in, solves CAPTCHAs and clicks submit: the session never submits anything.
import type { SessionStatus } from '@shared/types'
import { looksLikePostUrl } from '@core/postDetect'
import { siteRepo, taskRepo } from './repo'
import { postingContext } from './browser'
import { markPosted, openTask } from './tasks'
import { emit } from './events'

const POLL_MS = 1500
const NEXT_DELAY_MS = 2500

interface State {
  active: boolean
  projectId: number | null
  queue: number[]
  index: number
  posted: number
  currentTaskId: number | null
  baseline: Set<string>
  timer: ReturnType<typeof setInterval> | null
  checking: boolean
  message: string
}

const s: State = {
  active: false,
  projectId: null,
  queue: [],
  index: 0,
  posted: 0,
  currentTaskId: null,
  baseline: new Set(),
  timer: null,
  checking: false,
  message: ''
}

export function sessionStatus(): SessionStatus {
  const task = s.currentTaskId ? taskRepo.get(s.currentTaskId) : undefined
  const site = task ? siteRepo.get(task.siteId) : undefined
  return {
    active: s.active,
    projectId: s.projectId,
    currentTaskId: s.currentTaskId,
    currentSiteName: site?.name ?? '',
    position: s.currentTaskId ? s.queue.indexOf(s.currentTaskId) + 1 : Math.min(s.index + 1, s.queue.length),
    total: s.queue.length,
    posted: s.posted,
    message: s.message
  }
}

function publish() {
  emit({ type: 'session', status: sessionStatus() })
}

function stopWatching() {
  if (s.timer) clearInterval(s.timer)
  s.timer = null
}

function openUrls(): string[] {
  const ctx = postingContext()
  return ctx ? ctx.pages().filter((p) => !p.isClosed()).map((p) => p.url()) : []
}

async function openCurrent(): Promise<void> {
  stopWatching()
  while (s.active && s.index < s.queue.length) {
    const task = taskRepo.get(s.queue[s.index])
    if (!task || task.status === 'posted' || task.status === 'skipped') {
      s.index++
      continue
    }
    s.currentTaskId = task.id
    s.message = 'Opening the submit page...'
    publish()
    try {
      const res = await openTask(task.id)
      s.baseline = new Set(openUrls()) // URLs present right after opening never count as "posted"
      s.message = `${res.message} Watching for the published URL.`
      publish()
      s.timer = setInterval(() => void check(), POLL_MS)
      return
    } catch (err) {
      s.message = `Could not open this site: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`
      s.active = false
      publish()
      return
    }
  }
  if (s.active) finish(`Session finished: ${s.posted} posted.`)
}

function finish(message: string) {
  stopWatching()
  s.active = false
  s.currentTaskId = null
  s.message = message
  publish()
}

async function check(): Promise<void> {
  if (!s.active || s.checking || !s.currentTaskId) return
  s.checking = true
  try {
    const ctx = postingContext()
    if (!ctx) return finish('Brave was closed. Session stopped.')
    const task = taskRepo.get(s.currentTaskId)
    const site = task ? siteRepo.get(task.siteId) : undefined
    if (!task || !site || task.status === 'posted') return // manual "Posted" is handled by onTaskPostedManually
    const pages = ctx.pages().filter((p) => !p.isClosed()).reverse()
    for (const page of pages) {
      const url = page.url()
      if (s.baseline.has(url)) continue
      if (looksLikePostUrl({ url, siteUrl: site.url, submitUrl: site.submitUrl || site.url })) {
        const { link } = markPosted(task.id, url)
        s.posted++
        emit({ type: 'autoPosted', taskId: task.id, linkId: link.id, siteName: site.name, url })
        return advance()
      }
    }
  } catch (err) {
    console.warn('[session] check failed', err)
  } finally {
    s.checking = false
  }
}

function advance() {
  stopWatching()
  s.index++
  s.message = s.index < s.queue.length ? 'Saved. Opening the next site...' : 'Saved.'
  publish()
  setTimeout(() => void openCurrent(), NEXT_DELAY_MS)
}

export async function startSession(projectId: number): Promise<SessionStatus> {
  const priority = new Map(siteRepo.list().map((site) => [site.id, site.priority]))
  const queue = taskRepo
    .list(projectId)
    .filter((t) => t.status === 'queued' || t.status === 'opened')
    .sort((a, b) => (priority.get(b.siteId) ?? 0) - (priority.get(a.siteId) ?? 0))
    .map((t) => t.id)
  if (!queue.length) throw new Error('No queued tasks for this project. Add sites to the queue first.')
  stopWatching()
  Object.assign(s, { active: true, projectId, queue, index: 0, posted: 0, currentTaskId: null, message: '' })
  await openCurrent()
  return sessionStatus()
}

/** Leave the current task as "opened" and move on. */
export async function nextInSession(): Promise<SessionStatus> {
  if (!s.active) throw new Error('No active session')
  stopWatching()
  s.index++
  await openCurrent()
  return sessionStatus()
}

export function stopSession(): SessionStatus {
  if (s.active) finish(`Session stopped: ${s.posted} posted.`)
  return sessionStatus()
}

/** Called when a task is marked posted from the app while a session is running. */
export function onTaskPostedManually(taskId: number) {
  if (s.active && s.currentTaskId === taskId) {
    s.posted++
    advance()
  }
}
