// Loading placeholders. One primitive (Skeleton) plus two small wrappers so
// every loading.tsx shares the same shimmer, card chrome and screen-reader
// announcement. Server-safe: no hooks, no 'use client'.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />
}

/** White card shell matching the real cards (bg-dark-secondary = white). */
export function SkeletonCard({
  className = '',
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div aria-hidden="true" className={`bg-dark-secondary rounded-2xl border border-white/5 ${className}`}>
      {children}
    </div>
  )
}

/** Page wrapper: announces "Loading" once to assistive tech. */
export function SkeletonPage({
  className = 'p-6 md:p-10 max-w-5xl mx-auto',
  label = 'Loading',
  children,
}: {
  className?: string
  label?: string
  children: React.ReactNode
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** Title + subtitle block used at the top of most dashboard pages. */
export function SkeletonHeader({
  titleWidth = 'w-40',
  subtitleWidth = 'w-56',
  action,
  className = 'mb-8',
}: {
  titleWidth?: string
  subtitleWidth?: string
  /** Width class for a right-aligned primary button, if the page has one. */
  action?: string
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-4 flex-wrap ${className}`}>
      <div>
        <Skeleton className={`h-8 ${titleWidth}`} />
        <Skeleton className={`h-4 ${subtitleWidth} mt-2`} />
      </div>
      {action && <Skeleton className={`h-10 ${action} rounded-xl`} />}
    </div>
  )
}
