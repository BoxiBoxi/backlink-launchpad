# BacklinkBuilder

Windows desktop app (Electron) that manages backlink and promotion campaigns for several sites (Wriai, AIKTP, yupvox, ...).
It is a **campaign manager and assisted poster, not a spam bot**: it writes drafts, opens the submit page in Brave and
pre-fills what it can. You review, sign in, solve CAPTCHAs and click submit yourself. The app never auto-submits,
never solves CAPTCHAs and never creates accounts.

## Features

| Section | What it does |
| --- | --- |
| Dashboard | Placed / live / dofollow links and pending tasks per project |
| Projects | Brand profile: name, domain, tagline, short/long description, logo, screenshots/mockups, topics, target URLs with anchor texts. Logo and screenshots are attached to image upload fields when a task is opened |
| Site catalog | 414 seeded targets (AI/SaaS directories, launch sites, UGC blogs, communities, forums, Q&A, profiles, 45 Vietnamese sites), each with a priority score 0-100 (relevance + authority + cost/effort + likely link value). Sorted by priority; filter by type, language, priority tier. Most submit URLs are unverified (`review` badge). Editable; "Check alive" probes each site. **Fetch DR** fills the DR column from Ahrefs (`AHREFS_API_KEY`, free `domain-rating-free` endpoint, 0 API units, by root domain); sort by DR. Alive check reports `down` (DNS gone, 404/410, 5xx) separately from `unreachable` (refused/reset/TLS/timeout from your network, often an ISP block) |
| AI content | One unique post per (project, site), respecting the site's language, type, length, format and link rules. Editable. Editor follows the site format (HTML: WYSIWYG + source + preview; Markdown/plain: write + preview). **Export PDF** (optionally with screenshots) for document sites such as Yumpu, Issuu, Scribd |
| Posting queue | **Open** a task: Brave goes to the submit page, fills title/body, attaches logo/screenshots, copies the body. **Start session** walks the open tasks by priority: after you submit, it detects the live post URL in Brave (`src/core/postDetect.ts`), saves it to the Link monitor (with Undo) and opens the next site. You still review, sign in, solve CAPTCHAs and click submit. Directories that only show a "pending review" page are not detected: use **Posted** or **Next site** |
| Link monitor | Checks each placed link: page live, link present, `rel` (dofollow / nofollow / ugc / sponsored), anchor text. Re-checks automatically (interval in Settings) |

Link type in the catalog stays `unknown` until a placed link on that site is verified; the first verified link sets it.

## Setup

Requirements: Node 20+, pnpm 10, Brave browser.

```powershell
pnpm install
copy .env.example .env   # then fill in the values
pnpm dev
```

### Environment variables

Same names as the Wriai project (OpenAI-compatible chat API):

| Variable | Meaning |
| --- | --- |
| `OPENAI_END_POINT` | Primary gateway base URL, e.g. `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | Primary key |
| `OPENAI_TEXT_MODEL` | Models, `|` separated; first is primary, the rest are fallbacks |
| `OPENAI_TIMEOUT_MS` | Request timeout (default 120000) |
| `OPENAI_END_POINT_BK_1`, `OPENAI_API_KEY_BK_1`, `OPENAI_TEXT_MODEL_BK_1` | Fallback gateway |
| `AHREFS_API_KEY` | Optional. Ahrefs key for Fetch DR (can also be set in Settings) |

`.env` is looked up in this order (first value wins): `%APPDATA%\BacklinkBuilder\.env`, next to `BacklinkBuilder.exe`,
the app folder, the working directory. For the installed app, put `.env` in `%APPDATA%\BacklinkBuilder\`.
Endpoint, models and key can also be overridden in **Settings** (stored in the local database).

## Brave profile

- Brave is auto-detected (`Program Files`, `Program Files (x86)`, `%LOCALAPPDATA%`); the path can be set in Settings.
- The app uses a **dedicated profile** at `<data folder>\brave-profile` (see Data below), never your main Brave
  profile. Cookies and logins persist there between runs.
- First time: Posting queue -> **Brave login window**. This opens Brave on that profile *without* automation, so
  Google/GitHub logins work normally. Sign in to the sites you plan to use, then close that window. Sessions persist.
- **Open** on a task launches Brave on the same profile through Playwright. Only one Brave window can use the profile
  at a time, so close the login window first. **Close Brave** closes the automated window.
- Link and site checks use a separate headless Brave without the profile (falls back to plain HTTP if Brave is missing).

## Data

Everything the app stores (SQLite DB, Brave profile with cookies, generated media) lives in one data folder:

| How the app runs | Data folder |
| --- | --- |
| `pnpm dev` | `<project>\data` (gitignored: it contains login cookies, never commit or share it) |
| Installed app | `%APPDATA%\BacklinkBuilder` |
| `BB_USER_DATA=<dir>` set | that folder (used for tests) |

SQLite uses `better-sqlite3` + Drizzle ORM (`backlinkbuilder.db`). Tables are created on start; new catalog seeds are
merged by hostname when `CATALOG_VERSION` in `src/core/catalogSeed.ts` is bumped. Back up the data folder to keep
projects, links and Brave logins.

## Scripts

```powershell
pnpm dev         # Electron + Vite dev mode
pnpm typecheck   # tsc --noEmit for main/preload/core and renderer
pnpm test        # post URL detection table test
pnpm build       # build + Windows NSIS installer in release/
pnpm build:dir   # build + unpacked app only (release/win-unpacked)
```

## Code layout

```
src/core/      portable logic, no Electron: ai.ts (gateway/model fallback), contentGen.ts (prompts),
               linkAnalysis.ts (rel/anchor detection), catalogSeed.ts + catalogExtra.ts + catalogMore*.ts (site list, priorities)
src/main/      Electron main: db/, repo.ts, ipc.ts, browser.ts (Brave/Playwright), checker.ts, config.ts
src/preload/   typed IPC bridge (window.api.invoke)
src/shared/    types shared by all layers, including the IPC contract (Api)
src/renderer/  React + Tailwind UI (custom Dropdown, lucide icons)
```

`src/core` is written so it can move into Wriai later.
