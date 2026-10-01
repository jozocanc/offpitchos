'use client'

import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/**
 * Thin bar pinned to the top of the viewport while the device is offline.
 * Renders nothing online and during SSR (server snapshot = online).
 */
export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[110] flex justify-center pointer-events-none pt-[env(safe-area-inset-top)]"
    >
      <div className="toast-enter pointer-events-auto mt-2 mx-4 flex items-center gap-2 rounded-full bg-white text-dark-secondary px-4 py-2 text-sm font-medium shadow-lg">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 13a10 10 0 0 1 5.24-2.76" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        You&apos;re offline. Changes won&apos;t save until you&apos;re back online.
      </div>
    </div>
  )
}
