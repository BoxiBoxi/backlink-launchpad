// Initial site catalog. Link types are "unknown" until checked on a real placed link;
// DR is left empty (enter it manually from Ahrefs/Semrush). Submit URLs can change: the
// site checker marks dead ones, and everything is editable in the Catalog screen.

import type { SiteInput } from '@shared/types'
import { EXTRA_SEEDS } from './catalogExtra'

export type SeedSite = Pick<SiteInput, 'name' | 'url' | 'submitUrl' | 'type' | 'language' | 'topics' | 'format' | 'rules'> &
  Partial<Pick<SiteInput, 'needsReview' | 'maxLength' | 'notes'>>

const seeds: SeedSite[] = [
  // AI / SaaS directories
  { name: "There's An AI For That", url: 'https://theresanaiforthat.com', submitUrl: 'https://theresanaiforthat.com/submit/', type: 'directory', language: 'en', topics: ['ai', 'tools'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Paid submission. Short factual description, one product URL field.' },
  { name: 'Futurepedia', url: 'https://www.futurepedia.io', submitUrl: 'https://www.futurepedia.io/submit-tool', type: 'directory', language: 'en', topics: ['ai', 'tools'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Paid/queued submission. Pick categories carefully.' },
  { name: 'Toolify', url: 'https://www.toolify.ai', submitUrl: 'https://www.toolify.ai/submit', type: 'directory', language: 'en', topics: ['ai', 'tools'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Free and paid tiers. Product URL plus description.' },
  { name: 'Future Tools', url: 'https://www.futuretools.io', submitUrl: 'https://www.futuretools.io/submit-a-tool', type: 'directory', language: 'en', topics: ['ai', 'tools'], format: 'plain', needsReview: true, maxLength: 500, rules: 'Manually curated; not every tool is accepted.' },
  { name: 'TopAI.tools', url: 'https://topai.tools', submitUrl: 'https://topai.tools/submit', type: 'directory', language: 'en', topics: ['ai', 'tools'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Directory listing with categories.' },
  { name: 'Easy With AI', url: 'https://easywithai.com', submitUrl: 'https://easywithai.com/submit-tool/', type: 'directory', language: 'en', topics: ['ai', 'tools'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Directory listing.' },
  { name: 'AlternativeTo', url: 'https://alternativeto.net', submitUrl: 'https://alternativeto.net/manage-item/', type: 'directory', language: 'en', topics: ['software', 'saas'], format: 'plain', needsReview: true, maxLength: 800, rules: 'Add as an alternative to well-known tools. Neutral tone; moderators remove marketing copy.' },
  { name: 'SaaSHub', url: 'https://www.saashub.com', submitUrl: 'https://www.saashub.com/submit', type: 'directory', language: 'en', topics: ['saas', 'software'], format: 'plain', needsReview: true, maxLength: 800, rules: 'Verified listings; list competitors/alternatives.' },
  { name: 'Launching Next', url: 'https://www.launchingnext.com', submitUrl: 'https://www.launchingnext.com/submit/', type: 'directory', language: 'en', topics: ['startups'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Startup directory, free queue.' },
  { name: 'Uneed', url: 'https://www.uneed.best', submitUrl: 'https://www.uneed.best/submit-a-tool', type: 'directory', language: 'en', topics: ['tools', 'saas'], format: 'plain', needsReview: true, maxLength: 600, rules: 'Daily launch queue for tools.' },
  { name: 'Crunchbase', url: 'https://www.crunchbase.com', submitUrl: 'https://www.crunchbase.com/add-new', type: 'directory', language: 'en', topics: ['company'], format: 'plain', needsReview: true, maxLength: 800, rules: 'Company profile. Factual only.' },

  // Launch platforms
  { name: 'Product Hunt', url: 'https://www.producthunt.com', submitUrl: 'https://www.producthunt.com/posts/new', type: 'launch', language: 'en', topics: ['launch', 'saas', 'ai'], format: 'plain', maxLength: 260, rules: 'Tagline 60 chars, description 260 chars. One launch per product; plan the date.' },
  { name: 'BetaList', url: 'https://betalist.com', submitUrl: 'https://betalist.com/submit', type: 'launch', language: 'en', topics: ['startups', 'launch'], format: 'plain', needsReview: true, maxLength: 500, rules: 'For pre-launch / early-stage products only.' },
  { name: 'DevHunt', url: 'https://devhunt.org', submitUrl: 'https://devhunt.org/', type: 'launch', language: 'en', topics: ['developer tools'], format: 'plain', needsReview: true, maxLength: 500, rules: 'Developer tools only. Login with GitHub.' },
  { name: 'Hacker News (Show HN)', url: 'https://news.ycombinator.com', submitUrl: 'https://news.ycombinator.com/submit', type: 'launch', language: 'en', topics: ['tech', 'startups'], format: 'plain', maxLength: 1500, rules: 'Title starts with "Show HN:". Plain, technical, no marketing. Author must answer comments.' },

  // UGC blogs
  { name: 'dev.to', url: 'https://dev.to', submitUrl: 'https://dev.to/new', type: 'ugc_blog', language: 'en', topics: ['programming', 'webdev', 'ai'], format: 'markdown', rules: 'Tutorials and dev stories. Max 4 tags. Self-promotion only inside genuinely useful posts.' },
  { name: 'Hashnode', url: 'https://hashnode.com', submitUrl: 'https://hashnode.com/draft', type: 'ugc_blog', language: 'en', topics: ['programming', 'webdev'], format: 'markdown', rules: 'Developer blog; can set canonical URL to the original article.' },
  { name: 'Medium', url: 'https://medium.com', submitUrl: 'https://medium.com/new-story', type: 'ugc_blog', language: 'en', topics: ['marketing', 'seo', 'ai', 'startups'], format: 'plain', rules: 'Long-form article. Use import tool for canonical if republishing.' },
  { name: 'LinkedIn Articles', url: 'https://www.linkedin.com', submitUrl: 'https://www.linkedin.com/article/new/', type: 'ugc_blog', language: 'en', topics: ['business', 'marketing'], format: 'plain', rules: 'Professional tone; post from the founder profile.' },
  { name: 'HubPages', url: 'https://hubpages.com', submitUrl: 'https://hubpages.com/', type: 'ugc_blog', language: 'en', topics: ['how-to', 'technology'], format: 'plain', needsReview: true, maxLength: 8000, rules: 'Editorial review; min ~700 words, original, few links, no affiliate-like promotion.' },
  { name: 'Tumblr', url: 'https://www.tumblr.com', submitUrl: 'https://www.tumblr.com/new/text', type: 'ugc_blog', language: 'en', topics: ['general'], format: 'plain', maxLength: 3000, rules: 'Short blog post with tags.' },
  { name: 'Telegraph', url: 'https://telegra.ph', submitUrl: 'https://telegra.ph/', type: 'ugc_blog', language: 'en', topics: ['general'], format: 'plain', maxLength: 4000, rules: 'Anonymous publishing, low authority; use sparingly.' },

  // Communities / Q&A (international)
  { name: 'Reddit', url: 'https://www.reddit.com', submitUrl: 'https://www.reddit.com/submit', type: 'community', language: 'en', topics: ['saas', 'seo', 'marketing', 'ai'], format: 'markdown', maxLength: 2500, rules: 'Read each subreddit rules first. Most ban self-promotion; follow the 9:1 rule. Disclose that you are the maker.' },
  { name: 'Indie Hackers', url: 'https://www.indiehackers.com', submitUrl: 'https://www.indiehackers.com/new-post', type: 'community', language: 'en', topics: ['startups', 'saas', 'bootstrapping'], format: 'markdown', maxLength: 3000, rules: 'Share lessons, numbers and stories. Product link once, at the end.' },
  { name: 'Quora', url: 'https://www.quora.com', submitUrl: 'https://www.quora.com/', type: 'qa', language: 'en', topics: ['seo', 'marketing', 'ai'], format: 'plain', maxLength: 2000, rules: 'Answer existing questions. Disclose affiliation; one link max.' },

  // Vietnamese communities
  { name: 'Brands Vietnam Community', url: 'https://www.brandsvietnam.com', submitUrl: 'https://www.brandsvietnam.com/community', type: 'community', language: 'vi', topics: ['marketing', 'branding', 'seo'], format: 'plain', needsReview: true, maxLength: 4000, rules: 'Bài chia sẻ kiến thức marketing; kiểm duyệt trước khi hiển thị. Hạn chế link.' },
  { name: 'Spiderum', url: 'https://spiderum.com', submitUrl: 'https://spiderum.com/', type: 'ugc_blog', language: 'vi', topics: ['khoa học - công nghệ', 'kỹ năng', 'kinh doanh'], format: 'plain', maxLength: 8000, rules: 'Bài viết sâu, quan điểm cá nhân. Cộng đồng ghét quảng cáo lộ liễu.' },
  { name: 'Viblo', url: 'https://viblo.asia', submitUrl: 'https://viblo.asia/publish/post', type: 'ugc_blog', language: 'vi', topics: ['lập trình', 'ai', 'web'], format: 'markdown', rules: 'Bài kỹ thuật cho dev Việt. Markdown. Không spam link.' },
  { name: 'Tinh tế', url: 'https://tinhte.vn', submitUrl: 'https://tinhte.vn/', type: 'forum', language: 'vi', topics: ['công nghệ', 'phần mềm'], format: 'plain', maxLength: 3000, rules: 'Chia sẻ trải nghiệm công nghệ. Link quảng cáo dễ bị xoá.' },
  { name: 'Voz', url: 'https://voz.vn', submitUrl: 'https://voz.vn/', type: 'forum', language: 'vi', topics: ['công nghệ', 'lập trình'], format: 'plain', maxLength: 2000, rules: 'Diễn đàn khó tính; chỉ đăng ở box phù hợp, không quảng cáo.' },
]

/** Bump when the seed list grows: existing databases get the missing sites (matched by hostname). */
export const CATALOG_VERSION = 2

export const seedHost = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url
  }
}

// Researched list (catalogExtra.ts, Nov 2026) wins over the original hand-written entries for the same host.
const merged = new Map<string, SeedSite>()
for (const s of [...seeds, ...EXTRA_SEEDS]) merged.set(seedHost(s.url), s)

export const CATALOG_SEED: SiteInput[] = [...merged.values()].map((s) => ({
  needsReview: false,
  maxLength: null,
  notes: '',
  ...s,
  dr: null,
  linkType: 'unknown',
  status: 'active'
}))
