'use client'

import { useEffect } from 'react'
import Link from 'next/link'

// Route-level boundary for everything under /dashboard. Never shows the raw
// error: in production Next replaces server error messages with a digest
// anyway, and a stack trace means nothing to a coach on the sideline.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] render error', error.digest ?? '', error)
  }, [error])

  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div role="alert" className="text-center max-w-md bg-dark-secondary border border-white/5 rounded-2xl p-8 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-red/10 text-red flex items-center justify-center mx-auto mb-4" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-bold mb-2">
          {offline ? 'You’re offline' : 'This page didn’t load'}
        </h2>
        <p className="text-gray text-sm mb-6">
          {offline
            ? 'Check your connection, then try again. Nothing you saved is lost.'
            : 'Something went wrong on our side. Try again, and if it keeps happening, head back to the dashboard.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="bg-green text-dark font-bold py-2.5 px-6 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="border border-white/10 text-white font-semibold py-2.5 px-6 rounded-xl text-sm hover:bg-white/5 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="text-[11px] text-gray/70 mt-6 tabular-nums">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
