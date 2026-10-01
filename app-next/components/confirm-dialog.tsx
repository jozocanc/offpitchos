'use client'

import { useCallback, useRef, useState } from 'react'
import Modal from './modal'

export interface ConfirmOptions {
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for deletes, cancels and other one-way actions. */
  destructive?: boolean
}

/**
 * Styled replacement for window.confirm. Prefer the useConfirm() hook:
 *
 *   const { confirm, dialog } = useConfirm()
 *   if (!(await confirm({ title: 'Delete this?', destructive: true }))) return
 *   ...
 *   return <>{...}{dialog}</>
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} description={message} onClose={onCancel} size="sm" role="alertdialog" showClose={false}>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          data-autofocus=""
          className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`flex-1 font-bold py-3 rounded-xl hover:opacity-90 transition-opacity ${
            destructive ? 'bg-red text-dark-secondary' : 'bg-green text-dark'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** Promise-based confirm. Render `dialog` somewhere in the component. */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    // A second call while one is open resolves the first as cancelled.
    resolver.current?.(false)
    setOpts(o)
    return new Promise<boolean>(resolve => { resolver.current = resolve })
  }, [])

  function settle(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setOpts(null)
  }

  const dialog = opts ? (
    <ConfirmDialog {...opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null

  return { confirm, dialog }
}
