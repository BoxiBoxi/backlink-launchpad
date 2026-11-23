// Quick table test for post URL detection: pnpm exec tsx scripts/test-postDetect.ts (or via esbuild)
import { looksLikePostUrl } from '../src/core/postDetect'

const cases: [string, string, string, boolean][] = [
  // url, siteUrl, submitUrl, expected
  ['https://dev.to/new', 'https://dev.to', 'https://dev.to/new', false],
  ['https://dev.to/enter?state=new-user', 'https://dev.to', 'https://dev.to/new', false],
  ['https://dev.to/wriai/a-practical-workflow-for-seo-articles-4k2j', 'https://dev.to', 'https://dev.to/new', true],
  ['https://dev.to/wriai/a-practical-workflow-for-seo-articles-4k2j/edit', 'https://dev.to', 'https://dev.to/new', false],
  ['https://dev.to/wriai', 'https://dev.to', 'https://dev.to/new', false],
  ['https://www.reddit.com/r/SideProject/submit', 'https://www.reddit.com/r/SideProject', 'https://www.reddit.com/r/SideProject/submit', false],
  ['https://www.reddit.com/r/SideProject/comments/1abcde/i_built_wriai/', 'https://www.reddit.com/r/SideProject', 'https://www.reddit.com/r/SideProject/submit', true],
  ['https://medium.com/new-story', 'https://medium.com', 'https://medium.com/new-story', false],
  ['https://medium.com/@wriai/how-ai-changes-seo-3f9a1b2c4d5e', 'https://medium.com', 'https://medium.com/new-story', true],
  ['https://medium.com/p/3f9a1b2c4d5e/edit', 'https://medium.com', 'https://medium.com/new-story', false],
  ['https://telegra.ph/', 'https://telegra.ph', 'https://telegra.ph/', false],
  ['https://telegra.ph/A-Practical-Workflow-for-SEO-11-24', 'https://telegra.ph', 'https://telegra.ph/', true],
  ['https://news.ycombinator.com/submit', 'https://news.ycombinator.com', 'https://news.ycombinator.com/submit', false],
  ['https://news.ycombinator.com/item?id=41234567', 'https://news.ycombinator.com', 'https://news.ycombinator.com/submit', true],
  ['https://viblo.asia/publish/post', 'https://viblo.asia', 'https://viblo.asia/publish/post', false],
  ['https://viblo.asia/p/ai-trong-quy-trinh-seo-noi-dung-AbCdEf12', 'https://viblo.asia', 'https://viblo.asia/publish/post', true],
  ['https://www.indiehackers.com/post/how-i-built-wriai-9f8e7d', 'https://www.indiehackers.com', 'https://www.indiehackers.com/new-post', true],
  ['https://www.saashub.com/submit', 'https://www.saashub.com', 'https://www.saashub.com/submit', false],
  ['https://www.saashub.com/thank-you', 'https://www.saashub.com', 'https://www.saashub.com/submit', false],
  ['https://www.saashub.com/wriai', 'https://www.saashub.com', 'https://www.saashub.com/submit', false],
  ['https://www.saashub.com/wriai-alternatives', 'https://www.saashub.com', 'https://www.saashub.com/submit', true],
  ['https://accounts.google.com/o/oauth2/auth?x=1', 'https://dev.to', 'https://dev.to/new', false],
  ['https://www.brandsvietnam.com/congdong/topic/12345-ai-trong-quy-trinh-seo', 'https://www.brandsvietnam.com', 'https://www.brandsvietnam.com/community', true],
  ['https://www.brandsvietnam.com/login', 'https://www.brandsvietnam.com', 'https://www.brandsvietnam.com/community', false],
  ['https://wriai.hashnode.dev/ai-seo-workflow', 'https://hashnode.com', 'https://hashnode.com/draft', true],
  ['https://www.producthunt.com/posts/wriai', 'https://www.producthunt.com', 'https://www.producthunt.com/posts/new', true],
  ['https://www.producthunt.com/posts/new', 'https://www.producthunt.com', 'https://www.producthunt.com/posts/new', false]
]

let fail = 0
for (const [url, siteUrl, submitUrl, want] of cases) {
  const got = looksLikePostUrl({ url, siteUrl, submitUrl })
  if (got !== want) {
    fail++
    console.log(`FAIL want=${want} got=${got}  ${url}`)
  }
}
console.log(`${cases.length - fail}/${cases.length} passed`)
process.exit(fail ? 1 : 0)
