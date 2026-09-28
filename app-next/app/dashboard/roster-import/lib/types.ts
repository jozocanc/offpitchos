// app-next/app/dashboard/roster-import/lib/types.ts

export type OffPitchField =
  | 'player_first_name'
  | 'player_last_name'
  | 'team_name'
  | 'team_age_group'
  | 'player_email'
  | 'jersey_number'
  | 'position'
  | 'date_of_birth'

// player_email is NOT required. A row with an email gets its own player
// account (players.parent_id = that account). A row without one imports as an
// unclaimed player, which the roster page shows and the DOC can invite later.
// Parent/guardian columns are no longer a concept; they're left unmapped.
export const REQUIRED_FIELDS: OffPitchField[] = [
  'player_first_name',
  'player_last_name',
  'team_name',
]

// CSV header → OffPitchOS field. Empty string = unmapped.
export type ColumnMapping = Record<string, OffPitchField | ''>

export interface ParsedRow {
  // Original CSV row by header name
  raw: Record<string, string>
  // Source row number for warnings (1-indexed, header = row 0)
  rowNumber: number
}

export interface RowWarning {
  rowNumber: number
  field?: OffPitchField
  message: string
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface PreviewResult {
  ok: true
  data: {
    counts: {
      newTeams: number
      newPlayers: number
      playerAccounts: number  // = player accounts that will be created (one per unique email)
      existingPlayerCount: number  // for re-import dialog (Phase 2)
    }
    teamsToCreate: { name: string; age_group: string }[]
    teamsExisting: { name: string; id: string }[]
    // Emails used on more than one row. Only the first row gets the account.
    sharedEmails: { email: string; playerCount: number }[]
    warnings: RowWarning[]
    skippedRows: number
    blockingErrors: RowError[]
  }
}

export interface CommitResult {
  ok: true
  data: {
    teamsCreated: number
    playersCreated: number
    accountsCreated: number
    accountUserIds: string[]  // for sendParentRecoveryEmails (sends player set-password emails)
  }
}

export interface ActionFailure {
  ok: false
  error: string
}
