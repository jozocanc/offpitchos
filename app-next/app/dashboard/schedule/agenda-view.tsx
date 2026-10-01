'use client'

import EventCard from './event-card'
import EmptyState from '@/components/empty-state'
import { useClubTimezone } from '@/components/club-timezone'
import { dayKey, daysFromToday, formatDayKeyLong } from '@/lib/format-datetime'
import type { EventTravelFields } from '@/lib/travel'

interface Event extends EventTravelFields {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  address: string | null
  venue_id?: string | null
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
  matchSheets?: Record<string, boolean>
  /** Player's own answers. undefined = still loading (cards hold space). */
  myRsvps?: Record<string, 'going' | 'not_going'>
  pendingRsvpIds?: Set<string>
  empty?: { title: string; body: string; action?: { label: string; onClick: () => void } }
}

export default function AgendaView({ events, onEdit, onCancel, onRestore, canEdit, isDoc, onCantAttend, onParentCantAttend, onParentGoing, onAttendance, coverageRequests, userRole, userProfileId, unmarkedEventIds, coachesByTeam, rsvpTallies, showRsvpTally, matchSheets, myRsvps, pendingRsvpIds, empty }: AgendaViewProps) {
  // Before the early return — hooks must run unconditionally.
  const timezone = useClubTimezone()

  if (events.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? 'No events scheduled yet'}
        body={empty?.body}
        action={empty?.action}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        }
      />
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
                matchSheetEnabled={matchSheets?.[event.id]}
                myRsvp={myRsvps ? (myRsvps[event.id] ?? null) : undefined}
                myRsvpPending={pendingRsvpIds?.has(event.id) ?? false}
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
