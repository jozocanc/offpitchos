'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getParentAttention,
  claimPlayers,
  type ClaimablePlayer,
  type ClaimedKid,
  type ParentAttentionResult,
  type ParentSignal,
} from './parent-attention-actions'
import { useToast } from '@/components/toast'

const URGENCY_STYLES: Record<ParentSignal['urgency'], { dot: string; labelColor: string; border: string }> = {
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

const TYPE_LABEL: Record<ParentSignal['type'], string> = {
  claim_kids: 'Setup',
  rsvp_needed: 'RSVP',
  missing_sizes: 'Gear',
  unpaid_camps: 'Camps',
  new_feedback: 'Feedback',
}

// Player dashboard panel (the filename is historical): mirrors the DOC/coach
// attention panels but keyed off the player's own roster row. Also owns the
// "Find yourself on the roster" modal, which is surfaced inline when the
// claim_kids signal fires. Navigating here with `?claim=1` opens the modal
// directly (the signal's href and the join flow both do this).
export default function ParentAttentionPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ParentAttentionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimOpen, setClaimOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getParentAttention()
      setData(res)
    } catch {
      setError('Could not load your action list.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Deep-link support for the claim modal. The attention signal's href
  // points at /dashboard?claim=1, so any tap — push, email, in-app — opens
  // the modal directly on arrival.
  useEffect(() => {
    if (searchParams.get('claim') === '1') setClaimOpen(true)
  }, [searchParams])

  function handleCloseClaim() {
    setClaimOpen(false)
    // Strip the claim query param so hitting back doesn't reopen the modal.
    if (searchParams.get('claim')) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('claim')
      const qs = params.toString()
      router.replace(qs ? `/dashboard?${qs}` : '/dashboard')
    }
  }

  function handleClaimed() {
    // Refresh the attention list after a successful claim so the panel
    // reflects the unlocked signals (missing sizes, feedback, etc.).
    load()
    handleCloseClaim()
  }

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

  const { signals, claimable, claimedKids } = data
  const hasAnything = signals.length > 0 || claimedKids.length > 0
  if (!hasAnything) return null

  const ordered = [...signals].sort((a, b) => {
    const weight = { critical: 0, important: 1, routine: 2 }
    return weight[a.urgency] - weight[b.urgency]
  })

  return (
    <>
      {signals.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Needs your attention</h2>
            <span className="text-xs text-gray">{signals.length} item{signals.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {ordered.map(sig => {
              const style = URGENCY_STYLES[sig.urgency]
              const content = (
                <div className="flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-white text-sm">{sig.title}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${style.labelColor}`}>
                        {TYPE_LABEL[sig.type]}
                      </span>
                    </div>
                    {sig.subtitle && <p className="text-gray text-xs mt-0.5">{sig.subtitle}</p>}
                  </div>
                </div>
              )

              if (sig.type === 'claim_kids') {
                return (
                  <button
                    key={sig.id}
                    onClick={() => setClaimOpen(true)}
                    className={`w-full text-left block bg-dark-secondary rounded-xl p-4 border ${style.border} transition-colors`}
                  >
                    {content}
                  </button>
                )
              }

              return (
                <Link
                  key={sig.id}
                  href={sig.href}
                  className={`block bg-dark-secondary rounded-xl p-4 border ${style.border} transition-colors`}
                >
                  {content}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {claimedKids.length > 0 && <MyRosterSpot rows={claimedKids} />}

      {claimOpen && (
        <ClaimSelfModal
          claimable={claimable}
          onClose={handleCloseClaim}
          onClaimed={handleClaimed}
        />
      )}
    </>
  )
}

function MyRosterSpot({ rows }: { rows: ClaimedKid[] }) {
  return (
    <div className="mb-10">
      <h2 className="text-lg font-bold mb-4">Your roster spot</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(row => (
          <Link
            key={row.id}
            href={`/dashboard/players/${row.id}`}
            className="bg-dark-secondary rounded-xl p-4 border border-white/5 hover:border-green/20 transition-colors flex items-center gap-3"
          >
            {row.jerseyNumber !== null ? (
              <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                <span className="text-green font-bold">{row.jerseyNumber}</span>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                <span className="text-gray font-bold">{row.firstName.charAt(0)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {row.firstName} {row.lastName}
              </p>
              <p className="text-gray text-xs mt-0.5 truncate">
                {row.teamName}
                {row.ageGroup && <span> · {row.ageGroup}</span>}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// Single-select: a player links exactly one roster row, their own.
function ClaimSelfModal({
  claimable,
  onClose,
  onClaimed,
}: {
  claimable: ClaimablePlayer[]
  onClose: () => void
  onClaimed: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function toggle(id: string) {
    setSelectedId(prev => (prev === id ? null : id))
  }

  function handleSubmit() {
    if (!selectedId) {
      toast('Pick your name first', 'error')
      return
    }
    startTransition(async () => {
      try {
        const claimRes = await claimPlayers([selectedId])
        if (!claimRes.ok) { toast(claimRes.error, 'error'); return }
        const result = claimRes.data
        if (result.claimed > 0) {
          toast("You're linked to your roster spot", 'success')
          onClaimed()
        } else {
          toast('Could not link that roster spot', 'error')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to link roster spot'
        toast(msg, 'error')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">Which one is you?</h2>
        <p className="text-gray text-sm mb-6">
          Pick your name on the roster. We&apos;ll use it to send you your reminders, gear
          requests, and coach feedback.
        </p>

        {claimable.length === 0 ? (
          <div className="bg-dark rounded-xl p-6 text-center border border-white/5">
            <p className="text-gray text-sm">
              No open roster spots on your team. Ask your coach to add you to the roster, or
              you&apos;re already linked.
            </p>
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {claimable.map(player => {
              const isSelected = selectedId === player.id
              return (
                <button
                  key={player.id}
                  onClick={() => toggle(player.id)}
                  disabled={isPending}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-green/40 bg-green/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {player.jerseyNumber !== null ? (
                    <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                      <span className="text-green font-bold text-xs">{player.jerseyNumber}</span>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <span className="text-gray font-bold text-xs">{player.firstName.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{player.firstName} {player.lastName}</p>
                    <p className="text-gray text-xs mt-0.5 truncate">{player.teamName}</p>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      isSelected ? 'bg-green border-green text-dark' : 'border-white/20'
                    }`}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Close
          </button>
          {claimable.length > 0 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !selectedId}
              className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Linking…' : "That's me"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
