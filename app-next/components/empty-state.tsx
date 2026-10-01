import Link from 'next/link'

/**
 * Empty state for lists: what's going on, plus at most one next action.
 * The action is either a link (href) or a button (onClick, client only).
 */
export default function EmptyState({
  title,
  body,
  action,
  icon,
  className = '',
  compact = false,
}: {
  title: string
  body?: React.ReactNode
  action?: { label: string; href?: string; onClick?: () => void }
  icon?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  const btn = 'inline-flex items-center justify-center bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm'
  return (
    <div className={`bg-dark-secondary rounded-2xl text-center border border-white/5 ${compact ? 'p-6' : 'p-10 sm:p-12'} ${className}`}>
      {icon && (
        <div className="w-11 h-11 rounded-full bg-green/10 text-green flex items-center justify-center mx-auto mb-4" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={`font-bold text-white ${compact ? 'text-base' : 'text-lg'}`}>{title}</p>
      {body && <p className="text-gray text-sm mt-1.5 max-w-sm mx-auto">{body}</p>}
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link href={action.href} className={btn}>{action.label}</Link>
          ) : (
            <button type="button" onClick={action.onClick} className={btn}>{action.label}</button>
          )}
        </div>
      )}
    </div>
  )
}
