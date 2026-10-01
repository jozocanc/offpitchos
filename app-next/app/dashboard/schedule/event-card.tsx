'use client'

import { useState } from 'react'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import CoverageActionsInline from './coverage-actions-inline'
import EventPhotosModal from './event-photos-modal'
import { useClubTimezone } from '@/components/club-timezone'
import { formatTimeRange } from '@/lib/format-datetime'
import type { EventTravelFields } from '@/lib/travel'
import TravelStrip from './travel-strip'
import VisitorInfoModal from './visitor-info-modal'
import { isHomeGame } from '@/lib/match-sheet'

interface EventCardProps {
  event: EventTravelFields & {
    id: string
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
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  onRestore?: (eventId: string) => void
  canEdit: boolean
  isDoc?: boolean
  onCantAttend?: (eventId: string) => void
  onParentCantAttend?: (eventId: string, teamId: string) => void
  onParentGoing?: (eventId: string, teamId: string) => void
  onAttendance?: (eventId: string, teamId: string) => void
  teamId?: string
  coverageRequest?: {
    id: string
    status: string
    covering_coach_id: string | null
    profiles: any  // eslint-disable-line @typescript-eslint/no-explicit-any
  } | null
  showCoverageActions?: boolean
  isUnmarked?: boolean
  /** Coach names assigned to this event's team — shown as a line below
   * the venue for DOC so they know who's running each session. */
  coaches?: string[]
  showCoaches?: boolean
  /** Forecast headcount from player RSVPs. Shown to staff so they can
   * plan stations / lineups before walking onto the field. */
  rsvpTally?: { going: number; notGoing: number; totalKids: number } | null
  showRsvpTally?: boolean
  /** Visitor match sheet (055): true = link live, false = saved but off,
   * undefined = none yet. Staff-only. */
  matchSheetEnabled?: boolean
  /** Player's own answer for this event. undefined = not loaded yet. */
  myRsvp?: 'going' | 'not_going' | null
  /** True while that answer is still being saved. */
  myRsvpPending?: boolean
}

export default function EventCard({ event, onEdit, onCancel, onRestore, canEdit, isDoc, onCantAttend, onParentCantAttend, onParentGoing, onAttendance, teamId, coverageRequest, showCoverageActions, isUnmarked, coaches, showCoaches, rsvpTally, showRsvpTally, matchSheetEnabled, myRsvp, myRsvpPending }: EventCardProps) {
  const [photosOpen, setPhotosOpen] = useState(false)
  const [visitorOpen, setVisitorOpen] = useState(false)
  const timezone = useClubTimezone()
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const isCancelled = event.status === 'cancelled'
  const isOver = end.getTime() < Date.now()
  // Supabase returns the joined team as an object (to-one) or array
  // depending on context. Normalize so we can read .age_group reliably.
  const team = Array.isArray(event.teams) ? event.teams[0] : event.teams

  const timeStr = formatTimeRange(start, end, timezone)
  // Staff (canEdit) only: public visiting-team page for home games.
  const showVisitorInfo = canEdit && !isCancelled && isHomeGame(event)

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
            {team?.age_group && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                {team.age_group}
              </span>
            )}
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
            {showVisitorInfo && matchSheetEnabled === true && (
              <span
                title="The visiting team's match day page is live"
                className="text-xs font-medium bg-green/5 text-green/80 border border-green/15 px-2 py-0.5 rounded-full"
              >
                Visitor info shared
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
            {team?.age_group && (
              <span className="text-gray font-normal ml-1">({team.age_group})</span>
            )}
          </p>
          <p className="text-gray text-sm mt-1">{timeStr}</p>
          {(() => {
            const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues
            const venueName = venue?.name ?? null
            const effectiveAddress = event.address || venue?.address || null
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
          {showCoaches && coaches && coaches.length > 0 && (
            <p className="text-gray text-xs mt-1.5 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              <span>{coaches.join(', ')}</span>
            </p>
          )}
          {event.link && (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-green bg-green/10 hover:bg-green/20 border border-green/20 rounded-full px-2.5 py-1 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Tournament link →
            </a>
          )}
          {event.notes && (
            <p className="text-gray text-xs mt-2 italic">{event.notes}</p>
          )}
        </div>

        {canEdit && !isCancelled && (
          // Wraps instead of pushing: on a game day this row holds five
          // controls and used to squeeze the title into a one-word column.
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 shrink-0 max-w-[45%]">
            {onAttendance && teamId && isGameDay(event.start_time) && event.type === 'game' && (
              <a
                href={`/dashboard/schedule/${event.id}/game-day`}
                className="bg-green text-dark text-xs font-bold px-3 py-1 rounded-full hover:opacity-90 transition-opacity"
              >
                Game Day Mode
              </a>
            )}
            {onAttendance && teamId && (
              <button
                type="button"
                onClick={() => onAttendance(event.id, teamId)}
                className="text-green hover:text-green/80 text-sm transition-colors"
              >
                Attendance
              </button>
            )}
            {showVisitorInfo && (
              <button
                type="button"
                onClick={() => setVisitorOpen(true)}
                className="text-green hover:text-green/80 text-sm transition-colors"
              >
                Visitor info
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(event.id)}
              className="text-gray hover:text-white text-sm transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onCancel(event.id)}
              className="text-red hover:text-red/80 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        {isDoc && isCancelled && onRestore && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onRestore(event.id)}
              className="text-xs font-semibold bg-green/10 hover:bg-green/20 text-green border border-green/20 rounded-full px-3 py-1 transition-colors"
            >
              ↺ Restore
            </button>
          </div>
        )}
        {onCantAttend && !isCancelled && !coverageRequest && (
          <button
            type="button"
            onClick={() => onCantAttend(event.id)}
            className="text-yellow-500 hover:text-yellow-400 text-sm transition-colors shrink-0"
          >
            Can&apos;t Attend
          </button>
        )}
        {(onParentGoing || onParentCantAttend) && !isCancelled && teamId && (
          <PlayerRsvp
            response={myRsvp}
            pending={myRsvpPending ?? false}
            isOver={isOver}
            onGoing={onParentGoing ? () => onParentGoing(event.id, teamId) : undefined}
            onCantMakeIt={onParentCantAttend ? () => onParentCantAttend(event.id, teamId) : undefined}
          />
        )}
      </div>
      {!isCancelled && <TravelStrip travel={event} eventStartIso={event.start_time} />}
      {showRsvpTally && rsvpTally && rsvpTally.totalKids > 0 && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-green">
            <span className="w-2 h-2 rounded-full bg-green" />
            <span>{`${rsvpTally.going} going`}</span>
          </span>
          {rsvpTally.notGoing > 0 && (
            <span className="inline-flex items-center gap-1 text-yellow-500">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>{`${rsvpTally.notGoing} can't make it`}</span>
            </span>
          )}
          <span className="text-gray">
            {`${Math.max(0, rsvpTally.totalKids - rsvpTally.going - rsvpTally.notGoing)} no response · ${rsvpTally.totalKids} total`}
          </span>
        </div>
      )}
      {showCoverageActions && coverageRequest?.status === 'pending' && (
        <CoverageActionsInline requestId={coverageRequest.id} />
      )}

      <div className="mt-3 pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={() => setPhotosOpen(true)}
          className="text-xs text-gray hover:text-green inline-flex items-center gap-1.5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Photos
        </button>
      </div>

      {visitorOpen && (
        <VisitorInfoModal
          eventId={event.id}
          eventTitle={event.title}
          onClose={() => setVisitorOpen(false)}
        />
      )}

      {photosOpen && (
        <EventPhotosModal
          eventId={event.id}
          eventTitle={event.title}
          onClose={() => setPhotosOpen(false)}
        />
      )}
    </div>
  )
}

// Player's RSVP corner. Unanswered: the two actions. Answered: what they
// chose, plus a one-tap switch to the other answer. Optimistic: the parent
// flips `response` before the server confirms and `pending` shows that.
function PlayerRsvp({
  response,
  pending,
  isOver,
  onGoing,
  onCantMakeIt,
}: {
  response: 'going' | 'not_going' | null | undefined
  pending: boolean
  isOver: boolean
  onGoing?: () => void
  onCantMakeIt?: () => void
}) {
  // Still loading the player's answers: hold the space so the card
  // doesn't jump when they arrive.
  if (response === undefined) {
    return <div aria-hidden="true" className="skeleton h-8 w-28 rounded-full shrink-0" />
  }

  if (response === null) {
    if (isOver) return null
    return (
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {onGoing && (
          <button
            type="button"
            onClick={onGoing}
            className="text-sm font-bold text-dark bg-green rounded-full px-3.5 py-1.5 hover:opacity-90 transition-opacity"
          >
            I&apos;ll Be There
          </button>
        )}
        {onCantMakeIt && (
          <button
            type="button"
            onClick={onCantMakeIt}
            className="text-xs font-semibold text-gray hover:text-white px-2 py-1 rounded-lg transition-colors"
          >
            Can&apos;t Make It
          </button>
        )}
      </div>
    )
  }

  const going = response === 'going'
  const switchAction = going ? onCantMakeIt : onGoing
  return (
    <div className="flex flex-col items-end gap-1 shrink-0" aria-live="polite">
      <span
        className={`inline-flex items-center gap-1.5 text-sm font-bold rounded-full px-3 py-1.5 border transition-colors ${
          going
            ? 'bg-green/10 text-green border-green/20'
            : 'bg-yellow-500/10 text-yellow-700 border-yellow-500/25'
        } ${pending ? 'opacity-70' : ''}`}
      >
        {going ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {going ? 'You\u2019re going' : 'You can\u2019t make it'}
      </span>
      {pending ? (
        <span className="text-[11px] text-gray px-2 py-1">Saving…</span>
      ) : switchAction && !isOver ? (
        <button
          type="button"
          onClick={switchAction}
          className="text-xs font-semibold text-gray hover:text-white px-2 py-1 rounded-lg transition-colors"
        >
          {going ? 'Can\u2019t make it?' : 'I can make it'}
        </button>
      ) : null}
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

// Show "Game Day" CTA only inside the ±12-hour window so the button
// doesn't clutter every game card on the schedule.
function isGameDay(startTimeIso: string): boolean {
  const now = Date.now()
  const start = new Date(startTimeIso).getTime()
  const diff = Math.abs(now - start)
  return diff <= 12 * 60 * 60 * 1000
}
