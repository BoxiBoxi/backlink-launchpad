// Export a content item as a PDF (for document-sharing sites such as Yumpu, Issuu, Scribd, SlideShare).
// The body HTML comes already sanitized from the renderer; it is printed in a hidden window with JavaScript disabled.
import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Content, Project } from '@shared/types'

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function dataUri(path: string): string | null {
  const mime = MIME[extname(path).toLowerCase()]
  if (!mime || !existsSync(path)) return null
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'content'

function buildDocument(content: Content, project: Project, bodyHtml: string, includeImages: boolean): string {
  const logo = project.logoPath ? dataUri(project.logoPath) : null
  const shots = includeImages ? project.images.map(dataUri).filter((x): x is string => !!x) : []
  const link = content.linkUrl || (project.domain ? `https://${project.domain}` : '')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(content.title)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 11.5pt; line-height: 1.65; }
    header { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; color: #6b7280; font-size: 10pt; }
    header img { width: 28px; height: 28px; border-radius: 6px; }
    h1 { font-size: 22pt; line-height: 1.25; margin: 0 0 16px; color: #111827; }
    h2 { font-size: 15pt; margin: 22px 0 8px; color: #111827; }
    h3 { font-size: 12.5pt; margin: 18px 0 6px; color: #111827; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 10px; padding-left: 22px; }
    a { color: #111827; }
    blockquote { border-left: 3px solid #e5e7eb; margin: 0 0 10px; padding-left: 12px; color: #4b5563; }
    pre { background: #f3f4f6; padding: 10px; border-radius: 6px; white-space: pre-wrap; font-size: 9.5pt; }
    .shots { page-break-before: always; }
    .shots figure { margin: 0 0 8mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
    .shots figure:first-child h2 { text-align: left; }
    .shots img { max-width: 100%; max-height: 112mm; border: 1px solid #e5e7eb; border-radius: 6px; }
    footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 9.5pt; }
  </style></head><body>
    <header>${logo ? `<img src="${logo}">` : ''}<span>${esc(project.name)}${project.domain ? ` · ${esc(project.domain)}` : ''}</span></header>
    <h1>${esc(content.title)}</h1>
    ${bodyHtml}
    ${link ? `<footer>${esc(project.name)}: <a href="${esc(link)}">${esc(link)}</a></footer>` : ''}
    ${
      shots.length
        ? `<section class="shots">${shots
            .map((src, i) => `<figure>${i === 0 ? `<h2>${esc(project.name)} screenshots</h2>` : ''}<img src="${src}"></figure>`)
            .join('')}</section>`
        : ''
    }
  </body></html>`
}

export async function exportContentPdf(
  parent: BrowserWindow | null,
  content: Content,
  project: Project,
  bodyHtml: string,
  includeImages: boolean
): Promise<string | null> {
  const opts = {
    title: 'Save PDF',
    defaultPath: join(app.getPath('downloads'), `${slug(content.title || project.name)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null

  const tmp = join(tmpdir(), `bb-pdf-${Date.now()}.html`)
  writeFileSync(tmp, buildDocument(content, project, bodyHtml, includeImages), 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    writeFileSync(res.filePath, pdf)
  } finally {
    win.destroy()
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
  shell.showItemInFolder(res.filePath)
  return res.filePath
}
