'use client'

import { createPortal } from 'react-dom'

/**
 * Renders an overlay into document.body so it escapes any dimmed or
 * transformed ancestor (past schedule days are opacity-50), which would
 * otherwise trap a fixed overlay half transparent under later content.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
