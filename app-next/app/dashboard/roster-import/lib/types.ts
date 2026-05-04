// app-next/app/dashboard/roster-import/lib/types.ts

export type OffPitchField =
  | 'player_first_name'
  | 'player_last_name'
  | 'team_name'
  | 'team_age_group'
  | 'parent1_email'
  | 'parent1_first_name'
  | 'parent1_phone'
  | 'parent2_email'
  | 'jersey_number'
  | 'position'
  | 'date_of_birth'

export const REQUIRED_FIELDS: OffPitchField[] = [
  'player_first_name',
  'player_last_name',
  'team_name',
  'parent1_email',
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
      uniqueParentEmails: number  // = parents that will be created
      existingPlayerCount: number  // for re-import dialog (Phase 2)
    }
    teamsToCreate: { name: string; age_group: string }[]
    teamsExisting: { name: string; id: string }[]
    siblingGroups: { email: string; playerCount: number }[]
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
    parentsCreated: number
    parentUserIds: string[]  // for Phase 3 sendParentRecoveryEmails
  }
}

export interface ActionFailure {
  ok: false
  error: string
}
