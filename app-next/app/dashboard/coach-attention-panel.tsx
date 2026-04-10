'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCoachAttention, type CoachAttentionResult, type CoachSignal } from './coach-attention-actions'

const URGENCY_STYLES: Record<CoachSignal['urgency'], { dot: string; labelColor: string; border: string }> = {
  critical: {
    dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    labelColor: 'text-red-400',
    border: 'border-red-500/20 hover:border-red-500/40',
  },
  important: {
    dot: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]',
    labelColor: 'text-yellow-400',
    border: 'border-yellow-500/15 hover:border-yellow-500/30',
  },
  routine: {
    dot: 'bg-gray',
    labelColor: 'text-gray',
    border: 'border-white/5 hover:border-green/20',
  },
}

// Light-weight coach prioritization panel. Mirrors the DOC attention panel
// but with three coach-specific signals: coverage waiting, attendance
// unmarked, and feedback owed. Fetched client-side so we can poll/refresh
// without making the whole dashboard server-rendered on every reload.
export default function CoachAttentionPanel() {
  const [data, setData] = useState<CoachAttentionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCoachAttention()
      .then(res => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setError('Could not load your action list.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="mb-10">
        <h2 className="text-lg font-bold mb-4">Needs your attention</h2>
        <div className="animate-pulse space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 bg-dark-secondary rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) return null

  // Nothing to do — don't show the panel at all. Coaches hate noise.
  if (data.signals.length === 0) return null

  // Sort by urgency so critical rises to the top even if it was enqueued last.
  const ordered = [...data.signals].sort((a, b) => {
    const weight = { critical: 0, important: 1, routine: 2 }
    return weight[a.urgency] - weight[b.urgency]
  })

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Needs your attention</h2>
        <span className="text-xs text-gray">{ordered.length} item{ordered.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">
        {ordered.map(sig => {
          const style = URGENCY_STYLES[sig.urgency]
          return (
            <Link
              key={sig.id}
              href={sig.href}
              className={`block bg-dark-secondary rounded-xl p-4 border ${style.border} transition-colors`}
            >
              <div className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-white text-sm">{sig.title}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${style.labelColor}`}>
                      {sig.type === 'coverage_waiting' ? 'Coverage' : sig.type === 'attendance_unmarked' ? 'Attendance' : 'Feedback'}
                    </span>
                  </div>
                  {sig.subtitle && <p className="text-gray text-xs mt-0.5">{sig.subtitle}</p>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
