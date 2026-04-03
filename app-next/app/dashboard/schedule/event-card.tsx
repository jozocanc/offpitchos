'use client'

import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'

interface EventCardProps {
  event: {
    id: string
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
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  canEdit: boolean
}

export default function EventCard({ event, onEdit, onCancel, canEdit }: EventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const isCancelled = event.status === 'cancelled'

  const timeStr = `${formatTime(start)} – ${formatTime(end)}`

  return (
    <div
      className={`bg-dark-secondary rounded-xl p-4 border border-white/5 ${
        isCancelled ? 'opacity-50' : 'hover:border-green/20'
      } transition-colors`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
              {event.teams?.[0]?.age_group}
            </span>
            <span className="text-xs font-medium bg-white/5 text-gray px-2 py-0.5 rounded-full">
              {EVENT_TYPE_LABELS[event.type as EventType] ?? event.type}
            </span>
            {isCancelled && (
              <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
                Cancelled
              </span>
            )}
            {event.recurrence_group && (
              <span className="text-xs text-gray" title="Recurring event">
                ↻
              </span>
            )}
          </div>
          <p className={`font-bold ${isCancelled ? 'line-through text-gray' : 'text-white'}`}>
            {event.title}
          </p>
          <p className="text-gray text-sm mt-1">{timeStr}</p>
          {event.venues?.[0]?.name && (
            <p className="text-gray text-sm">{event.venues[0].name}</p>
          )}
          {event.notes && (
            <p className="text-gray text-xs mt-2 italic">{event.notes}</p>
          )}
        </div>

        {canEdit && !isCancelled && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onEdit(event.id)}
              className="text-gray hover:text-white text-sm transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onCancel(event.id)}
              className="text-red hover:text-red/80 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
