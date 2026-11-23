// Body editor that follows the target site's format:
//   html     -> Visual (TipTap WYSIWYG) | Source | Preview
//   markdown -> Write | Preview
//   plain    -> Write | Preview
import { useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Bold,
  Check,
  Code2,
  Eye,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Redo2,
  Underline,
  Undo2,
  Unlink,
  Wand2
} from 'lucide-react'
import type { ContentFormat } from '@shared/types'

type Mode = 'visual' | 'source' | 'write' | 'preview'

/** Render a body as safe HTML for preview. */
export function bodyToHtml(body: string, format: ContentFormat): string {
  const html =
    format === 'html'
      ? body
      : format === 'markdown'
        ? (marked.parse(body, { async: false, gfm: true, breaks: false }) as string)
        : body
            .split(/\n{2,}/)
            .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
            .join('')
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

export const textLength = (html: string) => {
  const div = document.createElement('div')
  div.innerHTML = DOMPurify.sanitize(html)
  return (div.textContent || '').length
}

function ToolButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-md transition ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [href, setHref] = useState('')
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      ul: e.isActive('bulletList'),
      ol: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      linkHref: (e.getAttributes('link').href as string | undefined) ?? ''
    })
  })
  const chain = () => editor.chain().focus()
  const i = 'size-4'
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-2 py-1.5">
      <ToolButton title="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold className={i} /></ToolButton>
      <ToolButton title="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic className={i} /></ToolButton>
      <ToolButton title="Underline" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline className={i} /></ToolButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <ToolButton title="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className={i} /></ToolButton>
      <ToolButton title="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className={i} /></ToolButton>
      <ToolButton title="Bullet list" active={s.ul} onClick={() => chain().toggleBulletList().run()}><List className={i} /></ToolButton>
      <ToolButton title="Numbered list" active={s.ol} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className={i} /></ToolButton>
      <ToolButton title="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className={i} /></ToolButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <ToolButton
        title="Link"
        active={s.link || linkOpen}
        onClick={() => {
          setHref(s.linkHref || 'https://')
          setLinkOpen((o) => !o)
        }}
      >
        <Link2 className={i} />
      </ToolButton>
      {s.link && <ToolButton title="Remove link" onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink className={i} /></ToolButton>}
      {linkOpen && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                chain().extendMarkRange('link').setLink({ href }).run()
                setLinkOpen(false)
              }
              if (e.key === 'Escape') setLinkOpen(false)
            }}
            className="h-8 w-64 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-gray-400"
            placeholder="https://"
          />
          <ToolButton
            title="Apply link"
            onClick={() => {
              chain().extendMarkRange('link').setLink({ href }).run()
              setLinkOpen(false)
            }}
          >
            <Check className={i} />
          </ToolButton>
        </div>
      )}
      <span className="ml-auto" />
      <ToolButton title="Undo" onClick={() => chain().undo().run()}><Undo2 className={i} /></ToolButton>
      <ToolButton title="Redo" onClick={() => chain().redo().run()}><Redo2 className={i} /></ToolButton>
    </div>
  )
}

function VisualEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } })],
    content: value,
    editorProps: { attributes: { class: 'bb-prose min-h-[22rem] px-5 py-4 outline-none' } },
    onUpdate: ({ editor: e }) => onChange(e.getHTML())
  })
  if (!editor) return null
  return (
    <>
      <Toolbar editor={editor} />
      <div className="max-h-[28rem] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </>
  )
}

export default function BodyEditor({ format, value, onChange }: { format: ContentFormat; value: string; onChange: (v: string) => void }) {
  const tabs: { id: Mode; label: string; icon: typeof Eye }[] =
    format === 'html'
      ? [
          { id: 'visual', label: 'Visual', icon: Wand2 },
          { id: 'source', label: 'HTML source', icon: Code2 },
          { id: 'preview', label: 'Preview', icon: Eye }
        ]
      : [
          { id: 'write', label: format === 'markdown' ? 'Markdown' : 'Text', icon: Pencil },
          { id: 'preview', label: 'Preview', icon: Eye }
        ]
  const [mode, setMode] = useState<Mode>(tabs[0].id)
  const chars = format === 'html' ? textLength(value) : value.length

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50/70 px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === t.id ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
        <span className="ml-auto pr-2 text-xs text-gray-400">
          {format.toUpperCase()} · {chars.toLocaleString()} chars
        </span>
      </div>
      {mode === 'visual' && <VisualEditor value={value} onChange={onChange} />}
      {(mode === 'source' || mode === 'write') && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="block h-[26rem] w-full resize-none px-5 py-4 font-mono text-[13px] leading-relaxed text-gray-800 outline-none"
        />
      )}
      {mode === 'preview' && (
        <div className="bb-prose max-h-[28rem] min-h-[22rem] overflow-y-auto px-5 py-4" dangerouslySetInnerHTML={{ __html: bodyToHtml(value, format) }} />
      )}
    </div>
  )
}
