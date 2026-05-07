'use client'

import { useState, useEffect, useTransition } from 'react'
import { getMyKidsOnTeamForRsvp, getMyExistingRsvps, parentRsvp, type RsvpResponse } from './rsvp-actions'
import { useToast } from '@/components/toast'

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
}

// Mirror of ParentCantAttendModal but for the positive flow. Submitting
// writes to event_rsvps as 'going' and lets the parent flip a kid to
// 'not_going' inline if plans change.
export default function ParentGoingModal({
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
  const [kids, setKids] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    async function load() {
      const data = await getMyKidsOnTeamForRsvp(teamId)
      setKids(data)
      const existing = await getMyExistingRsvps(eventId, data.map(k => k.id))
      // Preselect kids already marked 'going' so a save doesn't blow them
      // away. New kids default to selected when there's only one — same
      // shortcut as the can't-attend modal.
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

  function handleSubmit(response: RsvpResponse) {
    if (selected.size === 0) {
      toast('Select at least one child', 'error')
      return
    }
    startTransition(async () => {
      try {
        const result = await parentRsvp({
          eventId,
          teamId,
          playerIds: Array.from(selected),
          response,
        })
        const verb = response === 'going' ? 'confirmed' : 'marked not going'
        const parts = [`${result.saved} ${verb}`]
        if (result.notifiedCoaches > 0) {
          parts.push(`coach${result.notifiedCoaches === 1 ? '' : 'es'} notified`)
        }
        toast(parts.join(' · '), 'success')
        onClose()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save RSVP'
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
        <h2 className="text-xl font-bold mb-2">We&apos;ll Be There</h2>
        <p className="text-gray text-sm mb-6">{eventTitle}</p>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2].map(i => <div key={i} className="h-12 bg-dark rounded-xl" />)}
          </div>
        ) : kids.length === 0 ? (
          <div className="bg-dark rounded-xl p-6 text-center border border-white/5 mb-6">
            <p className="text-gray text-sm">
              No kids linked to your account on this team. Claim your children from the dashboard first.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray uppercase tracking-wide mb-3">
              {kids.length === 1 ? 'Your child' : 'Which children are coming?'}
            </p>
            <div className="space-y-2 mb-6">
              {kids.map(kid => {
                const isSelected = selected.has(kid.id)
                return (
                  <button
                    key={kid.id}
                    onClick={() => toggle(kid.id)}
                    disabled={isPending}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-green/40 bg-green/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    {kid.jersey_number !== null ? (
                      <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                        <span className="text-green font-bold text-xs">{kid.jersey_number}</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className="text-gray font-bold text-xs">{kid.first_name.charAt(0)}</span>
                      </div>
                    )}
                    <span className="text-sm font-medium flex-1">{kid.first_name} {kid.last_name}</span>
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
          </>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          {kids.length > 0 && (
            <button
              onClick={() => handleSubmit('going')}
              disabled={isPending || selected.size === 0}
              className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Saving...' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
