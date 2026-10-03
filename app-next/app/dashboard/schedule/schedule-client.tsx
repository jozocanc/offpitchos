'use client'

import { useState, useTransition, useEffect, useOptimistic, startTransition as startRsvpTransition } from 'react'
import { ROLES, isMember } from '@/lib/constants'
import type { EventType } from '@/lib/constants'
import Filters from './filters'
import { useVoiceFocus } from '@/components/voice-context'
import AgendaView from './agenda-view'
import CalendarView from './calendar-view'
import EventModal from './event-modal'
import CantAttendModal from './cant-attend-modal'
import ParentCantAttendModal from './parent-cant-attend-modal'
import ParentGoingModal from './parent-going-modal'
import AttendanceModal from './attendance-modal'
import { cancelEvent, restoreEvent, getPastEvents } from './actions'
import { useToast, isPreviewBlocked, networkErrorMessage } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'
import { getMyRsvpState, parentRsvp, type RsvpResponse } from './rsvp-actions'
import { parentExcuseChildren } from './attendance-actions'
import type { ActionResult } from '@/lib/action-result'
import { formatRecipientToast } from '../notification-toast'
import type { EventTravelFields } from '@/lib/travel'
import { getGameScores, type GameReportChip } from './game-report-actions'
import { getSharedGamePlanIds } from './game-plan-actions'

interface Event extends EventTravelFields {
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
  rsvpTallies?: Record<string, { going: number; notGoing: number; totalKids: number }>
  matchSheets?: Record<string, boolean>
}

export default function ScheduleClient({ events, teams, venues, userRole, coverageRequests, coachesByTeam, userProfileId, initialTeamFilter = null, initialHighlight = null, rsvpTallies, matchSheets }: ScheduleClientProps) {
  const { toast } = useToast()
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda')
  const [filterTeam, setFilterTeam] = useState<string | null>(initialTeamFilter)
  const [filterType, setFilterType] = useState<EventType | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [cantAttendEventId, setCantAttendEventId] = useState<string | null>(null)
  const [parentCantAttendEvent, setParentCantAttendEvent] = useState<{ eventId: string; teamId: string; title: string } | null>(null)
  const [parentGoingEvent, setParentGoingEvent] = useState<{ eventId: string; teamId: string; title: string } | null>(null)
  const [attendanceEvent, setAttendanceEvent] = useState<{ eventId: string; teamId: string; title: string } | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [pastEvents, setPastEvents] = useState<Event[]>([])
  const [loadingPast, setLoadingPast] = useState(false)
  // Past events that still have zero attendance rows — used by the agenda
  // view to paint an "Unmarked" badge so the coach can spot forgotten
  // sessions without digging into each event individually.
  const [unmarkedPastEventIds, setUnmarkedPastEventIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const { confirm, dialog: confirmDialog } = useConfirm()

  // ---- Player RSVP state (optimistic) ----
  // Confirmed answers from the server; null until the first load returns.
  const [myRsvps, setMyRsvps] = useState<Record<string, RsvpResponse> | null>(null)
  const [playersByTeam, setPlayersByTeam] = useState<Record<string, string[]>>({})
  // Optimistic overlay: a tap paints the new answer at once and React drops
  // the overlay when the save's transition ends. On success the confirmed
  // map is updated inside the transition, so nothing flickers; on failure
  // the card falls back to the previous answer by itself.
  const [shownRsvps, setShownRsvp] = useOptimistic(
    myRsvps,
    (state, u: { eventId: string; response: RsvpResponse }) => ({ ...(state ?? {}), [u.eventId]: u.response }),
  )
  const [pendingRsvpIds, markRsvpPending] = useOptimistic(
    new Set<string>(),
    (state, eventId: string) => new Set(state).add(eventId),
  )

  // Share schedule state with the voice command so "cancel this practice"
  // / "move these to Tuesday" works. Cleared on unmount.
  const { setFocus, clearFocus } = useVoiceFocus()
  useEffect(() => {
    setFocus({ teamId: filterTeam, eventId: editEvent?.id ?? initialHighlight ?? null })
    return () => clearFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTeam, editEvent?.id, initialHighlight])

  const canEdit = userRole === ROLES.DOC || userRole === ROLES.COACH
  const canCreate = canEdit
  // Players (and legacy 'parent' rows) get the member RSVP buttons.
  const isPlayer = isMember(userRole)

  // Scroll to and flash-highlight an event when arriving via "Needs your attention".
  // Agenda is the default view and the only one that renders scrollable event
  // cards, so we don't force-switch views here (which would trip React 19's
  // set-state-in-effect rule).
  // A past event (e.g. "Mark attendance" for last night's game) isn't in the
  // upcoming list, so past events are loaded and shown first.
  useEffect(() => {
    if (!initialHighlight) return
    let cancelled = false
    const flash = () => {
      const el = document.querySelector(`[data-event-id="${initialHighlight}"]`) as HTMLElement | null
      if (!el) return false
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('attention-highlight')
      setTimeout(() => el.classList.remove('attention-highlight'), 3200)
      return true
    }
    const t = setTimeout(async () => {
      if (flash() || events.some(e => e.id === initialHighlight)) return
      const pastRes = await getPastEvents()
      if (cancelled || !pastRes.ok) return
      setPastEvents(pastRes.data.events as Event[])
      setUnmarkedPastEventIds(new Set(pastRes.data.unmarkedEventIds))
      setPastLoaded(true)
      setShowPast(true)
      setTimeout(() => { if (!cancelled) flash() }, 150)
    }, 100)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHighlight])

  // The calendar always shows whole months, so it needs past events loaded
  // whether or not the agenda's Show Past is on.
  const [pastLoaded, setPastLoaded] = useState(false)
  async function ensurePastLoaded() {
    if (pastLoaded || pastEvents.length > 0) return
    const pastRes = await getPastEvents()
    if (!pastRes.ok) { toast(pastRes.error, 'error'); return }
    setPastEvents(pastRes.data.events as Event[])
    setUnmarkedPastEventIds(new Set(pastRes.data.unmarkedEventIds))
    setPastLoaded(true)
  }

  async function togglePast() {
    if (!showPast && pastEvents.length === 0) {
      setLoadingPast(true)
      const pastRes = await getPastEvents().catch(() => ({ ok: false as const, error: networkErrorMessage() }))
      setLoadingPast(false)
      if (!pastRes.ok) { toast(pastRes.error, 'error'); return }
      const past = pastRes.data
      setPastEvents(past.events as Event[])
      setUnmarkedPastEventIds(new Set(past.unmarkedEventIds))
    }
    setShowPast(!showPast)
  }

  const allEvents = showPast || view === 'calendar' ? [...pastEvents, ...events] : events

  // Load the player's own answers for every event on screen. Small read,
  // re-run only when the set of event ids changes.
  const rsvpEventKey = isPlayer ? allEvents.map(e => e.id).sort().join(',') : ''
  useEffect(() => {
    if (!rsvpEventKey) return
    let cancelled = false
    getMyRsvpState(rsvpEventKey.split(',')).catch(() => ({ ok: false as const, error: '' })).then(res => {
      if (cancelled) return
      if (!res.ok) { setMyRsvps(prev => prev ?? {}); return }
      setMyRsvps(prev => ({ ...(prev ?? {}), ...res.data.responses }))
      setPlayersByTeam(res.data.playersByTeam)
    })
    return () => { cancelled = true }
  }, [rsvpEventKey])

  // Players: which games have a shared game plan (059), for the card link.
  const [sharedGamePlans, setSharedGamePlans] = useState<Set<string>>(new Set())
  const planEventKey = isPlayer
    ? allEvents
        .filter(e => (e.type === 'game' || e.type === 'tournament') && e.status !== 'cancelled')
        .map(e => e.id)
        .sort()
        .join(',')
    : ''
  useEffect(() => {
    if (!planEventKey) return
    let cancelled = false
    getSharedGamePlanIds(planEventKey.split(',')).catch(() => ({ ok: false as const, error: '' })).then(res => {
      if (cancelled || !res.ok) return
      setSharedGamePlans(new Set(res.data))
    })
    return () => { cancelled = true }
  }, [planEventKey])

  // Staff: each game's report state (057/058) for the "Stats in: 2-1 W" chip
  // (plus an edited dot) on past games. Only games/tournaments; re-run when
  // that set changes.
  const [gameScores, setGameScores] = useState<Record<string, GameReportChip>>({})
  const gameEventKey = canEdit
    ? allEvents
        .filter(e => (e.type === 'game' || e.type === 'tournament') && e.status !== 'cancelled')
        .map(e => `${e.id}|${e.end_time}`)
        .sort()
        .join(',')
    : ''
  useEffect(() => {
    if (!gameEventKey) return
    const now = Date.now()
    const ids = gameEventKey
      .split(',')
      .map(k => k.split('|'))
      .filter(([, end]) => new Date(end).getTime() < now)
      .map(([id]) => id)
    if (ids.length === 0) return
    let cancelled = false
    getGameScores(ids).catch(() => ({ ok: false as const, error: '' })).then(res => {
      if (cancelled || !res.ok) return
      setGameScores(prev => ({ ...prev, ...res.data }))
    })
    return () => { cancelled = true }
  }, [gameEventKey])

  function handleGameStatsSaved(eventId: string, chip: GameReportChip | null) {
    setGameScores(prev => {
      const next = { ...prev }
      if (chip) next[eventId] = chip
      else delete next[eventId]
      return next
    })
  }

  function saveRsvp(
    eventId: string,
    response: RsvpResponse,
    call: () => Promise<ActionResult<{ notifiedCoaches: number }>>,
    successMessage: string,
  ) {
    const previous = myRsvps?.[eventId] ?? null
    startRsvpTransition(async () => {
      setShownRsvp({ eventId, response })
      markRsvpPending(eventId)
      let res: ActionResult<{ notifiedCoaches: number }>
      try {
        res = await call()
      } catch {
        res = { ok: false, error: networkErrorMessage() }
      }
      if (!res.ok) {
        // Overlay drops when this transition ends: the card rolls back.
        const error = res.error
        toast(error, 'error', isPreviewBlocked(error) ? undefined : {
          action: { label: 'Retry', onClick: () => saveRsvp(eventId, response, call, successMessage) },
        })
        return
      }
      const notified = res.data.notifiedCoaches
      startRsvpTransition(() => {
        setMyRsvps(prev => ({ ...(prev ?? {}), [eventId]: response }))
      })
      toast(
        notified > 0 ? `${successMessage} · coach${notified === 1 ? '' : 'es'} notified` : successMessage,
        'success',
        previous && previous !== response
          ? { action: { label: 'Undo', onClick: () => undoRsvp(eventId, previous) } }
          : undefined,
      )
    })
  }

  function rsvpGoing(eventId: string, teamId: string, playerIds: string[], playerCount = 1) {
    saveRsvp(
      eventId,
      'going',
      () => parentRsvp({ eventId, teamId, playerIds, response: 'going' }),
      playerCount === 1 ? 'You\u2019re going' : `${playerIds.length} confirmed`,
    )
  }

  function rsvpCantMakeIt(eventId: string, teamId: string, playerIds: string[], reason: string, playerCount = 1) {
    saveRsvp(
      eventId,
      'not_going',
      async () => {
        // Excuse = the coach-facing record + push with the reason. The RSVP
        // row keeps the forecast tally and this card in sync with it.
        const ex = await parentExcuseChildren({ eventId, teamId, playerIds, reason })
        if (!ex.ok) return ex
        await parentRsvp({ eventId, teamId, playerIds, response: 'not_going' })
        return { ok: true, data: { notifiedCoaches: ex.data.notifiedCoaches } }
      },
      playerCount === 1 ? 'Marked as not attending' : `${playerIds.length} marked excused`,
    )
  }

  // Undo puts back the previous answer. Going back to "going" is one tap;
  // going back to "can't make it" re-sends the excuse without a reason.
  function undoRsvp(eventId: string, previous: RsvpResponse) {
    const ev = [...events, ...pastEvents].find(e => e.id === eventId)
    const ids = ev ? playersByTeam[ev.team_id] ?? [] : []
    if (!ev || ids.length === 0) return
    if (previous === 'going') rsvpGoing(eventId, ev.team_id, ids)
    else rsvpCantMakeIt(eventId, ev.team_id, ids, '')
  }

  function handlePlayerGoing(eventId: string, teamId: string) {
    const ids = playersByTeam[teamId] ?? []
    if (ids.length === 1) { rsvpGoing(eventId, teamId, ids); return }
    // Zero or several linked rows: the picker explains or lets them choose.
    const ev = [...events, ...pastEvents].find(e => e.id === eventId)
    setParentGoingEvent({ eventId, teamId, title: ev?.title ?? '' })
  }

  function handlePlayerCantMakeIt(eventId: string, teamId: string) {
    const ev = [...events, ...pastEvents].find(e => e.id === eventId)
    setParentCantAttendEvent({ eventId, teamId, title: ev?.title ?? '' })
  }

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

  async function handleCancel(eventId: string) {
    const ok = await confirm({
      title: 'Cancel this event?',
      message: 'Coaches and players on this team will be notified.',
      confirmLabel: 'Cancel event',
      cancelLabel: 'Keep it',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      try {
        const cRes = await cancelEvent(eventId)
        if (!cRes.ok) { toast(cRes.error, 'error'); return }
        const counts = cRes.data
        toast(
          formatRecipientToast({ action: 'event_cancelled', ...counts }),
          counts.emailFailed > 0 ? 'error' : 'success',
        )
      } catch {
        toast('Failed to cancel event', 'error')
      }
    })
  }

  async function handleRestore(eventId: string) {
    const ok = await confirm({
      title: 'Bring this event back?',
      message: 'Coaches and players on this team will be notified.',
      confirmLabel: 'Restore event',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        const rRes = await restoreEvent(eventId)
        if (!rRes.ok) { toast(rRes.error, 'error'); return }
        const counts = rRes.data
        toast(
          formatRecipientToast({ action: 'event_restored', ...counts }),
          counts.emailFailed > 0 ? 'error' : 'success',
        )
      } catch {
        toast('Failed to restore event', 'error')
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
            {(() => { const n = filtered.filter(e => new Date(e.end_time).getTime() >= Date.now()).length; return `${n} upcoming event${n !== 1 ? 's' : ''}` })()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Past toggle */}
          <button
            type="button"
            aria-pressed={showPast}
            onClick={togglePast}
            className={`px-3 py-2 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap ${
              showPast ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 text-gray hover:text-white'
            }`}
            disabled={loadingPast}
          >
            {loadingPast ? 'Loading…' : showPast ? 'Hide past' : 'Show past'}
          </button>

          {/* View toggle */}
          <div className="flex bg-dark rounded-xl border border-white/10 overflow-hidden">
            <button
              type="button"
              aria-pressed={view === 'agenda'}
              onClick={() => setView('agenda')}
              className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${
                view === 'agenda' ? 'bg-green text-dark' : 'text-gray hover:text-white'
              }`}
            >
              Agenda
            </button>
            <button
              type="button"
              aria-pressed={view === 'calendar'}
              onClick={() => { setView('calendar'); void ensurePastLoaded() }}
              className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${
                view === 'calendar' ? 'bg-green text-dark' : 'text-gray hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>

          {canEdit && (
            <a
              href="/api/export/schedule"
              download
              className="px-3 py-2 text-sm font-medium rounded-xl border border-white/10 text-gray hover:text-white transition-colors whitespace-nowrap"
            >
              Download
            </a>
          )}

          {canEdit && (
            <a
              href="/dashboard/schedule/import"
              className="px-3 py-2 text-sm font-medium rounded-xl border border-white/10 text-gray hover:text-white transition-colors whitespace-nowrap"
            >
              Import
            </a>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={handleAddNew}
              className="bg-green text-dark font-bold px-4 sm:px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm whitespace-nowrap"
            >
              + Add event
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
          onRestore={handleRestore}
          isDoc={canEdit}
          onCantAttend={canEdit ? setCantAttendEventId : undefined}
          onParentCantAttend={isPlayer ? handlePlayerCantMakeIt : undefined}
          onParentGoing={isPlayer ? handlePlayerGoing : undefined}
          myRsvps={isPlayer ? (shownRsvps ?? undefined) : undefined}
          pendingRsvpIds={pendingRsvpIds}
          empty={
            filterTeam || filterType
              ? {
                  title: 'No events match these filters',
                  body: 'Try another team or event type.',
                  action: { label: 'Clear filters', onClick: () => { setFilterTeam(null); setFilterType(null) } },
                }
              : canCreate
                ? {
                    title: 'No events scheduled yet',
                    body: 'Add practices, games and travel so your staff and players know where to be.',
                    action: { label: '+ Add event', onClick: handleAddNew },
                  }
                : {
                    title: 'Nothing on the schedule yet',
                    body: isPlayer
                      ? 'When your coaches add practices and games, they show up here.'
                      : 'The head coach hasn\u2019t added any events yet.',
                  }
          }
          onAttendance={canEdit ? handleAttendance : undefined}
          canEdit={canEdit}
          coverageRequests={coverageRequests}
          userRole={userRole}
          userProfileId={userProfileId}
          unmarkedEventIds={unmarkedPastEventIds}
          coachesByTeam={coachesByTeam}
          rsvpTallies={rsvpTallies}
          showRsvpTally={canEdit}
          matchSheets={matchSheets}
          gameScores={gameScores}
          onGameStatsSaved={handleGameStatsSaved}
          sharedGamePlans={sharedGamePlans}
        />
      ) : (
        <CalendarView
          events={filtered}
          onEdit={handleEdit}
          onAddAtDate={handleAddAtDate}
          includesPast={showPast || pastEvents.length > 0}
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

      {/* Player: I can't make it → mark excused + notify coaches */}
      {parentCantAttendEvent && (
        <ParentCantAttendModal
          eventId={parentCantAttendEvent.eventId}
          teamId={parentCantAttendEvent.teamId}
          eventTitle={parentCantAttendEvent.title}
          knownPlayerIds={playersByTeam[parentCantAttendEvent.teamId]}
          onSubmit={({ playerIds, reason, playerCount }) =>
            rsvpCantMakeIt(parentCantAttendEvent.eventId, parentCantAttendEvent.teamId, playerIds, reason, playerCount)
          }
          onClose={() => setParentCantAttendEvent(null)}
        />
      )}

      {/* Player: I'll be there → record positive RSVP */}
      {parentGoingEvent && (
        <ParentGoingModal
          eventId={parentGoingEvent.eventId}
          teamId={parentGoingEvent.teamId}
          eventTitle={parentGoingEvent.title}
          onSubmit={({ playerIds, playerCount }) =>
            rsvpGoing(parentGoingEvent.eventId, parentGoingEvent.teamId, playerIds, playerCount)
          }
          onClose={() => setParentGoingEvent(null)}
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
          userRole={userRole}
        />
      )}

      {confirmDialog}
    </>
  )
}
