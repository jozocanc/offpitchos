'use client'

import { useState, useEffect, useTransition } from 'react'
import { createCoverageRequest, assignCoverage, getAvailableCoaches } from '../coverage/actions'
import { useToast, networkErrorMessage } from '@/components/toast'
import Modal from '@/components/modal'
import { Skeleton } from '@/components/skeleton'

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
      .then(res => {
        if (!res.ok) return
        const data = res.data
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
        const reqRes = await createCoverageRequest(eventId, userProfileId)
        if (!reqRes.ok) { setError(reqRes.error); return }
        const assignRes = await assignCoverage(reqRes.data.requestId, selectedCoachId)
        if (!assignRes.ok) { setError(assignRes.error); return }
        const coachName = coaches.find(c => c.id === selectedCoachId)?.display_name ?? 'Coach'
        toast(`${coachName} assigned to cover`, 'success')
        onClose()
      } catch {
        setError(networkErrorMessage())
      }
    })
  }

  // Path 2: broadcast to all coaches
  function handleBroadcast() {
    setError(null)
    startTransition(async () => {
      try {
        const bcRes = await createCoverageRequest(eventId, userProfileId)
        if (!bcRes.ok) { setError(bcRes.error); return }
        const result = bcRes.data
        if (result.autoAssigned) {
          toast(`${result.coveringCoachName} auto-assigned to cover`, 'success')
        } else {
          toast('Head coach and staff notified', 'success')
        }
        onClose()
      } catch {
        setError(networkErrorMessage())
      }
    })
  }

  return (
    <Modal
      title="Can't attend"
      onClose={onClose}
      dismissible={!isPending}
      description={isCoach
        ? 'Pick a staff member to cover this session, or notify the head coach and the rest of the staff so someone can step in.'
        : 'Your staff will be notified so someone can step in.'}
    >
        {error && <p role="alert" className="text-red text-sm mb-4">{error}</p>}

        {isCoach && loading && (
          <div className="mb-4 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        )}

        {isCoach && !loading && coaches.length > 0 && (
          <>
            <label htmlFor="cover-coach" className="block text-xs text-gray uppercase tracking-wide mb-2">
              Know who can cover?
            </label>
            <div className="flex gap-2 mb-4">
              <select
                id="cover-coach"
                value={selectedCoachId}
                onChange={e => setSelectedCoachId(e.target.value)}
                className="flex-1 bg-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
              >
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name ?? 'Coach'}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDirectAssign}
                disabled={isPending || !selectedCoachId}
                className="bg-green text-dark font-bold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60"
              >
                {isPending ? 'Assigning…' : 'Assign'}
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
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBroadcast}
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Sending…' : 'Notify the staff'}
          </button>
        </div>
    </Modal>
  )
}
