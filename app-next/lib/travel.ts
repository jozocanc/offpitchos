/**
 * Away-trip travel details stored on public.events (migration 052).
 *
 * Pure helpers shared by the event modal, the travel strip on event cards and
 * the schedule Server Actions. No server or client imports, so it is safe on
 * both sides.
 */
import { formatShortDate, formatTime, dayKey, formatDayKeyWeekday } from '@/lib/format-datetime'

export const TRAVEL_MODES = ['bus', 'van', 'flight', 'cars', 'other'] as const
export type TravelMode = (typeof TRAVEL_MODES)[number]

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  bus: 'Bus',
  van: 'Vans',
  flight: 'Flight',
  cars: 'Cars',
  other: 'Other',
}

/** Travel columns as they come back from a Supabase select. */
export interface EventTravelFields {
  travel_depart_at?: string | null
  travel_depart_location?: string | null
  travel_return_at?: string | null
  travel_mode?: string | null
  travel_hotel?: string | null
  travel_notes?: string | null
}

/** Travel details as the event modal sends them to the Server Actions. */
export interface TravelInput {
  departAt: string | null      // ISO timestamp
  departLocation: string | null
  returnAt: string | null      // ISO timestamp
  mode: string | null
  hotel: string | null
  notes: string | null
}

/** Normalized row shape written to public.events. */
export interface TravelColumns {
  travel_depart_at: string | null
  travel_depart_location: string | null
  travel_return_at: string | null
  travel_mode: TravelMode | null
  travel_hotel: string | null
  travel_notes: string | null
}

export const EMPTY_TRAVEL: TravelColumns = {
  travel_depart_at: null,
  travel_depart_location: null,
  travel_return_at: null,
  travel_mode: null,
  travel_hotel: null,
  travel_notes: null,
}

export const TRAVEL_SELECT =
  'travel_depart_at, travel_depart_location, travel_return_at, travel_mode, travel_hotel, travel_notes'

function isTravelMode(v: string): v is TravelMode {
  return (TRAVEL_MODES as readonly string[]).includes(v)
}

function trimOrNull(v: string | null | undefined, max: number): string | null {
  const t = (v ?? '').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

function isoOrNull(v: string | null | undefined, label: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is not a valid date and time`)
  return d.toISOString()
}

/**
 * Validate and normalize modal input into DB columns. Throws with a
 * user-facing message on bad input. `null` input clears every travel field.
 */
export function normalizeTravelInput(input: TravelInput | null | undefined): TravelColumns {
  if (!input) return { ...EMPTY_TRAVEL }

  const departAt = isoOrNull(input.departAt, 'Departure time')
  const returnAt = isoOrNull(input.returnAt, 'Return time')
  if (departAt && returnAt && new Date(returnAt) <= new Date(departAt)) {
    throw new Error('Return time must be after the departure time')
  }

  const modeRaw = (input.mode ?? '').trim()
  if (modeRaw && !isTravelMode(modeRaw)) throw new Error('Pick a transport mode from the list')

  return {
    travel_depart_at: departAt,
    travel_depart_location: trimOrNull(input.departLocation, 200),
    travel_return_at: returnAt,
    travel_mode: modeRaw ? (modeRaw as TravelMode) : null,
    travel_hotel: trimOrNull(input.hotel, 200),
    travel_notes: trimOrNull(input.notes, 4000),
  }
}

/** True when any travel field is filled in. */
export function hasTravel(t: EventTravelFields | null | undefined): boolean {
  if (!t) return false
  return Boolean(
    t.travel_depart_at || t.travel_depart_location || t.travel_return_at ||
    t.travel_mode || t.travel_hotel || t.travel_notes,
  )
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return new Date(a).getTime() === new Date(b).getTime()
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim()
}

/** Whether saving `next` over `prev` changes anything a player would care about. */
export function travelChanged(prev: EventTravelFields | null | undefined, next: EventTravelFields): boolean {
  const p = prev ?? {}
  return !(
    sameInstant(p.travel_depart_at, next.travel_depart_at) &&
    sameInstant(p.travel_return_at, next.travel_return_at) &&
    sameText(p.travel_depart_location, next.travel_depart_location) &&
    sameText(p.travel_mode, next.travel_mode) &&
    sameText(p.travel_hotel, next.travel_hotel) &&
    sameText(p.travel_notes, next.travel_notes)
  )
}

function modeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null
  return isTravelMode(mode) ? TRAVEL_MODE_LABELS[mode] : mode
}

/**
 * The one-line strip, split into parts so the UI can lay them out:
 *   ["Bus departs 7:30 AM from Wagstaff Gym", "Returns ~9:00 PM", "Hotel: Hampton Inn"]
 *
 * A day prefix ("Fri 7:30 AM") is added whenever the time is on a different
 * club-local day than `anchorIso` (the event start for departure, the
 * departure for return), so an overnight trip never reads as same-day.
 */
export function travelSummaryParts(
  t: EventTravelFields,
  timeZone: string,
  eventStartIso?: string,
): string[] {
  const parts: string[] = []
  const mode = modeLabel(t.travel_mode)

  const when = (iso: string, anchor?: string | null) => {
    const time = formatTime(iso, timeZone)
    if (anchor && dayKey(iso, timeZone) !== dayKey(anchor, timeZone)) {
      return `${formatDayKeyWeekday(dayKey(iso, timeZone))} ${time}`
    }
    return time
  }

  if (t.travel_depart_at || t.travel_depart_location) {
    let s = mode ? `${mode} departs` : 'Departs'
    if (t.travel_depart_at) s += ` ${when(t.travel_depart_at, eventStartIso)}`
    if (t.travel_depart_location) s += ` from ${t.travel_depart_location}`
    parts.push(s)
  } else if (mode) {
    parts.push(`Travel by ${mode.toLowerCase()}`)
  }

  if (t.travel_return_at) {
    parts.push(`Returns ~${when(t.travel_return_at, t.travel_depart_at ?? eventStartIso)}`)
  }
  if (t.travel_hotel) parts.push(`Hotel: ${t.travel_hotel}`)
  return parts
}

/**
 * Push / email / in-app message for a travel add or change, e.g.
 *   "Travel for Sat at Prairie State College: Bus departs 4:00 PM from Field House · Returns ~Sun 1:00 PM"
 */
export function travelNotificationMessage(opts: {
  title: string
  eventStartIso: string
  travel: EventTravelFields
  timeZone: string
  isUpdate: boolean
}): string {
  const { title, eventStartIso, travel, timeZone, isUpdate } = opts
  const day = formatDayKeyWeekday(dayKey(eventStartIso, timeZone))
  const trimmed = title.trim()
  // "Away at Navarro" -> "Sat at Navarro"; anything else -> "Sat: Title"
  const awayMatch = /^away\s+(at\s+.+)$/i.exec(trimmed)
  const label = awayMatch
    ? `${day} ${awayMatch[1]}`
    : /^at\s+/i.test(trimmed)
      ? `${day} ${trimmed}`
      : `${trimmed} (${formatShortDate(eventStartIso, timeZone)})`

  const parts = travelSummaryParts(travel, timeZone, eventStartIso)
  const lead = isUpdate ? 'Travel updated for' : 'Travel for'
  if (!hasTravel(travel)) return `Travel plans removed for ${label}`
  const body = parts.length > 0 ? parts.join(' · ') : 'itinerary posted, check the schedule'
  return `${lead} ${label}: ${body}`
}

/**
 * Should the modal open the Travel section by default? Games and tournaments
 * away from the club's own saved venues, or anything titled like an away
 * fixture ("Away at ...", "... at Navarro").
 */
export function suggestsTravel(opts: {
  type: string
  title: string
  venueId: string | null | undefined
  address: string | null | undefined
}): boolean {
  const title = opts.title.trim()
  if (/\baway\b/i.test(title) || /(^|\s)at\s+\S/i.test(title)) return true
  const isCompetitive = opts.type === 'game' || opts.type === 'tournament'
  // Club venues are the team's own facilities. A game with no club venue but
  // a typed address is being played somewhere else.
  return isCompetitive && !opts.venueId && Boolean((opts.address ?? '').trim())
}
