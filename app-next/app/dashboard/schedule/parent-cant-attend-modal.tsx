'use client'

import { useState, useEffect } from 'react'
import { getMyKidsOnTeam } from './attendance-actions'
import Modal from '@/components/modal'
import { Skeleton } from '@/components/skeleton'

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
}

// Player-facing "I can't make it" modal. A player normally has exactly one
// linked roster row; the schedule passes it in (knownPlayerIds) so the
// modal opens straight to the optional reason with no loading step. With
// several linked rows (legacy data) it loads them and shows a picker.
//
// The modal only collects input. onSubmit hands it to the schedule, which
// flips the card to "You can't make it" right away, saves in the
// background and rolls back with a toast if the save fails.
export default function ParentCantAttendModal({
  teamId,
  eventTitle,
  knownPlayerIds,
  onSubmit,
  onClose,
}: {
  eventId: string
  teamId: string
  eventTitle: string
  knownPlayerIds?: string[]
  onSubmit: (input: { playerIds: string[]; reason: string; playerCount: number }) => void
  onClose: () => void
}) {
  const single = knownPlayerIds?.length === 1
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(single ? knownPlayerIds : []))
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(!single)

  useEffect(() => {
    if (single) return
    getMyKidsOnTeam(teamId)
      .then(res => {
        if (!res.ok) return
        const data = res.data
        setPlayers(data)
        if (data.length === 1) setSelected(new Set([data[0].id]))
      })
      .finally(() => setLoading(false))
  }, [teamId, single])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const playerCount = single ? 1 : players.length
  const canSubmit = selected.size > 0

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    onSubmit({ playerIds: Array.from(selected), reason: reason.trim(), playerCount })
    onClose()
  }

  const reasonField = (
    <>
      <label htmlFor="cant-reason" className="block text-xs text-gray uppercase tracking-wide mb-2">
        Reason (optional)
      </label>
      <input
        id="cant-reason"
        type="text"
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. Class conflict, injury, travel"
        maxLength={200}
        autoFocus
        className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-base sm:text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-6"
      />
    </>
  )

  return (
    <Modal title="I Can't Make It" description={eventTitle} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {loading ? (
          <div className="space-y-3 mb-6">
            {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : playerCount === 0 ? (
          <div className="bg-dark rounded-xl p-6 text-center border border-white/5 mb-6">
            <p className="text-gray text-sm">
              Your account isn&apos;t linked to a player on this team yet. Ask your coach to send you an invite.
            </p>
          </div>
        ) : playerCount === 1 ? (
          <>
            <p className="text-sm text-gray mb-4">
              Your coaches will be notified that you can&apos;t make it.
            </p>
            {reasonField}
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
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggle(p.id)}
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
                      aria-hidden="true"
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
            {reasonField}
          </>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          {playerCount > 0 && !loading && (
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              Notify the staff
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
