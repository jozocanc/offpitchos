'use client'

import { useState } from 'react'
import { useClubTimezone } from '@/components/club-timezone'
import { type EventTravelFields, hasTravel, travelSummaryParts } from '@/lib/travel'

/**
 * Compact away-trip strip on an event card:
 *   "Bus departs 7:30 AM from Wagstaff Gym · Returns ~9:00 PM · Hotel: Hampton Inn"
 * Tapping it expands the itinerary notes when there are any.
 */
export default function TravelStrip({
  travel,
  eventStartIso,
}: {
  travel: EventTravelFields
  eventStartIso: string
}) {
  const timezone = useClubTimezone()
  const [open, setOpen] = useState(false)

  if (!hasTravel(travel)) return null

  const parts = travelSummaryParts(travel, timezone, eventStartIso)
  const notes = travel.travel_notes?.trim() || null
  const expandable = Boolean(notes)

  const summary = (
    <>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-green" aria-hidden="true">
        <path d="M8 6v6" /><path d="M15 6v6" /><path d="M2 12h19.6" />
        <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
        <circle cx="7" cy="18" r="2" /><path d="M9 18h5" /><circle cx="16" cy="18" r="2" />
      </svg>
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-green mr-1.5">Travel</span>
        {parts.length > 0
          ? parts.map((p, i) => (
              <span key={i}>
                {i > 0 && <span className="text-gray/50 mx-1.5">·</span>}
                <span className="text-white/90">{p}</span>
              </span>
            ))
          : <span className="text-white/90">Itinerary posted</span>}
      </span>
      {expandable && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 mt-0.5 text-gray transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </>
  )

  return (
    <div className="mt-3 rounded-lg border border-green/20 bg-green/5 text-xs">
      {expandable ? (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          aria-expanded={open}
          className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-green/10 rounded-lg transition-colors"
        >
          {summary}
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2">{summary}</div>
      )}
      {expandable && open && (
        <div className="px-3 pb-3 pt-1 border-t border-green/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray mb-1">Itinerary</p>
          <p className="text-white/90 whitespace-pre-line leading-relaxed">{notes}</p>
        </div>
      )}
    </div>
  )
}
