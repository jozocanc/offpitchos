// Shared by the any-file schedule import (client table + server actions).

export const SCHEDULE_TYPES = ['game', 'tournament', 'practice', 'meeting'] as const
export type ScheduleType = typeof SCHEDULE_TYPES[number]

export const SCHEDULE_FIELDS = ['date', 'time', 'type', 'opponent', 'home_away', 'location'] as const
export type ScheduleField = typeof SCHEDULE_FIELDS[number]

export type HomeAway = 'home' | 'away' | 'neutral' | ''

/** One editable row of the review table. */
export interface ScheduleDraftRow {
  key: string
  include: boolean
  /** Existing event on the same day this row updates, or null for a new one. */
  matchId: string | null
  matchLabel: string | null
  /** YYYY-MM-DD in the club's time zone. */
  date: string
  /** HH:MM (24h) in the club's time zone, blank = time TBD. */
  time: string
  type: ScheduleType
  /** Game: opponent. Tournament, practice, meeting: the event name. */
  opponent: string
  home_away: HomeAway
  location: string
  uncertain: ScheduleField[]
  /** For a matched row: what differs from the saved event. */
  changes: ScheduleField[]
}

export interface ScheduleReadResult {
  teamId: string
  teamName: string
  timeZone: string
  rows: ScheduleDraftRow[]
}

export interface ScheduleSaveResult {
  added: number
  updated: number
}
