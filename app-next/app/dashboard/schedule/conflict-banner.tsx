'use client'

import type { Conflict, Suggestion } from './conflict-actions'

interface ConflictBannerProps {
  conflicts: Conflict[]
  suggestions: Suggestion[]
  onSelectSuggestion: (startTime: string, endTime: string) => void
  loading: boolean
}

export default function ConflictBanner({ conflicts, suggestions, onSelectSuggestion, loading }: ConflictBannerProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray px-3 py-2">
        <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
        Checking for conflicts...
      </div>
    )
  }

  if (conflicts.length === 0) return null

  const iconMap = {
    team: '📋',
    venue: '📍',
    coach: '👤',
  }

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Conflicts detected</p>

      {conflicts.map((c, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5">{iconMap[c.type]}</span>
          <div>
            <p className="text-white/80">{c.message}</p>
            <p className="text-xs text-gray">{c.eventTitle} at {c.eventTime}</p>
          </div>
        </div>
      ))}

      {suggestions.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <p className="text-xs text-gray mb-2">Available slots:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSelectSuggestion(s.startTime, s.endTime)}
                className="px-2.5 py-1 rounded-md bg-green/10 border border-green/20 text-xs text-green hover:bg-green/20 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
