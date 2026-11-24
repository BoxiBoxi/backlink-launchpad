// Edit one generated post: title, body (WYSIWYG / HTML / preview), link, tags, status, PDF export,
// and Regenerate with optional extra instructions. Opened from the Publish page.
import { useEffect, useState } from 'react'
import { Copy, FileDown, RefreshCw } from 'lucide-react'
import type { Content, ContentFormat } from '@shared/types'
import { invoke, useAction, useToast } from '../lib'
import { Button, Dropdown, Field, Input, ListInput, Modal, Toggle } from './ui'
import BodyEditor, { bodyToHtml } from './BodyEditor'

export function ContentEditor({ content, format, siteName, onClose, onSaved }: { content: Content | null; format: ContentFormat; siteName?: string; onClose: () => void; onSaved: (c: Content) => void }) {
  const [draft, setDraft] = useState<Content | null>(content)
  const { busy, run } = useAction()
  const toast = useToast()
  const [withImages, setWithImages] = useState(true)
  const [extra, setExtra] = useState('')
  const [bodyKey, setBodyKey] = useState(0)
  useEffect(() => setDraft(content), [content])
  if (!draft) return null
  const regenerate = async () => {
    const c = await run(
      'regen',
      () => invoke('content:generate', { projectId: draft.projectId, siteId: draft.siteId, linkUrl: draft.linkUrl || undefined, anchor: draft.anchor || undefined, extra: extra.trim() || undefined, replaceId: draft.id }),
      (r) => `Rewritten with ${r.model}${typeof r.creditsRemaining === 'number' ? ` · ${r.creditsRemaining.toLocaleString()} Wriai credits left` : ''}`
    )
    if (c) {
      setDraft(c)
      setBodyKey((k) => k + 1) // remount the editor with the new body
    }
  }
  const copy = async (text: string, what: string) => {
    await invoke('clipboard:write', text)
    toast('info', `${what} copied`)
  }
  return (
    <Modal
      open={!!content}
      onClose={onClose}
      title={siteName ? `Edit content for ${siteName}` : 'Edit content'}
      wide
      footer={
        <>
          <div className="mr-auto flex items-center gap-3">
            <Button
              icon={<FileDown className="size-4" />}
              loading={busy === 'pdf'}
              onClick={() =>
                run(
                  'pdf',
                  async () => {
                    await invoke('content:save', draft) // export what is on screen
                    return invoke('content:exportPdf', { contentId: draft.id, bodyHtml: bodyToHtml(draft.body, format), includeImages: withImages })
                  },
                  (path) => (path ? `PDF saved: ${path}` : 'Export cancelled')
                )
              }
            >
              Export PDF
            </Button>
            <Toggle checked={withImages} onChange={setWithImages} label="Include screenshots" />
          </div>
          <Button icon={<Copy className="size-4" />} onClick={() => copy(draft.title, 'Title')}>Copy title</Button>
          <Button icon={<Copy className="size-4" />} onClick={() => copy(draft.body, 'Body')}>Copy body</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={async () => {
              const saved = await run('save', () => invoke('content:save', draft), 'Content saved')
              if (saved) onSaved(saved)
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" className="col-span-2"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
        <Field label="Body" className="col-span-2" asDiv>
          <BodyEditor key={`${draft.id}-${bodyKey}`} format={format} value={draft.body} onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))} />
        </Field>
        <Field label="Rewrite with AI (optional instructions)" className="col-span-2" asDiv>
          <div className="flex gap-2">
            <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. shorter, more personal, focus on the free plan" onKeyDown={(e) => e.key === 'Enter' && void regenerate()} />
            <Button icon={<RefreshCw className="size-4" />} loading={busy === 'regen'} onClick={regenerate}>Regenerate</Button>
          </div>
        </Field>
        <Field label="Link URL"><Input value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} /></Field>
        <Field label="Anchor"><Input value={draft.anchor} onChange={(e) => setDraft({ ...draft, anchor: e.target.value })} /></Field>
        <Field label="Tags"><ListInput value={draft.tags} onChange={(v) => setDraft({ ...draft, tags: v })} /></Field>
        <Field label="Status">
          <Dropdown value={draft.status} options={[{ value: 'draft', label: 'Draft' }, { value: 'ready', label: 'Ready' }, { value: 'used', label: 'Used' }]} onChange={(v) => setDraft({ ...draft, status: v })} />
        </Field>
      </div>
    </Modal>
  )
}
