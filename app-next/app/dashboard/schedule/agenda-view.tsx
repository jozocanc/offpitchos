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
  recurrence_group: string | null
  teams: { name: string; age_group: string }[] | null
  venues: { name: string }[] | null
}

interface AgendaViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  canEdit: boolean
}

export default function AgendaView({ events, onEdit, onCancel, canEdit }: AgendaViewProps) {
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
          <h3 className="text-sm font-bold text-gray uppercase tracking-wider mb-3">
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
