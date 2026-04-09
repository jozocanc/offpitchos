'use client'

import { useState, useEffect, useTransition } from 'react'
import { assignCoverage, getAssignmentSuggestions } from './actions'
import type { RankedCandidate } from './auto-assign'

interface Coach {
  id: string
  display_name: string | null
}

interface AssignModalProps {
  requestId: string
  coaches: Coach[]
  onClose: () => void
}

export default function AssignModal({ requestId, coaches, onClose }: AssignModalProps) {
  const [suggestions, setSuggestions] = useState<RankedCandidate[] | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [selectedCoach, setSelectedCoach] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getAssignmentSuggestions(requestId)
      .then(result => {
        if (cancelled) return
        setSuggestions(result)
        // Default the dropdown to the top suggestion (for the fallback path)
        if (result.length > 0) {
          setSelectedCoach(result[0].profileId)
        } else if (coaches.length > 0) {
          setSelectedCoach(coaches[0].id)
        }
      })
      .catch(() => {
        if (cancelled) return
        setSuggestions([])
        if (coaches.length > 0) setSelectedCoach(coaches[0].id)
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false)
      })
    return () => { cancelled = true }
  }, [requestId, coaches])

  function handleAssign(coachId?: string) {
    const target = coachId ?? selectedCoach
    if (!target) {
      setError('Select a coach')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await assignCoverage(requestId, target)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const hasSuggestions = (suggestions?.length ?? 0) > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">Assign Coverage</h2>
        <p className="text-gray text-sm mb-6">Ranked by same-team match and recent workload.</p>

        {loadingSuggestions && (
          <div className="space-y-2 mb-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 bg-dark rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loadingSuggestions && hasSuggestions && (
          <div className="space-y-2 mb-4">
            {suggestions!.map((candidate, i) => (
              <button
                key={candidate.profileId}
                onClick={() => handleAssign(candidate.profileId)}
                disabled={isPending}
                className={`w-full bg-dark rounded-xl p-4 border transition-all text-left hover:border-green/40 disabled:opacity-50 disabled:cursor-not-allowed ${
                  i === 0 ? 'border-green/30 shadow-[0_0_20px_rgba(0,255,135,0.08)]' : 'border-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-white">{candidate.displayName}</p>
                      {i === 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-green/15 text-green px-2 py-0.5 rounded-full">
                          Best match
                        </span>
                      )}
                    </div>
                    <p className="text-gray text-xs">{candidate.reason}</p>
                  </div>
                  <span className="text-xs font-bold text-green shrink-0 self-center">
                    {isPending ? '…' : 'Assign →'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loadingSuggestions && !hasSuggestions && (
          <div className="bg-dark rounded-xl p-4 border border-yellow-500/20 mb-4">
            <p className="text-yellow-400 text-sm font-semibold mb-1">No ideal matches</p>
            <p className="text-gray text-xs">
              Every coach in the club either has a conflict at this time or isn&apos;t available.
              Pick anyone below if you want to assign manually.
            </p>
          </div>
        )}

        {/* Fallback: full dropdown of every coach */}
        {!loadingSuggestions && (
          <div>
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="text-xs text-gray hover:text-white transition-colors mb-2"
            >
              {showAll ? 'Hide full list' : hasSuggestions ? 'Pick someone else ▾' : 'Pick a coach ▾'}
            </button>

            {(showAll || !hasSuggestions) && (
              <>
                <select
                  value={selectedCoach}
                  onChange={e => setSelectedCoach(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
                >
                  {coaches.map(c => (
                    <option key={c.id} value={c.id}>{c.display_name ?? 'Unknown'}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleAssign()}
                  disabled={isPending || !selectedCoach}
                  className="w-full bg-white/5 border border-white/10 text-white font-semibold py-2.5 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {isPending ? 'Assigning…' : 'Assign selected'}
                </button>
              </>
            )}
          </div>
        )}

        {error && <p className="text-red text-sm mt-3">{error}</p>}

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
