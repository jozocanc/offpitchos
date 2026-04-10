'use client'

import EventCard from './event-card'

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
  recurrence_group: string | null
  teams: { name: string; age_group: string }[] | null
  venues: { name: string; address: string | null }[] | null
}

interface AgendaViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  canEdit: boolean
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
  onAttendance?: (eventId: string, teamId: string) => void
  userRole: string
  userProfileId: string
  unmarkedEventIds?: Set<string>
  coachesByTeam?: Record<string, string[]>
}

export default function AgendaView({ events, onEdit, onCancel, canEdit, onCantAttend, onParentCantAttend, onAttendance, coverageRequests, userRole, userProfileId, unmarkedEventIds, coachesByTeam }: AgendaViewProps) {
  if (events.length === 0) {
    return (
      <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
        <p className="text-gray text-lg">No events scheduled yet.</p>
        <p className="text-gray text-sm mt-1">Add your first event to get started.</p>
      </div>
    )
  }

  // Group events by date
  const grouped = groupByDate(events)

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
                canEdit={canEdit}
                onCantAttend={onCantAttend}
                onParentCantAttend={onParentCantAttend}
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

function groupByDate(events: Event[]): DateGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const groups: Map<string, Event[]> = new Map()

  for (const event of events) {
    const date = new Date(event.start_time)
    const dateStr = date.toISOString().split('T')[0]
    if (!groups.has(dateStr)) groups.set(dateStr, [])
    groups.get(dateStr)!.push(event)
  }

  return Array.from(groups.entries()).map(([dateStr, events]) => {
    const date = new Date(dateStr + 'T00:00:00')
    const isPast = date < today

    let label: string
    const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Tomorrow'
    else if (diffDays === -1) label = 'Yesterday'
    else label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    return { dateStr, label, events, isPast }
  })
}
