'use client'

import { useState } from 'react'
import RequestCard from './request-card'
import AssignModal from './assign-modal'
import CoverageActionsInline from '../schedule/coverage-actions-inline'

// The shape returned by `getCoverageData` is wide and joined; using `any`
// at the boundary matches the rest of this page and avoids pinning the
// exact Supabase inferred shape.
interface CoverageClientProps {
  requests: any[]  // eslint-disable-line @typescript-eslint/no-explicit-any
  responses: any[]  // eslint-disable-line @typescript-eslint/no-explicit-any
  coaches: Array<{ id: string; display_name: string | null }>
  userRole: string
  userProfileId: string
}

export default function CoverageClient({
  requests,
  responses,
  coaches,
  userRole,
  userProfileId,
}: CoverageClientProps) {
  const [assignRequestId, setAssignRequestId] = useState<string | null>(null)

  const escalated = requests.filter(r => r.status === 'escalated')
  const pending = requests.filter(r => r.status === 'pending')
  const resolved = requests.filter(r => r.status === 'accepted' || r.status === 'resolved').slice(0, 10)

  if (userRole === 'coach') {
    return (
      <CoachCoverageView
        escalated={escalated}
        pending={pending}
        resolved={resolved}
        responses={responses}
        userProfileId={userProfileId}
      />
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Coverage</h1>
          <p className="text-gray text-sm mt-1">
            {escalated.length + pending.length} active request{escalated.length + pending.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {escalated.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-red uppercase tracking-wider mb-3">Escalated — Needs Your Attention</h2>
          <div className="space-y-3">
            {escalated.map(req => (
              <RequestCard key={req.id} request={req} responses={responses} onAssign={setAssignRequestId} />
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-yellow-500 uppercase tracking-wider mb-3">Active Requests</h2>
          <div className="space-y-3">
            {pending.map(req => (
              <RequestCard key={req.id} request={req} responses={responses} onAssign={setAssignRequestId} />
            ))}
          </div>
        </div>
      )}

      {escalated.length === 0 && pending.length === 0 && (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5 mb-8">
          <p className="text-gray text-lg">No active coverage requests.</p>
          <p className="text-gray text-sm mt-1">When a coach can&apos;t attend an event, it&apos;ll show up here.</p>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray uppercase tracking-wider mb-3">Recently Resolved</h2>
          <div className="space-y-3">
            {resolved.map(req => (
              <RequestCard key={req.id} request={req} responses={responses} onAssign={setAssignRequestId} />
            ))}
          </div>
        </div>
      )}

      {assignRequestId && (
        <AssignModal requestId={assignRequestId} coaches={coaches} onClose={() => setAssignRequestId(null)} />
      )}
    </>
  )
}

/**
 * Coach-scoped inbox view. Splits requests into:
 *  - "Needs a cover" — pending/escalated requests other coaches created that
 *    the current coach hasn't already declined, accept/decline inline.
 *  - "Your request" — requests the coach created themselves (waiting for
 *    someone else to cover).
 *  - "Recently resolved" — last few resolved ones for context.
 */
function CoachCoverageView({
  escalated,
  pending,
  resolved,
  responses,
  userProfileId,
}: {
  escalated: any[]  // eslint-disable-line @typescript-eslint/no-explicit-any
  pending: any[]  // eslint-disable-line @typescript-eslint/no-explicit-any
  resolved: any[]  // eslint-disable-line @typescript-eslint/no-explicit-any
  responses: { coverage_request_id: string; coach_id?: string; response: string }[]
  userProfileId: string
}) {
  const myResponses = new Set(
    responses
      .filter(r => (r as { coach_id?: string }).coach_id === userProfileId)
      .map(r => r.coverage_request_id),
  )

  const actionable = [...escalated, ...pending].filter(r => {
    if (r.unavailable_coach_id === userProfileId) return false
    if (myResponses.has(r.id)) return false
    return r.status === 'pending' // escalated requests go to DOC, coaches can't self-accept
  })

  const myRequests = [...escalated, ...pending].filter(r => r.unavailable_coach_id === userProfileId)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Coverage</h1>
          <p className="text-gray text-sm mt-1">
            {actionable.length} request{actionable.length !== 1 ? 's' : ''} waiting for you
          </p>
        </div>
      </div>

      {actionable.length > 0 ? (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-yellow-500 uppercase tracking-wider mb-3">
            Can you cover these?
          </h2>
          <div className="space-y-3">
            {actionable.map(req => (
              <CoachRequestCard key={req.id} request={req} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5 mb-8">
          <p className="text-gray text-lg">No coverage requests waiting for you.</p>
          <p className="text-gray text-sm mt-1">You&apos;ll get notified when a teammate needs coverage.</p>
        </div>
      )}

      {myRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray uppercase tracking-wider mb-3">
            Your open requests
          </h2>
          <div className="space-y-3">
            {myRequests.map(req => (
              <CoachRequestCard key={req.id} request={req} isSelfRequest />
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray uppercase tracking-wider mb-3">Recently resolved</h2>
          <div className="space-y-3">
            {resolved.slice(0, 5).map(req => (
              <CoachRequestCard key={req.id} request={req} isResolved />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function CoachRequestCard({
  request,
  isSelfRequest,
  isResolved,
}: {
  request: any // eslint-disable-line @typescript-eslint/no-explicit-any
  isSelfRequest?: boolean
  isResolved?: boolean
}) {
  const event = Array.isArray(request.events) ? request.events[0] : request.events
  const unavailableCoach = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles
  const coveringCoach = Array.isArray(request.covering) ? request.covering[0] : request.covering
  const team = event?.teams ? (Array.isArray(event.teams) ? event.teams[0] : event.teams) : null

  const dateStr = event?.start_time
    ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''
  const timeStr = event?.start_time
    ? new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : ''

  const isEscalated = request.status === 'escalated'
  const border = isResolved
    ? 'border-green/20'
    : isSelfRequest
    ? 'border-white/10'
    : isEscalated
    ? 'border-red/30'
    : 'border-yellow-500/30'

  return (
    <div className={`bg-dark-secondary rounded-xl p-4 border ${border} transition-colors`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {team && (
          <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
            {team.age_group}
          </span>
        )}
        {isEscalated && (
          <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
            Escalated — DOC assigning
          </span>
        )}
        {isResolved && (
          <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">Covered</span>
        )}
      </div>
      <p className="font-bold text-white">{event?.title ?? 'Unknown event'}</p>
      <p className="text-gray text-sm mt-1">{dateStr} at {timeStr}</p>
      {!isSelfRequest && (
        <p className="text-gray text-sm">
          Unavailable: <span className="text-white">{unavailableCoach?.display_name ?? 'Unknown'}</span>
        </p>
      )}
      {isResolved && coveringCoach && (
        <p className="text-green text-sm mt-1">Covered by {coveringCoach.display_name}</p>
      )}
      {!isResolved && !isSelfRequest && !isEscalated && (
        <CoverageActionsInline requestId={request.id} />
      )}
      {isSelfRequest && !isResolved && (
        <p className="text-xs text-gray mt-2 italic">
          Waiting for another coach to accept — we&apos;ll notify you when someone does.
        </p>
      )}
    </div>
  )
}
