// Shared by the any-file roster import (client table + server actions).

export const ROSTER_FIELDS = ['first_name', 'last_name', 'jersey_number', 'position', 'date_of_birth'] as const
export type RosterField = typeof ROSTER_FIELDS[number]

/** One editable row of the review table. Values are strings as typed. */
export interface RosterDraftRow {
  key: string
  include: boolean
  /** Existing player this row updates, or null for a new player. */
  matchId: string | null
  /** "#7 Juan Diaz" for the matched player, shown in the table. */
  matchLabel: string | null
  first_name: string
  last_name: string
  jersey_number: string
  position: string
  /** YYYY-MM-DD or blank. */
  date_of_birth: string
  /** Class year, height, hometown etc., saved to notes for new players only. */
  extra: string
  /** Fields the reader wasn't sure about. */
  uncertain: RosterField[]
  /** For a matched row: fields whose value differs from what's saved. */
  changes: RosterField[]
}

export interface RosterReadResult {
  teamId: string
  teamName: string
  rows: RosterDraftRow[]
  /** Players already on the team, by count, for the summary line. */
  existingCount: number
}

export interface RosterSaveResult {
  added: number
  updated: number
}
