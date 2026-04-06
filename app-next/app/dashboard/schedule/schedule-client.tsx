'use client'

import { useState, useTransition } from 'react'
import { ROLES } from '@/lib/constants'
import type { EventType } from '@/lib/constants'
import Filters from './filters'
import AgendaView from './agenda-view'
import CalendarView from './calendar-view'
import EventModal from './event-modal'
import CantAttendModal from './cant-attend-modal'
import AttendanceModal from './attendance-modal'
import { cancelEvent } from './actions'

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
  recurrence_group: string | null
  teams: { name: string; age_group: string }[] | null
  venues: { name: string }[] | null
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
    profiles: any
  }>
  userProfileId: string
}

export default function ScheduleClient({ events, teams, venues, userRole, coverageRequests, userProfileId }: ScheduleClientProps) {
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda')
  const [filterTeam, setFilterTeam] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<EventType | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [cantAttendEventId, setCantAttendEventId] = useState<string | null>(null)
  const [attendanceEvent, setAttendanceEvent] = useState<{ eventId: string; teamId: string; title: string } | null>(null)
  const [, startTransition] = useTransition()

  const canEdit = userRole === ROLES.DOC || userRole === ROLES.COACH

  // Apply filters
  const filtered = events.filter(e => {
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
      await cancelEvent(eventId)
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

  function handleAddAtDate(_date: string) {
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
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
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

          {canEdit && (
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
          onAttendance={canEdit ? handleAttendance : undefined}
          canEdit={canEdit}
          coverageRequests={coverageRequests}
          userRole={userRole}
          userProfileId={userProfileId}
        />
      ) : (
        <CalendarView
          events={filtered}
          onEdit={handleEdit}
          onAddAtDate={handleAddAtDate}
        />
      )}

      {/* Can't Attend Modal */}
      {cantAttendEventId && (
        <CantAttendModal
          eventId={cantAttendEventId}
          userProfileId={userProfileId}
          userRole={userRole}
          onClose={() => setCantAttendEventId(null)}
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
