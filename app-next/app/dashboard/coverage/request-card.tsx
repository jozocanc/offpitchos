'use client'
import { useClubTimezone } from '@/components/club-timezone'
import { formatShortDate, formatTime } from '@/lib/format-datetime'
import { ageGroupLabel } from '@/lib/team-label'

interface CoverageRequestCardProps {
  request: {
    id: string
    status: string
    timeout_at: string
    events: any
    profiles: any
    covering: any
  }
  responses: Array<{ coverage_request_id: string; response: string; profiles: any }>
  onAssign: (requestId: string) => void
}

export default function RequestCard({ request, responses, onAssign }: CoverageRequestCardProps) {
  const timezone = useClubTimezone()
  const event = Array.isArray(request.events) ? request.events[0] : request.events
  const unavailableCoach = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles
  const coveringCoach = Array.isArray(request.covering) ? request.covering[0] : request.covering
  const team = event?.teams ? (Array.isArray(event.teams) ? event.teams[0] : event.teams) : null

  const reqResponses = responses.filter(r => r.coverage_request_id === request.id)
  const acceptedCount = reqResponses.filter(r => r.response === 'accepted').length
  const declinedCount = reqResponses.filter(r => r.response === 'declined').length

  const isEscalated = request.status === 'escalated'
  const isPending = request.status === 'pending'
  const isCovered = request.status === 'accepted' || request.status === 'resolved'

  const timeoutDate = new Date(request.timeout_at)
  const now = new Date()
  const timeRemaining = Math.max(0, Math.floor((timeoutDate.getTime() - now.getTime()) / 60000))

  const borderColor = isEscalated ? 'border-red/30' : isPending ? 'border-yellow-500/30' : 'border-green/30'

  const dateStr = event?.start_time ? formatShortDate(event.start_time, timezone) : ''
  const timeStr = event?.start_time ? formatTime(event.start_time, timezone) : ''

  return (
    <div className={`bg-dark-secondary rounded-xl p-4 border ${borderColor} transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {team && ageGroupLabel(team.age_group) && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                {ageGroupLabel(team.age_group)}
              </span>
            )}
            {isEscalated && (
              <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">Escalated</span>
            )}
            {isPending && (
              <span className="text-xs font-bold bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">Pending</span>
            )}
            {isCovered && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">Covered</span>
            )}
          </div>
          <p className="font-bold text-white">{event?.title ?? 'Unknown event'}</p>
          <p className="text-gray text-sm mt-1">{dateStr} at {timeStr}</p>
          <p className="text-gray text-sm">
            Unavailable: <span className="text-white">{unavailableCoach?.display_name ?? 'Unknown'}</span>
          </p>
          {isCovered && coveringCoach && (
            <p className="text-green text-sm mt-1">Covered by: {coveringCoach.display_name}</p>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray">
            {declinedCount > 0 && <span>{declinedCount} declined</span>}
            {acceptedCount > 0 && <span>{acceptedCount} accepted</span>}
            {isPending && <span>{timeRemaining}m until escalation</span>}
          </div>
        </div>

        {(isPending || isEscalated) && (
          <button
            onClick={() => onAssign(request.id)}
            className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm shrink-0"
          >
            Assign
          </button>
        )}
      </div>
    </div>
  )
}
