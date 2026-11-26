// Builds prompts for one (project, target site) pair and parses the AI reply.
// Pure logic: no database, no Electron.

import type { Project, Site } from '@shared/types'
import { chat, parseJsonReply, type AiGateway } from './ai'

export interface GenerateInput {
  project: Project
  site: Site
  linkUrl: string
  anchor: string
  extra?: string
}

export interface GeneratedContent {
  title: string
  body: string
  tags: string[]
  model: string
  credits?: { charged: number | null; remaining: number | null }
}

const TYPE_GUIDE: Record<Site['type'], string> = {
  directory:
    'This is a tool/startup directory listing. Write a factual product listing: what it does, who it is for, key features as a short list, pricing hint if known. No hype words, no superlatives.',
  launch:
    'This is a product launch platform. Write a launch post: the problem, what was built, what makes it different, an honest ask for feedback.',
  ugc_blog:
    'This is a user-generated blog platform. Write a genuinely useful article (tutorial, guide or lessons learned) where the product is mentioned once, naturally, as one option among the advice. At least 80% of the text must be useful without the product.',
  community:
    'This is a community discussion site. Write a value-first post: share an experience, insight or practical tips. Mention the product at most once, transparently (e.g. "disclosure: I build X"). No sales tone.',
  forum:
    'This is a forum thread. Write a helpful discussion post that invites replies. Mention the product at most once with disclosure. No sales tone.',
  qa: 'This is a Q&A site. Write a helpful answer to a realistic question your audience asks (include the question as the title). The product may be mentioned once, with disclosure, only where it truly answers part of the question.'
}

const LANG_NAME: Record<Site['language'], string> = { en: 'English', vi: 'Vietnamese (tiếng Việt, tự nhiên, không dịch máy)' }

function defaultMaxLength(site: Site): number {
  if (site.maxLength) return site.maxLength
  switch (site.type) {
    case 'directory':
      return 900
    case 'qa':
    case 'forum':
      return 1500
    case 'community':
    case 'launch':
      return 2000
    default:
      return 6000
  }
}

export function buildPrompts(input: GenerateInput): { system: string; user: string } {
  const { project, site, linkUrl, anchor, extra } = input
  const maxLen = defaultMaxLength(site)
  const formatHint =
    site.format === 'markdown'
      ? 'Write the body in Markdown. Put the link as [anchor](url).'
      : site.format === 'html'
        ? 'Write the body as simple HTML (<p>, <ul>, <li>, <h2>, <a>).'
        : 'Write the body as plain text with blank lines between paragraphs. Write the link as the bare URL right after the anchor phrase.'

  const system = [
    'You write promotional content that real communities accept. You never write spam.',
    'Rules: value first; at most ONE link to the product unless the site rules say otherwise; no keyword stuffing; no fake reviews or fake testimonials; no invented numbers, customers or awards; no emojis; honest disclosure when the author is the maker.',
    'Reply with a single JSON object: {"title": string, "body": string, "tags": string[]} and nothing else.'
  ].join('\n')

  const user = [
    `TARGET SITE: ${site.name} (${site.url})`,
    `Site type: ${site.type}. ${TYPE_GUIDE[site.type]}`,
    `Language: ${LANG_NAME[site.language]}. The whole title and body must be in this language.`,
    `Maximum body length: about ${maxLen} characters.`,
    formatHint,
    site.rules ? `Site link rules / notes: ${site.rules}` : '',
    site.topics.length ? `Site topics: ${site.topics.join(', ')}` : '',
    '',
    `PRODUCT: ${project.name} (${project.domain})`,
    project.tagline ? `Tagline: ${project.tagline}` : '',
    project.shortDescription ? `Short description: ${project.shortDescription}` : '',
    project.longDescription ? `Long description: ${project.longDescription}` : '',
    project.topics.length ? `Product topics: ${project.topics.join(', ')}` : '',
    '',
    `LINK TO INCLUDE (once): ${linkUrl}`,
    anchor ? `Preferred anchor text: "${anchor}" (adapt grammatically if needed; for directories the anchor may be the product name).` : '',
    extra ? `\nExtra instructions from the user: ${extra}` : '',
    '',
    'Tags: 3 to 5 short topic tags suitable for this site (no # sign).',
    'Make the post unique: do not reuse generic marketing sentences.'
  ]
    .filter((l) => l !== '')
    .join('\n')

  return { system, user }
}

export async function generateContent(gateways: AiGateway[], input: GenerateInput, timeoutMs?: number): Promise<GeneratedContent> {
  const { system, user } = buildPrompts(input)
  type Reply = { title?: string; body?: string; tags?: unknown }
  // Models occasionally ignore the JSON format; one retry fixes it almost always.
  let res = await chat(gateways, { system, user, json: true, maxTokens: 8000, temperature: 0.8, timeoutMs })
  let parsed: Reply
  try {
    parsed = parseJsonReply<Reply>(res.content)
    if (!parsed.body || typeof parsed.body !== 'string') throw new Error('AI reply had no body')
  } catch {
    res = await chat(gateways, { system, user: `${user}\n\nReturn ONLY the JSON object, nothing else.`, json: true, maxTokens: 8000, temperature: 0.7, timeoutMs })
    parsed = parseJsonReply<Reply>(res.content)
  }
  if (!parsed.body || typeof parsed.body !== 'string') throw new Error('AI reply had no body')
  return {
    title: String(parsed.title || '').trim(),
    body: parsed.body.trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [],
    model: res.model,
    credits: res.credits
  }
}
