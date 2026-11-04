import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type SlideOutProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  side?: 'left' | 'right'
  children: ReactNode
}

// Closes on Escape, locks page scroll while open and returns focus to the
// element that opened the panel.
function useSlideOutBehaviour(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [open])
}

export function SlideOut({ open, onClose, title, description, side = 'right', children }: SlideOutProps) {
  const titleId = useId()
  useSlideOutBehaviour(open, onClose)
  if (!open) return null
  return (
    <div
      className={`slideout-scrim slideout-${side}`}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <aside className={`slideout slideout-${side}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="slideout-header">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="slideout-close" aria-label="Close panel" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="slideout-body">{children}</div>
      </aside>
    </div>
  )
}

type CenterDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

// Mid-page centred dialog for longer forms. Escape, scrim click and the X close it.
export function CenterDialog({ open, onClose, title, description, children }: CenterDialogProps) {
  const titleId = useId()
  useSlideOutBehaviour(open, onClose)
  if (!open) return null
  return (
    <div className="center-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="center-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="center-header">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="slideout-close" aria-label="Close dialog" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="center-body">{children}</div>
      </section>
    </div>
  )
}

type RecordPanelProps = {
  open: boolean
  onClose: () => void
  kicker: string
  title: string
  // Left sidebar of the panel: summary cards and status.
  sidebar?: ReactNode
  children: ReactNode
}

// Wide right-hand record panel with a left sidebar, in the Fibery entity-panel style.
// It is not a full-page view: the list stays visible behind a dimmed scrim.
export function EntityPage({ open, onClose, kicker, title, sidebar, children }: RecordPanelProps) {
  const titleId = useId()
  useSlideOutBehaviour(open, onClose)
  if (!open) return null
  return (
    <div className="record-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="record-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="record-header">
          <div className="record-heading">
            <span className="record-kicker">{kicker}</span>
            <h2 id={titleId}>{title || 'Record'}</h2>
          </div>
          <button type="button" className="slideout-close" aria-label="Close record" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="record-body">
          {sidebar && <aside className="record-sidebar" aria-label="Record summary">{sidebar}</aside>}
          <div className="record-main">{children}</div>
        </div>
      </section>
    </div>
  )
}

// One summary card in the record sidebar: a titled card with label/value rows.
export function RailCard({ title, rows }: { title: string; rows: Array<[string, string | number | null | undefined]> }) {
  return (
    <section className="rail-card">
      <h2 className="rail-card-title">{title}</h2>
      <dl className="rail-rows">
        {rows.map(([label, value]) => (
          <div className="rail-row" key={label}>
            <dt>{label}</dt>
            <dd>{value === null || value === undefined || value === '' ? '—' : value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
