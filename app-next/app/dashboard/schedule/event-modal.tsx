'use client'

import { useState, useTransition, useEffect } from 'react'
import { EVENT_TYPES, EVENT_TYPE_LABELS, DAYS_OF_WEEK, type EventType } from '@/lib/constants'
import { createEvent, updateEvent } from './actions'
import { checkConflicts, suggestAlternatives } from './conflict-actions'
import type { Conflict, Suggestion } from './conflict-actions'
import ConflictBanner from './conflict-banner'
import SessionPlan from './session-plan'
import { useToast } from '@/components/toast'
import { formatRecipientToast } from '../notification-toast'
import { teamLabel } from '@/lib/team-label'
import {
  type EventTravelFields,
  type TravelInput,
  TRAVEL_MODES,
  TRAVEL_MODE_LABELS,
  hasTravel,
  suggestsTravel,
} from '@/lib/travel'

interface Team {
  id: string
  name: string
  age_group: string
}

interface Venue {
  id: string
  name: string
  address: string | null
}

interface EventData extends EventTravelFields {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  venue_id: string | null
  address: string | null
  link: string | null
  notes: string | null
  recurrence_group: string | null
}

interface EventModalProps {
  teams: Team[]
  venues: Venue[]
  editEvent: EventData | null  // null = creating new
  onClose: () => void
  userRole?: string
}

export default function EventModal({ teams, venues, editEvent, onClose, userRole }: EventModalProps) {
  const isEditing = editEvent !== null

  const [teamId, setTeamId] = useState(editEvent?.team_id ?? teams[0]?.id ?? '')
  const [type, setType] = useState<EventType>((editEvent?.type as EventType) ?? 'practice')
  const [title, setTitle] = useState(editEvent?.title ?? '')
  const [date, setDate] = useState(editEvent ? new Date(editEvent.start_time).toISOString().split('T')[0] : '')
  const [startTime, setStartTime] = useState(editEvent ? formatTimeInput(new Date(editEvent.start_time)) : '')
  const [endTime, setEndTime] = useState(editEvent ? formatTimeInput(new Date(editEvent.end_time)) : '')
  const [venueId, setVenueId] = useState(editEvent?.venue_id ?? '')
  const [address, setAddress] = useState(
    editEvent?.address ?? (editEvent?.venue_id ? (venues.find(v => v.id === editEvent.venue_id)?.address ?? '') : '')
  )
  const [addressTouched, setAddressTouched] = useState(!!editEvent?.address)
  const [link, setLink] = useState(editEvent?.link ?? '')
  const [notes, setNotes] = useState(editEvent?.notes ?? '')
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [recurringDays, setRecurringDays] = useState<number[]>([])
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [updateFuture, setUpdateFuture] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)

  // Travel (away games / tournaments). Browser-local datetime inputs, same
  // convention as the date + time fields above.
  const hadTravel = hasTravel(editEvent)
  const [travelDepartAt, setTravelDepartAt] = useState(toDateTimeLocal(editEvent?.travel_depart_at))
  const [travelDepartLocation, setTravelDepartLocation] = useState(editEvent?.travel_depart_location ?? '')
  const [travelReturnAt, setTravelReturnAt] = useState(toDateTimeLocal(editEvent?.travel_return_at))
  const [travelMode, setTravelMode] = useState(editEvent?.travel_mode ?? '')
  const [travelHotel, setTravelHotel] = useState(editEvent?.travel_hotel ?? '')
  const [travelNotes, setTravelNotes] = useState(editEvent?.travel_notes ?? '')
  // null = follow the away-game heuristic; true/false = the coach chose.
  const [travelChoice, setTravelChoice] = useState<boolean | null>(null)

  // Auto-generate title from team + type
  const selectedTeam = teams.find(t => t.id === teamId)
  const autoTitle = selectedTeam
    ? `${selectedTeam.name} ${EVENT_TYPE_LABELS[type]}`
    : ''

  const travelSuggested = suggestsTravel({ type, title: title || autoTitle, venueId, address })
  const travelFilled = Boolean(
    travelDepartAt || travelDepartLocation.trim() || travelReturnAt || travelMode ||
    travelHotel.trim() || travelNotes.trim(),
  )
  // A recurring series has no single trip, so travel is single-event only.
  const travelAllowed = !recurringEnabled
  const showTravel = travelAllowed && (travelChoice ?? (hadTravel || travelFilled || travelSuggested))

  function clearTravel() {
    setTravelDepartAt('')
    setTravelDepartLocation('')
    setTravelReturnAt('')
    setTravelMode('')
    setTravelHotel('')
    setTravelNotes('')
  }

  // Default departure: 3 hours before kickoff, the usual college away-trip
  // lead time. Only fills an empty field.
  function suggestDeparture() {
    if (!date || !startTime) return
    const kickoff = new Date(`${date}T${startTime}`)
    setTravelDepartAt(toDateTimeLocal(new Date(kickoff.getTime() - 3 * 60 * 60 * 1000).toISOString()))
  }

  // Check for conflicts when scheduling inputs change
  useEffect(() => {
    if (!teamId || !date || !startTime || !endTime) {
      setConflicts([])
      setSuggestions([])
      return
    }

    const timeout = setTimeout(async () => {
      setCheckingConflicts(true)
      try {
        const startISO = new Date(`${date}T${startTime}`).toISOString()
        const endISO = new Date(`${date}T${endTime}`).toISOString()

        const conflictRes = await checkConflicts({
          teamId,
          startTime: startISO,
          endTime: endISO,
          venueId: venueId || null,
          excludeEventId: editEvent?.id,
        })
        if (!conflictRes.ok) return
        const found = conflictRes.data
        setConflicts(found)

        if (found.length > 0) {
          const startDate = new Date(`${date}T${startTime}`)
          const endDate = new Date(`${date}T${endTime}`)
          const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000

          const altRes = await suggestAlternatives({
            teamId,
            venueId: venueId || null,
            date,
            durationMinutes,
          })
          if (altRes.ok) setSuggestions(altRes.data)
        } else {
          setSuggestions([])
        }
      } catch {
        // Silently fail — conflicts are advisory
      } finally {
        setCheckingConflicts(false)
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [teamId, date, startTime, endTime, venueId, editEvent?.id])

  function handleSelectSuggestion(startISO: string, endISO: string) {
    const start = new Date(startISO)
    const end = new Date(endISO)
    setStartTime(start.toTimeString().slice(0, 5))
    setEndTime(end.toTimeString().slice(0, 5))
  }

  function handleSubmit() {
    const finalTitle = title.trim() || autoTitle
    if (!teamId || !date || !startTime || !endTime || !finalTitle) {
      setError('Please fill in all required fields')
      return
    }

    // Construct ISO strings preserving the user's intended local time
    // The browser's Date constructor interprets `YYYY-MM-DDTHH:MM` as local time,
    // so toISOString() converts correctly
    const startISO = new Date(`${date}T${startTime}`).toISOString()
    const endISO = new Date(`${date}T${endTime}`).toISOString()

    if (new Date(endISO) <= new Date(startISO)) {
      setError('End time must be after start time')
      return
    }

    if (recurringEnabled && (recurringDays.length === 0 || !recurringEndDate)) {
      setError('Select at least one day and an end date for recurring events')
      return
    }

    // Travel: sent whenever there is something to save or clear, even if the
    // coach collapsed the section. Otherwise an existing event's stored trip
    // is left untouched (undefined). The server skips no-op changes.
    let travel: TravelInput | null | undefined = isEditing ? undefined : null
    if (travelAllowed && (showTravel || travelFilled || hadTravel)) {
      const departISO = travelDepartAt ? new Date(travelDepartAt).toISOString() : null
      const returnISO = travelReturnAt ? new Date(travelReturnAt).toISOString() : null
      if (departISO && returnISO && new Date(returnISO) <= new Date(departISO)) {
        setError('Return time must be after the departure time')
        return
      }
      travel = {
        departAt: departISO,
        departLocation: travelDepartLocation.trim() || null,
        returnAt: returnISO,
        mode: travelMode || null,
        hotel: travelHotel.trim() || null,
        notes: travelNotes.trim() || null,
      }
    }

    setError(null)

    startTransition(async () => {
      try {
        let counts
        if (isEditing) {
          const updRes = await updateEvent({
            eventId: editEvent.id,
            title: finalTitle,
            startTime: startISO,
            endTime: endISO,
            venueId: venueId || null,
            address: address.trim() || null,
            link: link.trim() || null,
            notes: notes.trim() || null,
            updateFuture,
            travel,
          })
          if (!updRes.ok) { setError(updRes.error); return }
          counts = updRes.data
          toast(
            formatRecipientToast({ action: 'event_updated', ...counts }),
            counts.emailFailed > 0 ? 'error' : 'success',
          )
        } else {
          const crtRes = await createEvent({
            teamId,
            type,
            title: finalTitle,
            startTime: startISO,
            endTime: endISO,
            venueId: venueId || null,
            address: address.trim() || null,
            link: link.trim() || null,
            notes: notes.trim() || null,
            recurring: {
              enabled: recurringEnabled,
              days: recurringDays,
              endDate: recurringEndDate,
            },
            travel,
          })
          if (!crtRes.ok) { setError(crtRes.error); return }
          counts = crtRes.data
          toast(
            formatRecipientToast({ action: 'event_created', ...counts }),
            counts.emailFailed > 0 ? 'error' : 'success',
          )
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function toggleDay(day: number) {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">
          {isEditing ? 'Edit Event' : 'Add Event'}
        </h2>

        {/* Team */}
        {!isEditing && (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Team</label>
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{teamLabel(t.name, t.age_group)}</option>
              ))}
            </select>
          </>
        )}

        {/* Type */}
        {!isEditing && (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as EventType)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
            >
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </>
        )}

        {/* Title */}
        <label className="block text-sm font-medium text-gray mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={autoTitle || 'Event title'}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
        />

        {/* Date */}
        <label className="block text-sm font-medium text-gray mb-2">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors mb-4"
        />

        {/* Time */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">End time</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>

        {/* Venue */}
        <label className="block text-sm font-medium text-gray mb-2">Venue</label>
        <select
          value={venueId}
          onChange={e => {
            const newVenueId = e.target.value
            setVenueId(newVenueId)
            // Auto-fill the address from the selected venue, but don't clobber a manual edit
            if (!addressTouched) {
              const v = venues.find(vv => vv.id === newVenueId)
              setAddress(v?.address ?? '')
            }
          }}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-3"
        >
          <option value="">No venue selected</option>
          {venues.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>

        {/* Address */}
        <label className="block text-sm font-medium text-gray mb-2">
          Address <span className="text-gray/70 font-normal">(optional · opens in Google Maps)</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={e => {
            setAddress(e.target.value)
            setAddressTouched(true)
          }}
          placeholder="e.g. 1700 Bayshore Blvd, Tampa, FL"
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
        />

        {/* Conflict warnings */}
        <div className="mb-4">
          <ConflictBanner
            conflicts={conflicts}
            suggestions={suggestions}
            onSelectSuggestion={handleSelectSuggestion}
            loading={checkingConflicts}
          />
        </div>

        {/* Link */}
        <label className="block text-sm font-medium text-gray mb-2">
          Link (optional)
          {type === 'tournament' && <span className="text-green ml-2 text-xs">Tournament registration or info page</span>}
        </label>
        <input
          type="url"
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="https://..."
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
        />

        {/* Notes */}
        <label className="block text-sm font-medium text-gray mb-2">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional details..."
          rows={2}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4 resize-none"
        />

        {/* Travel — away games and tournaments */}
        {travelAllowed && !showTravel && (
          <button
            type="button"
            onClick={() => setTravelChoice(true)}
            className="w-full mb-4 border border-dashed border-white/15 rounded-xl px-4 py-3 text-sm font-medium text-gray hover:text-green hover:border-green/40 transition-colors text-left"
          >
            + Add travel details
          </button>
        )}
        {showTravel && (
          <div className="mb-4 rounded-xl border border-green/20 bg-green/5 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-bold">Travel</p>
                <p className="text-xs text-gray mt-0.5">Players and staff see this on the event and get a notification when it changes.</p>
              </div>
              <button
                type="button"
                onClick={() => setTravelChoice(false)}
                className="text-xs text-gray hover:text-white transition-colors shrink-0"
              >
                Hide
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="travel-depart" className="block text-xs font-medium text-gray">Departs</label>
                  {!travelDepartAt && date && startTime && (
                    <button type="button" onClick={suggestDeparture} className="text-[11px] font-semibold text-green hover:opacity-80">
                      3h before start
                    </button>
                  )}
                </div>
                <input
                  id="travel-depart"
                  type="datetime-local"
                  value={travelDepartAt}
                  onChange={e => setTravelDepartAt(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green transition-colors"
                />
              </div>
              <div>
                <label htmlFor="travel-mode" className="block text-xs font-medium text-gray mb-1.5">Transport</label>
                <select
                  id="travel-mode"
                  value={travelMode}
                  onChange={e => setTravelMode(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
                >
                  <option value="">Select</option>
                  {TRAVEL_MODES.map(m => (
                    <option key={m} value={m}>{TRAVEL_MODE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
            </div>

            <label htmlFor="travel-from" className="block text-xs font-medium text-gray mb-1.5">Departs from</label>
            <input
              id="travel-from"
              type="text"
              value={travelDepartLocation}
              onChange={e => setTravelDepartLocation(e.target.value)}
              placeholder="e.g. Field house parking lot"
              maxLength={200}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-3"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label htmlFor="travel-return" className="block text-xs font-medium text-gray mb-1.5">Returns (approx.)</label>
                <input
                  id="travel-return"
                  type="datetime-local"
                  value={travelReturnAt}
                  min={travelDepartAt || undefined}
                  onChange={e => setTravelReturnAt(e.target.value)}
                  className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green transition-colors"
                />
              </div>
              <div>
                <label htmlFor="travel-hotel" className="block text-xs font-medium text-gray mb-1.5">
                  Hotel <span className="text-gray/70 font-normal">(optional)</span>
                </label>
                <input
                  id="travel-hotel"
                  type="text"
                  value={travelHotel}
                  onChange={e => setTravelHotel(e.target.value)}
                  placeholder="e.g. Hampton Inn"
                  maxLength={200}
                  className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
                />
              </div>
            </div>

            <label htmlFor="travel-notes" className="block text-xs font-medium text-gray mb-1.5">Itinerary and notes</label>
            <textarea
              id="travel-notes"
              value={travelNotes}
              onChange={e => setTravelNotes(e.target.value)}
              placeholder={'Meal stops, dress code, what to bring.\ne.g. 11:30 team lunch at Cracker Barrel. Travel polo and khakis. Both kits, ID, pillow.'}
              rows={4}
              maxLength={4000}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors resize-y"
            />

            {travelFilled && (
              <button
                type="button"
                onClick={clearTravel}
                className="mt-2 text-xs text-red hover:opacity-80 transition-opacity"
              >
                Remove travel details
              </button>
            )}
          </div>
        )}

        {/* Session plan — doc/coach only, editing existing events */}
        {isEditing && (userRole === 'doc' || userRole === 'coach') && (() => {
          const durationFromStartEnd =
            startTime && endTime
              ? Math.round(
                  (new Date(`${date}T${endTime}`).getTime() - new Date(`${date}T${startTime}`).getTime()) / 60000
                )
              : undefined
          return (
            <SessionPlan
              eventId={editEvent!.id}
              eventDurationMin={durationFromStartEnd && durationFromStartEnd > 0 ? durationFromStartEnd : undefined}
            />
          )
        })()}

        {/* Recurring (create only) */}
        {!isEditing && (
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={recurringEnabled}
                onChange={e => setRecurringEnabled(e.target.checked)}
                className="w-4 h-4 accent-green"
              />
              <span className="text-sm font-medium">Recurring event</span>
            </label>

            {recurringEnabled && (
              <div className="pl-7 space-y-3">
                <div>
                  <label className="block text-sm text-gray mb-2">Repeat on</label>
                  <div className="flex gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                          recurringDays.includes(day.value)
                            ? 'bg-green text-dark'
                            : 'bg-dark border border-white/10 text-gray hover:text-white'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray mb-2">Until</label>
                  <input
                    type="date"
                    value={recurringEndDate}
                    onChange={e => setRecurringEndDate(e.target.value)}
                    className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit future toggle (edit recurring only) */}
        {isEditing && editEvent?.recurrence_group && (
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={updateFuture}
              onChange={e => setUpdateFuture(e.target.checked)}
              className="w-4 h-4 accent-green"
            />
            <span className="text-sm font-medium">Apply to all future events in this series</span>
          </label>
        )}

        {error && <p className="text-red text-sm mb-4">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// ISO timestamp -> "YYYY-MM-DDTHH:MM" in the browser's zone, for
// <input type="datetime-local">. Browser-local to match the date/time fields.
function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
