'use client'

import { useState, useEffect, useTransition } from 'react'
import { getMyKidsOnTeam, parentExcuseChildren } from './attendance-actions'
import { useToast } from '@/components/toast'

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
}

// Player-facing "I can't make it" modal. Loads the player row(s) linked
// to the viewer's account on this event's team. A player normally has
// exactly one linked row, in which case it is acted on directly with no
// picker. If several rows are linked (legacy data) a checkbox list is
// shown instead. On submit, marks the selected player(s) as "excused" in
// the attendance table and pushes a notification to the team's coaches
// with the optional reason.
export default function ParentCantAttendModal({
  eventId,
  teamId,
  eventTitle,
  onClose,
}: {
  eventId: string
  teamId: string
  eventTitle: string
  onClose: () => void
}) {
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    getMyKidsOnTeam(teamId)
      .then(res => {
        if (!res.ok) return
        const data = res.data
        setPlayers(data)
        // One linked player (the normal case): act on it directly.
        if (data.length === 1) setSelected(new Set([data[0].id]))
      })
      .finally(() => setLoading(false))
  }, [teamId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    if (selected.size === 0) {
      toast('Select at least one player', 'error')
      return
    }
    startTransition(async () => {
      try {
        const excuseRes = await parentExcuseChildren({
          eventId,
          teamId,
          playerIds: Array.from(selected),
          reason,
        })
        if (!excuseRes.ok) { toast(excuseRes.error, 'error'); return }
        const result = excuseRes.data
        const parts = [players.length === 1 ? 'Marked as not attending' : `${result.excused} marked excused`]
        if (result.notifiedCoaches > 0) {
          parts.push(`coach${result.notifiedCoaches === 1 ? '' : 'es'} notified`)
        }
        toast(parts.join(' · '), 'success')
        onClose()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to excuse'
        toast(msg, 'error')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-2">I Can&apos;t Make It</h2>
        <p className="text-gray text-sm mb-6">{eventTitle}</p>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2].map(i => <div key={i} className="h-12 bg-dark rounded-xl" />)}
          </div>
        ) : players.length === 0 ? (
          <div className="bg-dark rounded-xl p-6 text-center border border-white/5 mb-6">
            <p className="text-gray text-sm">
              Your account isn&apos;t linked to a player on this team yet. Ask your coach to send you an invite.
            </p>
          </div>
        ) : players.length === 1 ? (
          <>
            <p className="text-sm text-gray mb-4">
              Your coaches will be notified that you can&apos;t make it.
            </p>
            <label className="block text-xs text-gray uppercase tracking-wide mb-2">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Class conflict, injury, travel"
              maxLength={200}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-6"
            />
          </>
        ) : (
          <>
            <p className="text-xs text-gray uppercase tracking-wide mb-3">
              Who can&apos;t make it?
            </p>
            <div className="space-y-2 mb-4">
              {players.map(p => {
                const isSelected = selected.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    disabled={isPending}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-green/40 bg-green/5'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    {p.jersey_number !== null ? (
                      <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                        <span className="text-green font-bold text-xs">{p.jersey_number}</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className="text-gray font-bold text-xs">{p.first_name.charAt(0)}</span>
                      </div>
                    )}
                    <span className="text-sm font-medium flex-1">{p.first_name} {p.last_name}</span>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center ${
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

            <label className="block text-xs text-gray uppercase tracking-wide mb-2">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Class conflict, injury, travel"
              maxLength={200}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-6"
            />
          </>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          {players.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={isPending || selected.size === 0}
              className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Sending...' : 'Notify Coach'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
