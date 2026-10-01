'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastOptions {
  /** One inline action, e.g. Undo or Retry. Clicking it dismisses the toast. */
  action?: { label: string; onClick: () => void }
  /** Override the auto-dismiss delay in ms. */
  duration?: number
}

interface Toast {
  id: number
  message: string
  type: ToastType
  action?: ToastOptions['action']
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, opts?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

/**
 * True for the "View as Player" write block (PREVIEW_WRITE_ERROR in
 * lib/admin-role.ts, which is server-only so it can't be imported here).
 * Optimistic flows roll back and skip the Retry button for it.
 */
export function isPreviewBlocked(error: string): boolean {
  return error.startsWith('Preview mode:')
}

/** Message for a thrown action call (network drop, server crash). */
export function networkErrorMessage(): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return "You're offline. Try again when you're back."
  }
  return 'Could not reach the server. Try again.'
}

let toastId = 0

const STYLES: Record<ToastType, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'border-green/20 text-green',
    icon: <polyline points="20 6 9 17 4 12" />,
  },
  error: {
    box: 'border-red/25 text-red',
    icon: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  },
  info: {
    box: 'border-white/10 text-white',
    icon: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setToasts(prev => prev.filter(x => x.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'success', opts?: ToastOptions) => {
    const id = ++toastId
    // Keep at most three on screen; the oldest goes first.
    setToasts(prev => [...prev.slice(-2), { id, message, type, action: opts?.action }])
    // Errors and actionable toasts stay longer so they can be read and used.
    const duration = opts?.duration ?? (opts?.action ? 6000 : type === 'error' ? 5000 : 3000)
    timers.current.set(id, setTimeout(() => dismiss(id), duration))
  }, [dismiss])

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6 inset-x-4 md:inset-x-auto md:right-6 z-[100] flex flex-col items-stretch md:items-end gap-2 pointer-events-none"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`toast-enter pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl text-sm font-medium shadow-lg border bg-dark-secondary md:max-w-sm ${STYLES[t.type].box}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              {STYLES[t.type].icon}
            </svg>
            <span className="flex-1 min-w-0 py-0.5">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                className="shrink-0 text-xs font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 p-1.5 rounded-lg text-gray hover:text-white hover:bg-white/5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
