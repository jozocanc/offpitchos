import Link from 'next/link'
import { getOnboardingState, dismissOnboardingForm } from './onboarding-checklist-actions'

// Post-wizard setup checklist for DOCs. Auto-completes each step as the
// underlying data appears (teams, coaches, parents, events) and can only
// be dismissed once all four are done. Returns null when dismissed, when
// the user is not a DOC, or when they have no club yet — the dashboard
// can mount this unconditionally for DOC view.
export default async function OnboardingChecklist() {
  const state = await getOnboardingState()
  if (!state.visible) return null

  const steps: {
    key: 'hasTeam' | 'hasCoach' | 'hasParent' | 'hasEvent'
    title: string
    cta: string
    href: string
  }[] = [
    { key: 'hasTeam',   title: 'Add your first team',               cta: 'Add team',      href: '/dashboard/teams' },
    { key: 'hasCoach',  title: 'Invite your first coach',           cta: 'Invite coach',  href: '/dashboard/coaches' },
    { key: 'hasParent', title: 'Invite your first parents',         cta: 'Pick a team',   href: '/dashboard/teams' },
    { key: 'hasEvent',  title: 'Schedule your first event',         cta: 'Open schedule', href: '/dashboard/schedule' },
  ]

  const completedCount = steps.filter(s => state[s.key]).length

  return (
    <div className="mb-8 rounded-2xl bg-dark-secondary border border-green/20 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold">Finish setting up your club</h2>
          <p className="text-gray text-xs mt-1">
            {completedCount} of {steps.length} done — notifications work best once parents are in.
          </p>
        </div>
        {state.allComplete && (
          <form action={dismissOnboardingForm}>
            <button
              type="submit"
              className="text-xs font-bold text-green hover:opacity-80 transition-opacity shrink-0"
            >
              Dismiss ×
            </button>
          </form>
        )}
      </div>

      <ul className="space-y-2">
        {steps.map(step => {
          const done = state[step.key]
          return (
            <li
              key={step.key}
              className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3"
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                  done ? 'bg-green text-dark' : 'border border-white/20 text-gray'
                }`}
                aria-hidden
              >
                {done ? '✓' : ''}
              </span>
              <span className={`flex-1 text-sm ${done ? 'text-gray line-through' : ''}`}>
                {step.title}
              </span>
              {!done && (
                <Link
                  href={step.href}
                  className="text-xs font-bold text-green hover:opacity-80 transition-opacity shrink-0"
                >
                  {step.cta} →
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
