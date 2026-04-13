'use client'

import { useState, useTransition } from 'react'
import { createCamp } from './actions'
import { useToast } from '@/components/toast'

interface Team {
  id: string
  name: string
  age_group: string
}

interface Venue {
  id: string
  name: string
}

// Inline "Create Camp" — replaces the old "+ Create Camp" link that dumped the
// DOC onto /dashboard/schedule and made them come back to set fee/capacity.
// This modal does both in one submit and uses the existing notification path
// to tell parents a new camp is open for registration.
export default function CreateCampModal({
  teams,
  venues,
  onClose,
}: {
  teams: Team[]
  venues: Venue[]
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [teamId, setTeamId] = useState('')
  // Sensible defaults: starts tomorrow 9am, ends 12pm, so the DOC only has to
  // change the date rather than fill out 4 fields for the common case.
  const [date, setDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().slice(0, 10)
  })
  const [startHour, setStartHour] = useState('09:00')
  const [endHour, setEndHour] = useState('12:00')
  const [venueId, setVenueId] = useState('')
  const [address, setAddress] = useState('')
  const [fee, setFee] = useState('')
  const [capacity, setCapacity] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!teamId) {
      toast('Pick a team first', 'error')
      return
    }

    // Combine the date + time fields into ISO strings. We use the user's local
    // zone because the server stores timestamptz; the DB handles conversion.
    const startLocal = new Date(`${date}T${startHour}`)
    const endLocal = new Date(`${date}T${endHour}`)
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) {
      toast('Invalid date/time', 'error')
      return
    }
    if (endLocal <= startLocal) {
      toast('End time must be after start time', 'error')
      return
    }

    const feeCents = Math.round(parseFloat(fee || '0') * 100)
    const cap = capacity ? parseInt(capacity, 10) : null
    if (cap !== null && (Number.isNaN(cap) || cap < 1)) {
      toast('Capacity must be at least 1', 'error')
      return
    }

    startTransition(async () => {
      try {
        await createCamp({
          title: title.trim(),
          teamId: teamId || null,
          startTime: startLocal.toISOString(),
          endTime: endLocal.toISOString(),
          venueId: venueId || null,
          address: address.trim() || null,
          feeCents,
          capacity: cap,
          description: description.trim() || null,
          notes: notes.trim() || null,
        })
        toast('Camp created — parents notified', 'success')
        onClose()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create camp'
        toast(msg, 'error')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-bold mb-6">New Camp</h2>

        <label className="block text-sm font-medium text-gray mb-2">Title</label>
        <input
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Summer Skills Camp"
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
        />

        <label className="block text-sm font-medium text-gray mb-2">Team (optional)</label>
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors mb-4"
        >
          <option value="">Club-wide (no specific team)</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.age_group})
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray mb-2">Open to</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Boys ages 5-13, Girls U10-U12, All players 8-14"
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
        />

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Start</label>
            <input
              type="time"
              required
              value={startHour}
              onChange={e => setStartHour(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">End</label>
            <input
              type="time"
              required
              value={endHour}
              onChange={e => setEndHour(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>

        <label className="block text-sm font-medium text-gray mb-2">Venue (optional)</label>
        {venues.length > 0 ? (
          <select
            value={venueId}
            onChange={e => setVenueId(e.target.value)}
            className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors mb-4"
          >
            <option value="">— None —</option>
            {venues.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Address"
            className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
          />
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Fee ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fee}
              onChange={e => setFee(e.target.value)}
              placeholder="0.00"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Capacity</label>
            <input
              type="number"
              min="1"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              placeholder="Unlimited"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>

        <label className="block text-sm font-medium text-gray mb-2">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Equipment to bring, meeting point, etc."
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-6 resize-none"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || teams.length === 0}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isPending ? 'Creating…' : 'Create Camp'}
          </button>
        </div>
      </form>
    </div>
  )
}
