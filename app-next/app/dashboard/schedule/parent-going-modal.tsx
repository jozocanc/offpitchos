'use client'

import { useState, useEffect } from 'react'
import { getMyKidsOnTeamForRsvp, getMyExistingRsvps } from './rsvp-actions'
import Modal from '@/components/modal'
import { Skeleton } from '@/components/skeleton'

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
}

// "I'll be there" picker. The schedule confirms a single linked player in
// one tap with no modal, so this only opens when the account has zero or
// several linked roster rows (legacy data). It collects the selection and
// hands it to onSubmit; the schedule does the optimistic save.
export default function ParentGoingModal({
  eventId,
  teamId,
  eventTitle,
  onSubmit,
  onClose,
}: {
  eventId: string
  teamId: string
  eventTitle: string
  onSubmit: (input: { playerIds: string[]; playerCount: number }) => void
  onClose: () => void
}) {
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const playersRes = await getMyKidsOnTeamForRsvp(teamId)
      if (!playersRes.ok) { setLoading(false); return }
      const data = playersRes.data
      setPlayers(data)
      const existingRes = await getMyExistingRsvps(eventId, data.map(k => k.id))
      const existing = existingRes.ok ? existingRes.data : {}
      // Preselect players already marked 'going' so a save doesn't drop them.
      const initial = new Set<string>()
      for (const k of data) {
        if (existing[k.id] === 'going') initial.add(k.id)
      }
      if (initial.size === 0 && data.length === 1) initial.add(data[0].id)
      setSelected(initial)
      setLoading(false)
    }
    load()
  }, [eventId, teamId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    if (selected.size === 0) return
    onSubmit({ playerIds: Array.from(selected), playerCount: players.length })
    onClose()
  }

  return (
    <Modal title="I'll Be There" description={eventTitle} onClose={onClose}>
      {loading ? (
        <div className="space-y-3 mb-6">
          {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : players.length === 0 ? (
        <div className="bg-dark rounded-xl p-6 text-center border border-white/5 mb-6">
          <p className="text-gray text-sm">
            Your account isn&apos;t linked to a player on this team yet. Ask your coach to send you an invite.
          </p>
        </div>
      ) : players.length === 1 ? (
        <p className="text-sm text-gray mb-6">
          Confirm you&apos;ll be there. Your coaches will see it on the schedule.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray uppercase tracking-wide mb-3">
            Who is coming?
          </p>
          <div className="space-y-2 mb-6">
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
                      ? 'border-green/40 bg-green/10'
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
        {players.length > 0 && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.size === 0}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            Confirm
          </button>
        )}
      </div>
    </Modal>
  )
}
