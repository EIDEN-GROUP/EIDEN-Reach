import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Type,
  ChevronDown,
  Check,
  X,
} from 'lucide-react'
import WarmTooltip, { WarmTooltipGroup } from './WarmTooltip'

type RichTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> & {
  value: string
  onChange: (next: string) => void
  rows?: number
  /** Put a label above the textarea (kept for consistency with plain fields) */
  label?: ReactNode
}

type Popover = 'link' | 'format' | null

const INSERT_TOOLS = [
  { id: 'bold', label: 'Bold', shortcut: '⌘B', icon: Bold },
  { id: 'italic', label: 'Italic', shortcut: '⌘I', icon: Italic },
  { id: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
  { id: 'code', label: 'Inline code', shortcut: '⌘E', icon: Code },
] as const

const LIST_TOOLS = [
  { id: 'ol', label: 'Numbered list', icon: ListOrdered },
  { id: 'ul', label: 'Bulleted list', icon: List },
  { id: 'quote', label: 'Blockquote', icon: Quote },
  { id: 'codeblock', label: 'Code block', icon: SquareCode },
] as const

const FORMAT_OPTIONS = [
  { id: 'normal', label: 'Normal text', prefix: '' },
  { id: 'h1', label: 'Heading 1', prefix: '# ' },
  { id: 'h2', label: 'Heading 2', prefix: '## ' },
  { id: 'h3', label: 'Heading 3', prefix: '### ' },
] as const

function clampPos(value: string, pos: number) { return Math.max(0, Math.min(value.length, pos)) }

/**
 * Minimal, dependency-free markdown editor toolbar for the Text body field.
 * Works on a plain textarea; the stored value stays markdown-ish plain text,
 * which is exactly what the sequence engine sends.
 */
export function RichTextArea({ value, onChange, rows = 5, label, ...textareaProps }: RichTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [popover, setPopover] = useState<Popover>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  // Restore selection after the textarea re-renders with the new value
  useLayoutEffect(() => {
    const pending = pendingSelection.current
    const el = textareaRef.current
    if (!pending || !el) return
    pendingSelection.current = null
    el.focus()
    el.setSelectionRange(clampPos(el.value, pending.start), clampPos(el.value, pending.end))
  })

  // Close popovers on outside click / escape
  useEffect(() => {
    if (!popover) return
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.rich-toolbar__popover, .rich-toolbar__button[data-popover-trigger]')) {
        setPopover(null)
      }
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPopover(null) }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true) }
  }, [popover])

  function replace(next: string, selectionStart: number, selectionEnd: number) {
    pendingSelection.current = { start: selectionStart, end: selectionEnd }
    onChange(next)
  }

  /** Wrap the current selection in inline markers (bold, italic, …) */
  function wrapInline(before: string, after: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = el.value.slice(start, end)
    const inner = selected || 'text'
    const next = el.value.slice(0, start) + before + inner + after + el.value.slice(end)
    replace(next, start + before.length, start + before.length + inner.length)
  }

  function toggleLines(prefix: string | ((index: number) => string)) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const head = el.value.slice(0, start)
    const tail = el.value.slice(end)
    const lineStart = head.lastIndexOf('\n') + 1
    const lineEnd = end + (tail.indexOf('\n') === -1 ? tail.length : tail.indexOf('\n'))
    const block = el.value.slice(lineStart, lineEnd)
    const lines = block.split('\n')
    const isPlain = typeof prefix === 'string'
    const everyPrefixed = lines.every(line => isPlain && line.startsWith(prefix))
    const next = everyPrefixed
      ? lines.map(line => line.slice((prefix as string).length))
      : lines.map((line, index) => (typeof prefix === 'function' ? prefix(index) + line : prefix + line))
    const transformed = next.join('\n')
    const nextValue = el.value.slice(0, lineStart) + transformed + el.value.slice(lineEnd)
    replace(nextValue, lineStart, lineStart + transformed.length)
  }

  function applyCodeBlock() {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = el.value.slice(start, end) || 'code'
    const before = start > 0 && el.value[start - 1] !== '\n' ? '\n' : ''
    const after = end < el.value.length && el.value[end] !== '\n' ? '\n' : ''
    const next = el.value.slice(0, start) + before + '```\n' + selected + '\n```' + after + el.value.slice(end)
    const offsetStart = start + before.length + 4
    replace(next, offsetStart, offsetStart + selected.length)
  }

  function applyHeading(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const head = el.value.slice(0, start)
    const tail = el.value.slice(end)
    const lineStart = head.lastIndexOf('\n') + 1
    const lineEnd = end + (tail.indexOf('\n') === -1 ? tail.length : tail.indexOf('\n'))
    const block = el.value.slice(lineStart, lineEnd)
    const stripped = block.replace(/^(#{1,3})\s+/, '')
    const transformed = prefix ? prefix + stripped : stripped
    const nextValue = el.value.slice(0, lineStart) + transformed + el.value.slice(lineEnd)
    replace(nextValue, lineStart, lineStart + transformed.length)
  }

  function insertLink() {
    const el = textareaRef.current
    if (!el || !linkUrl.trim()) return
    const url = linkUrl.trim()
    const before = el.selectionStart
    const end = el.selectionEnd
    const selected = el.value.slice(before, end) || 'link text'
    const snippet = `[${selected}](${url})`
    const next = el.value.slice(0, before) + snippet + el.value.slice(end)
    setPopover(null)
    setLinkUrl('')
    replace(next, before + snippet.length, before + snippet.length)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = event.metaKey || event.ctrlKey
    if (!meta) return
    const key = event.key.toLowerCase()
    if (key === 'b') { event.preventDefault(); wrapInline('**', '**') }
    else if (key === 'i') { event.preventDefault(); wrapInline('*', '*') }
    else if (key === 'e') { event.preventDefault(); wrapInline('`', '`') }
    else if (key === 'k') { event.preventDefault(); setPopover('link') }
  }

  const toolButton = (id: string, label: string, shortcut: string | undefined, Icon: typeof Bold) => (
    <WarmTooltip key={id} content={label} shortcut={shortcut} side="top" gap={6} size="sm">
      <button
        type="button"
        className="rich-toolbar__button"
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (id === 'bold') wrapInline('**', '**')
          else if (id === 'italic') wrapInline('*', '*')
          else if (id === 'strikethrough') wrapInline('~~', '~~')
          else if (id === 'code') wrapInline('`', '`')
          else if (id === 'ol') toggleLines(i => `${i + 1}. `)
          else if (id === 'ul') toggleLines('- ')
          else if (id === 'quote') toggleLines('> ')
          else if (id === 'codeblock') applyCodeBlock()
        }}
      >
        <Icon size={15} strokeWidth={2} />
      </button>
    </WarmTooltip>
  )

  const textarea = (
    <textarea
      {...textareaProps}
      ref={textareaRef}
      rows={rows}
      className="rich-toolbar__textarea"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  )

  return (
    <div className="rich-toolbar">
      <WarmTooltipGroup delay={350} warmWindow={250} travel={300}>
        <div className="rich-toolbar__bar" role="toolbar" aria-label="Text formatting">
          <div className="rich-toolbar__group">
            {INSERT_TOOLS.map(tool => toolButton(tool.id, tool.label, 'shortcut' in tool ? tool.shortcut : undefined, tool.icon))}
          </div>
          <div className="rich-toolbar__separator" aria-hidden="true" />
          <div className="rich-toolbar__group">
            <WarmTooltip content="Link" shortcut="⌘K" side="top" gap={6} size="sm">
              <button
                type="button"
                className="rich-toolbar__button"
                aria-label="Insert link"
                aria-expanded={popover === 'link'}
                data-popover-trigger=""
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPopover(popover === 'link' ? null : 'link')}
              >
                <Link2 size={15} strokeWidth={2} />
              </button>
            </WarmTooltip>
            {LIST_TOOLS.map(tool => toolButton(tool.id, tool.label, undefined, tool.icon))}
          </div>
          <div className="rich-toolbar__separator" aria-hidden="true" />
          <div className="rich-toolbar__group">
            <WarmTooltip content="Text formatting" side="top" gap={6} size="sm">
              <button
                type="button"
                className="rich-toolbar__button rich-toolbar__button--format"
                aria-label="Text formatting"
                aria-expanded={popover === 'format'}
                data-popover-trigger=""
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPopover(popover === 'format' ? null : 'format')}
              >
                <Type size={15} strokeWidth={2} />
                <ChevronDown size={12} strokeWidth={2.2} />
              </button>
            </WarmTooltip>
          </div>
        </div>

        {popover === 'link' ? (
          <div className="rich-toolbar__popover" role="dialog" aria-label="Insert link">
            <label className="rich-toolbar__popover-label" htmlFor="rich-link-url">Link URL</label>
            <input
              id="rich-link-url"
              type="url"
              autoFocus
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); insertLink() } }}
            />
            <div className="rich-toolbar__popover-actions">
              <button type="button" className="secondary-button icon-button" aria-label="Cancel" onClick={() => { setPopover(null); setLinkUrl('') }}><X size={14} /></button>
              <button type="button" className="primary-button icon-button" aria-label="Insert link" onClick={insertLink}><Check size={14} /></button>
            </div>
          </div>
        ) : null}

        {popover === 'format' ? (
          <div className="rich-toolbar__popover rich-toolbar__popover--menu" role="menu" aria-label="Text formatting">
            {FORMAT_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                className="rich-toolbar__menu-item"
                data-level={option.id}
                onClick={() => { applyHeading(option.prefix); setPopover(null) }}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </WarmTooltipGroup>
      {label ? <label className="rich-toolbar__label">{label}</label> : null}
      {textarea}
    </div>
  )
}
