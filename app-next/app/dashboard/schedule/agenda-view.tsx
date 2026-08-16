'use client'

import EventCard from './event-card'
import { useClubTimezone } from '@/components/club-timezone'
import { dayKey, daysFromToday, formatDayKeyLong } from '@/lib/format-datetime'

interface Event {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  address: string | null
  link?: string | null
  recurrence_group: string | null
  teams: { name: string; age_group: string }[] | null
  venues: { name: string; address: string | null }[] | null
}

interface AgendaViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  onRestore?: (eventId: string) => void
  canEdit: boolean
  isDoc?: boolean
  onCantAttend?: (eventId: string) => void
  coverageRequests: Array<{
    id: string
    event_id: string
    status: string
    covering_coach_id: string | null
    unavailable_coach_id: string
    profiles: any  // eslint-disable-line @typescript-eslint/no-explicit-any
  }>
  onParentCantAttend?: (eventId: string, teamId: string) => void
  onParentGoing?: (eventId: string, teamId: string) => void
  onAttendance?: (eventId: string, teamId: string) => void
  userRole: string
  userProfileId: string
  unmarkedEventIds?: Set<string>
  coachesByTeam?: Record<string, string[]>
  rsvpTallies?: Record<string, { going: number; notGoing: number; totalKids: number }>
  showRsvpTally?: boolean
}

export default function AgendaView({ events, onEdit, onCancel, onRestore, canEdit, isDoc, onCantAttend, onParentCantAttend, onParentGoing, onAttendance, coverageRequests, userRole, userProfileId, unmarkedEventIds, coachesByTeam, rsvpTallies, showRsvpTally }: AgendaViewProps) {
  // Before the early return — hooks must run unconditionally.
  const timezone = useClubTimezone()

  if (events.length === 0) {
    return (
      <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
        <p className="text-gray text-lg">No events scheduled yet.</p>
        <p className="text-gray text-sm mt-1">Add your first event to get started.</p>
      </div>
    )
  }

  // Group events by date
  const grouped = groupByDate(events, timezone)

  return (
    <div className="space-y-8">
      {grouped.map(({ dateStr, label, events: dayEvents, isPast }) => (
        <div key={dateStr} className={isPast ? 'opacity-50' : ''}>
          <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${
            label === 'Today' ? 'text-green' : 'text-gray'
          }`}>
            {label}
          </h3>
          <div className="space-y-3">
            {dayEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={onEdit}
                onCancel={onCancel}
                onRestore={onRestore}
                canEdit={canEdit}
                isDoc={isDoc}
                onCantAttend={onCantAttend}
                onParentCantAttend={onParentCantAttend}
                onParentGoing={onParentGoing}
                onAttendance={onAttendance}
                teamId={event.team_id}
                coverageRequest={coverageRequests.find(cr => cr.event_id === event.id) ?? null}
                showCoverageActions={(() => {
                  const cr = coverageRequests.find(cr2 => cr2.event_id === event.id)
                  if (!cr || cr.status !== 'pending') return false
                  return cr.unavailable_coach_id !== userProfileId && userRole === 'coach'
                })()}
                isUnmarked={unmarkedEventIds?.has(event.id) ?? false}
                coaches={coachesByTeam?.[event.team_id] ?? undefined}
                showCoaches={userRole === 'doc'}
                rsvpTally={rsvpTallies?.[event.id] ?? null}
                showRsvpTally={showRsvpTally}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface DateGroup {
  dateStr: string
  label: string
  events: Event[]
  isPast: boolean
}

function groupByDate(events: Event[], timeZone: string): DateGroup[] {
  const groups: Map<string, Event[]> = new Map()

  for (const event of events) {
    // Was date.toISOString().split('T')[0], which buckets by the UTC calendar
    // date. An 8pm Eastern session is 00:00 UTC the next morning, so it filed
    // under tomorrow's heading. No current event falls in that window, but any
    // evening session would.
    const key = dayKey(event.start_time, timeZone)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(event)
  }

  return Array.from(groups.entries()).map(([dateStr, events]) => {
    const diffDays = daysFromToday(dateStr, timeZone)

    let label: string
    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Tomorrow'
    else if (diffDays === -1) label = 'Yesterday'
    else label = formatDayKeyLong(dateStr)

    return { dateStr, label, events, isPast: diffDays < 0 }
  })
}
