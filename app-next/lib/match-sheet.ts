/**
 * Visiting-team match sheet (migration 055). Pure helpers shared by the event
 * card, the visitor info modal and match-sheet-actions. No server or client
 * imports, so it is safe on both sides.
 */
import { hasTravel, type EventTravelFields } from '@/lib/travel'

/**
 * Is this event a HOME game?
 *
 * The schedule has no explicit home/away flag. What it does have:
 *   - venue_id: set only when the coach picks one of the club's own saved
 *     venues (their facilities). The modal copies that venue's address into
 *     `address` too, so address alone proves nothing.
 *   - away games: no club venue, a typed address, and usually travel details
 *     (migration 052).
 * So: a game at a club venue with no trip planned is a home game.
 */
export function isHomeGame(event: EventTravelFields & {
  type: string
  venue_id?: string | null
}): boolean {
  return event.type === 'game' && Boolean(event.venue_id) && !hasTravel(event)
}

/** Mirrors match_sheets_text_lengths in 055. */
export const MATCH_SHEET_LIMITS = {
  arrival_notes: 1000,
  parking: 1000,
  locker_room: 500,
  home_kit: 200,
  contact_name: 100,
  contact_phone: 40,
  extra_notes: 2000,
} as const

export type MatchSheetField = keyof typeof MATCH_SHEET_LIMITS

export const MATCH_SHEET_FIELDS = Object.keys(MATCH_SHEET_LIMITS) as MatchSheetField[]

export type MatchSheetFields = Record<MatchSheetField, string>

export const DEFAULT_ARRIVAL_NOTES = 'Please arrive 60 minutes before kickoff.'

export function emptyMatchSheetFields(): MatchSheetFields {
  return {
    arrival_notes: DEFAULT_ARRIVAL_NOTES,
    parking: '',
    locker_room: '',
    home_kit: '',
    contact_name: '',
    contact_phone: '',
    extra_notes: '',
  }
}

/** A sheet as staff see it in the modal. */
export interface MatchSheet extends MatchSheetFields {
  token: string
  enabled: boolean
}

/** "(903) 555-0123" -> "+19035550123"-ish, for a tel: href. Keeps + and digits. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
