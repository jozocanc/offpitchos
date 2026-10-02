'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Shared dialog shell: dimmed backdrop, Escape and backdrop click to close,
 * focus moved inside on open, Tab kept inside, focus returned to the opener
 * on close, and page scroll locked while open.
 *
 * `title` renders as the dialog heading and labels it for screen readers.
 * Pass `dismissible={false}` while a request must not be interrupted.
 *
 * Rendered into document.body: a modal opened from inside a dimmed or
 * transformed ancestor (past schedule cards are opacity-50) would otherwise be
 * trapped in that stacking context, half transparent and under later content.
 */
export default function Modal({
  title,
  description,
  onClose,
  children,
  size = 'md',
  dismissible = true,
  className = '',
  bodyClassName = 'p-6 sm:p-8',
  role = 'dialog',
  showClose = true,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  dismissible?: boolean
  className?: string
  bodyClassName?: string
  role?: 'dialog' | 'alertdialog'
  showClose?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  // Keep the latest values without re-running the mount effect.
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // React's autoFocus has already run by now; keep it if it did. Else
    // prefer [data-autofocus], else the first control that isn't the X.
    if (panel && !panel.contains(document.activeElement)) {
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]')
      const first = preferred
        ?? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).find(el => !el.hasAttribute('data-modal-close'))
      ;(first ?? panel).focus()
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!dismissibleRef.current) return
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) { e.preventDefault(); return }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault(); lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-lg' : 'max-w-md'

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget && dismissibleRef.current) onClose()
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`modal-enter relative bg-dark-secondary rounded-2xl w-full ${width} border border-white/10 shadow-2xl max-h-[90dvh] overflow-y-auto focus:outline-none ${bodyClassName} ${className}`}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id={titleId} className="text-xl font-bold">{title}</h2>
          {showClose && dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-modal-close=""
              className="-mr-2 -mt-1 p-2 rounded-lg text-gray hover:text-white hover:bg-white/5 transition-colors shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {description && <div id={descId} className="text-gray text-sm mb-6">{description}</div>}
        {!description && <div className="mb-5" />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
