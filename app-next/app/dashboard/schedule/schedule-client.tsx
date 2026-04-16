'use client'

import { useState, useTransition, useEffect } from 'react'
import { ROLES } from '@/lib/constants'
import type { EventType } from '@/lib/constants'
import Filters from './filters'
import { useVoiceFocus } from '@/components/voice-context'
import AgendaView from './agenda-view'
import CalendarView from './calendar-view'
import EventModal from './event-modal'
import CantAttendModal from './cant-attend-modal'
import ParentCantAttendModal from './parent-cant-attend-modal'
import AttendanceModal from './attendance-modal'
import { cancelEvent, getPastEvents } from './actions'
import { useToast } from '@/components/toast'

interface Event {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  venue_id: string | null
  address: string | null
  link: string | null
  recurrence_group: string | null
  teams: { name: string; age_group: string }[] | null
  venues: { name: string; address: string | null }[] | null
}

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

interface ScheduleClientProps {
  events: Event[]
  teams: Team[]
  venues: Venue[]
  userRole: string
  coverageRequests: Array<{
    id: string
    event_id: string
    status: string
    covering_coach_id: string | null
    unavailable_coach_id: string
    profiles: any  // eslint-disable-line @typescript-eslint/no-explicit-any
  }>
  coachesByTeam?: Record<string, string[]>
  userProfileId: string
  initialTeamFilter?: string | null
  initialHighlight?: string | null
}

export default function ScheduleClient({ events, teams, venues, userRole, coverageRequests, coachesByTeam, userProfileId, initialTeamFilter = null, initialHighlight = null }: ScheduleClientProps) {
  const { toast } = useToast()
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda')
  const [filterTeam, setFilterTeam] = useState<string | null>(initialTeamFilter)
  const [filterType, setFilterType] = useState<EventType | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [cantAttendEventId, setCantAttendEventId] = useState<string | null>(null)
  const [parentCantAttendEvent, setParentCantAttendEvent] = useState<{ eventId: string; teamId: string; title: string } | null>(null)
  const [attendanceEvent, setAttendanceEvent] = useState<{ eventId: string; teamId: string; title: string } | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [pastEvents, setPastEvents] = useState<Event[]>([])
  const [loadingPast, setLoadingPast] = useState(false)
  // Past events that still have zero attendance rows — used by the agenda
  // view to paint an "Unmarked" badge so the coach can spot forgotten
  // sessions without digging into each event individually.
  const [unmarkedPastEventIds, setUnmarkedPastEventIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  // Share schedule state with the voice command so "cancel this practice"
  // / "move these to Tuesday" works. Cleared on unmount.
  const { setFocus, clearFocus } = useVoiceFocus()
  useEffect(() => {
    setFocus({ teamId: filterTeam, eventId: editEvent?.id ?? initialHighlight ?? null })
    return () => clearFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTeam, editEvent?.id, initialHighlight])

  const canEdit = userRole === ROLES.DOC || userRole === ROLES.COACH
  const canCreate = userRole === ROLES.DOC
  const isParent = userRole === ROLES.PARENT

  // Scroll to and flash-highlight an event when arriving via "Needs your attention".
  // Agenda is the default view and the only one that renders scrollable event
  // cards, so we don't force-switch views here (which would trip React 19's
  // set-state-in-effect rule).
  useEffect(() => {
    if (!initialHighlight) return
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-event-id="${initialHighlight}"]`) as HTMLElement | null
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('attention-highlight')
      setTimeout(() => el.classList.remove('attention-highlight'), 3200)
    }, 100)
    return () => clearTimeout(t)
  }, [initialHighlight])

  async function togglePast() {
    if (!showPast && pastEvents.length === 0) {
      setLoadingPast(true)
      const past = await getPastEvents()
      setPastEvents(past.events as Event[])
      setUnmarkedPastEventIds(new Set(past.unmarkedEventIds))
      setLoadingPast(false)
    }
    setShowPast(!showPast)
  }

  const allEvents = showPast ? [...pastEvents, ...events] : events

  // Apply filters
  const filtered = allEvents.filter(e => {
    if (filterTeam && e.team_id !== filterTeam) return false
    if (filterType && e.type !== filterType) return false
    return true
  })

  function handleEdit(eventId: string) {
    const event = events.find(e => e.id === eventId)
    if (event) {
      setEditEvent(event)
      setModalOpen(true)
    }
  }

  function handleCancel(eventId: string) {
    if (!confirm('Cancel this event? Coaches and parents will be notified.')) return
    startTransition(async () => {
      try {
        await cancelEvent(eventId)
        toast('Event cancelled · parents notified', 'success')
      } catch {
        toast('Failed to cancel event', 'error')
      }
    })
  }

  function handleAttendance(eventId: string, teamId: string) {
    const event = events.find(e => e.id === eventId)
    setAttendanceEvent({ eventId, teamId, title: event?.title ?? '' })
  }

  function handleAddNew() {
    setEditEvent(null)
    setModalOpen(true)
  }

  function handleAddAtDate() {
    // Ignores the clicked date for now — the modal defaults to today and
    // the DOC adjusts from there. Calendar view still provides the click
    // context so this handler can use it in a future iteration.
    setEditEvent(null)
    setModalOpen(true)
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Schedule</h1>
          <p className="text-gray text-sm mt-1">
            {filtered.length} upcoming event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Past toggle */}
          <button
            onClick={togglePast}
            className={`px-3 py-2 text-sm font-medium rounded-xl border transition-colors ${
              showPast ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 text-gray hover:text-white'
            }`}
            disabled={loadingPast}
          >
            {loadingPast ? 'Loading...' : showPast ? 'Hide Past' : 'Show Past'}
          </button>

          {/* View toggle */}
          <div className="flex bg-dark rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setView('agenda')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'agenda' ? 'bg-green text-dark' : 'text-gray hover:text-white'
              }`}
            >
              Agenda
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'calendar' ? 'bg-green text-dark' : 'text-gray hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>

          {canCreate && (
            <button
              onClick={handleAddNew}
              className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
            >
              + Add Event
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <Filters
          teams={teams}
          selectedTeam={filterTeam}
          selectedType={filterType}
          onTeamChange={setFilterTeam}
          onTypeChange={setFilterType}
        />
      </div>

      {/* View */}
      {view === 'agenda' ? (
        <AgendaView
          events={filtered}
          onEdit={handleEdit}
          onCancel={handleCancel}
          onCantAttend={canEdit ? setCantAttendEventId : undefined}
          onParentCantAttend={isParent ? ((eventId: string, teamId: string) => {
            const ev = [...events, ...pastEvents].find(e => e.id === eventId)
            setParentCantAttendEvent({ eventId, teamId, title: ev?.title ?? '' })
          }) : undefined}
          onAttendance={canEdit ? handleAttendance : undefined}
          canEdit={canEdit}
          coverageRequests={coverageRequests}
          userRole={userRole}
          userProfileId={userProfileId}
          unmarkedEventIds={unmarkedPastEventIds}
          coachesByTeam={coachesByTeam}
        />
      ) : (
        <CalendarView
          events={filtered}
          onEdit={handleEdit}
          onAddAtDate={handleAddAtDate}
        />
      )}

      {/* Coach: Can't Attend → coverage request */}
      {cantAttendEventId && (
        <CantAttendModal
          eventId={cantAttendEventId}
          userProfileId={userProfileId}
          userRole={userRole}
          onClose={() => setCantAttendEventId(null)}
        />
      )}

      {/* Parent: Can't Attend → excuse kids + notify coach */}
      {parentCantAttendEvent && (
        <ParentCantAttendModal
          eventId={parentCantAttendEvent.eventId}
          teamId={parentCantAttendEvent.teamId}
          eventTitle={parentCantAttendEvent.title}
          onClose={() => setParentCantAttendEvent(null)}
        />
      )}

      {/* Attendance Modal */}
      {attendanceEvent && (
        <AttendanceModal
          eventId={attendanceEvent.eventId}
          teamId={attendanceEvent.teamId}
          eventTitle={attendanceEvent.title}
          onClose={() => setAttendanceEvent(null)}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <EventModal
          teams={teams}
          venues={venues}
          editEvent={editEvent}
          onClose={() => { setModalOpen(false); setEditEvent(null) }}
        />
      )}
    </>
  )
}
