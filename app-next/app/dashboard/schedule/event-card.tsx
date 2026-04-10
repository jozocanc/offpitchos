'use client'

import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import CoverageActionsInline from './coverage-actions-inline'

interface EventCardProps {
  event: {
    id: string
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
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  canEdit: boolean
  onCantAttend?: (eventId: string) => void
  onParentCantAttend?: (eventId: string, teamId: string) => void
  onAttendance?: (eventId: string, teamId: string) => void
  teamId?: string
  coverageRequest?: {
    id: string
    status: string
    covering_coach_id: string | null
    profiles: any  // eslint-disable-line @typescript-eslint/no-explicit-any
  } | null
  showCoverageActions?: boolean
  /** True when this is a past event that still has zero attendance rows.
   * Renders as an "Unmarked" pill next to the other status badges. */
  isUnmarked?: boolean
}

export default function EventCard({ event, onEdit, onCancel, canEdit, onCantAttend, onParentCantAttend, onAttendance, teamId, coverageRequest, showCoverageActions, isUnmarked }: EventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const isCancelled = event.status === 'cancelled'

  const timeStr = `${formatTime(start)} – ${formatTime(end)}`

  return (
    <div
      data-event-id={event.id}
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
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getTypeBadgeColors(event.type)}`}>
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
            {coverageRequest && coverageRequest.status === 'pending' && (
              <span className="text-xs font-bold bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
                Needs Coverage
              </span>
            )}
            {coverageRequest && coverageRequest.status === 'escalated' && (
              <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
                Escalated
              </span>
            )}
            {coverageRequest && (coverageRequest.status === 'accepted' || coverageRequest.status === 'resolved') && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                Covered{(() => { const p = Array.isArray(coverageRequest.profiles) ? coverageRequest.profiles[0] : coverageRequest.profiles; return p?.display_name ? ` by ${p.display_name}` : '' })()}
              </span>
            )}
            {isUnmarked && !isCancelled && (
              <span
                title="No attendance recorded for this event yet"
                className="text-xs font-bold bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-2 py-0.5 rounded-full"
              >
                Unmarked
              </span>
            )}
          </div>
          <p className={`font-bold ${isCancelled ? 'line-through text-gray' : 'text-white'}`}>
            {event.title}
            {event.teams?.[0]?.age_group && (
              <span className="text-gray font-normal ml-1">({event.teams[0].age_group})</span>
            )}
          </p>
          <p className="text-gray text-sm mt-1">{timeStr}</p>
          {(() => {
            const venueName = event.venues?.[0]?.name ?? null
            const effectiveAddress = event.address || event.venues?.[0]?.address || null
            if (!venueName && !effectiveAddress) return null
            const mapsHref = effectiveAddress
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(effectiveAddress)}`
              : null
            return (
              <div className="text-gray text-sm mt-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{venueName ?? 'Location'}</span>
                  {mapsHref && (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="ml-1 text-xs font-semibold text-green bg-green/10 hover:bg-green/20 border border-green/20 rounded-full px-2 py-0.5 transition-colors"
                    >
                      Open in Maps →
                    </a>
                  )}
                </div>
                {effectiveAddress && (
                  <p className="text-xs text-gray/80 mt-0.5 pl-[18px]">{effectiveAddress}</p>
                )}
              </div>
            )
          })()}
          {event.notes && (
            <p className="text-gray text-xs mt-2 italic">{event.notes}</p>
          )}
        </div>

        {canEdit && !isCancelled && (
          <div className="flex gap-2 shrink-0">
            {onAttendance && teamId && (
              <button
                onClick={() => onAttendance(event.id, teamId)}
                className="text-green hover:text-green/80 text-sm transition-colors"
              >
                Attendance
              </button>
            )}
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
        {onCantAttend && !isCancelled && !coverageRequest && (
          <button
            onClick={() => onCantAttend(event.id)}
            className="text-yellow-500 hover:text-yellow-400 text-sm transition-colors shrink-0"
          >
            Can&apos;t Attend
          </button>
        )}
        {onParentCantAttend && !isCancelled && teamId && (
          <button
            onClick={() => onParentCantAttend(event.id, teamId)}
            className="text-yellow-500 hover:text-yellow-400 text-sm transition-colors shrink-0"
          >
            Can&apos;t Attend
          </button>
        )}
      </div>
      {showCoverageActions && coverageRequest?.status === 'pending' && (
        <CoverageActionsInline requestId={coverageRequest.id} />
      )}
    </div>
  )
}

function getTypeBadgeColors(type: string): string {
  switch (type) {
    case 'game': return 'bg-blue-500/10 text-blue-400'
    case 'tournament': return 'bg-purple-500/10 text-purple-400'
    case 'camp': return 'bg-orange-500/10 text-orange-400'
    case 'tryout': return 'bg-yellow-500/10 text-yellow-400'
    case 'meeting': return 'bg-gray-500/10 text-gray-400'
    case 'practice':
    default: return 'bg-green/10 text-green'
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
