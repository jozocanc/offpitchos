'use client'

import { useState, useEffect, useTransition } from 'react'
import { createCoverageRequest, assignCoverage, getAvailableCoaches } from '../coverage/actions'
import { useToast } from '@/components/toast'

interface CantAttendModalProps {
  eventId: string
  userProfileId: string
  userRole: string
  onClose: () => void
}

// Two-path "Can't Attend" for coaches:
//   1. "I know who can cover" → pick a coach from the dropdown → direct assign
//   2. "Send to all coaches" → broadcast, let the system auto-assign or wait for volunteers
//
// DOCs always get path 2 (they'd use the Coverage page to manually assign).

export default function CantAttendModal({ eventId, userProfileId, userRole, onClose }: CantAttendModalProps) {
  const [coaches, setCoaches] = useState<Array<{ id: string; display_name: string | null }>>([])
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const isCoach = userRole === 'coach'

  useEffect(() => {
    if (!isCoach) {
      setLoading(false)
      return
    }
    getAvailableCoaches()
      .then(data => {
        setCoaches(data)
        if (data.length > 0) setSelectedCoachId(data[0].id)
      })
      .finally(() => setLoading(false))
  }, [isCoach])

  // Path 1: directly assign a specific coach
  function handleDirectAssign() {
    if (!selectedCoachId) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await createCoverageRequest(eventId, userProfileId)
        await assignCoverage(result.requestId, selectedCoachId)
        const coachName = coaches.find(c => c.id === selectedCoachId)?.display_name ?? 'Coach'
        toast(`${coachName} assigned to cover`, 'success')
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  // Path 2: broadcast to all coaches
  function handleBroadcast() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await createCoverageRequest(eventId, userProfileId)
        if (result.autoAssigned) {
          toast(`${result.coveringCoachName} auto-assigned to cover`, 'success')
        } else {
          toast('Coverage request sent to all coaches', 'success')
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-2">Can&apos;t Attend</h2>
        <p className="text-gray text-sm mb-6">
          {isCoach
            ? 'Assign a replacement directly, or send the request to all coaches in the club.'
            : 'A coverage request will be sent to all other coaches in your club. If no one accepts, the DOC will be notified.'}
        </p>

        {error && <p className="text-red text-sm mb-4">{error}</p>}

        {isCoach && !loading && coaches.length > 0 && (
          <>
            <label className="block text-xs text-gray uppercase tracking-wide mb-2">
              Know who can cover?
            </label>
            <div className="flex gap-2 mb-4">
              <select
                value={selectedCoachId}
                onChange={e => setSelectedCoachId(e.target.value)}
                className="flex-1 bg-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
              >
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name ?? 'Coach'}</option>
                ))}
              </select>
              <button
                onClick={handleDirectAssign}
                disabled={isPending || !selectedCoachId}
                className="bg-green text-dark font-bold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60"
              >
                {isPending ? '...' : 'Assign'}
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-gray">or</span>
              <div className="flex-1 h-px bg-white/10" />
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
          <button
            onClick={handleBroadcast}
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Sending...' : 'Send to all coaches'}
          </button>
        </div>
      </div>
    </div>
  )
}
