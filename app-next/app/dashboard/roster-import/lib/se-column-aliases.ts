// app-next/app/dashboard/roster-import/lib/se-column-aliases.ts
import { OffPitchField } from './types'

// Lowercased alias → field. Compared case-insensitively.
export const SE_COLUMN_ALIASES: Record<string, OffPitchField> = {
  // Player names
  'member first name': 'player_first_name',
  'first name': 'player_first_name',
  'player first name': 'player_first_name',
  'firstname': 'player_first_name',
  'member last name': 'player_last_name',
  'last name': 'player_last_name',
  'player last name': 'player_last_name',
  'lastname': 'player_last_name',

  // Team
  'team name': 'team_name',
  'team': 'team_name',
  'roster': 'team_name',
  'squad': 'team_name',
  'team / roster': 'team_name',

  'age group': 'team_age_group',
  'age': 'team_age_group',
  'birth year': 'team_age_group',
  'division': 'team_age_group',

  // Player's own email (becomes their login). Parent/guardian columns are
  // deliberately absent so they stay unmapped and are ignored on import.
  'email': 'player_email',
  'email address': 'player_email',
  'e-mail': 'player_email',
  'player email': 'player_email',
  'member email': 'player_email',
  'athlete email': 'player_email',
  'student email': 'player_email',
  'school email': 'player_email',

  // Player extras
  'jersey number': 'jersey_number',
  'jersey #': 'jersey_number',
  '#': 'jersey_number',
  'position': 'position',
  'date of birth': 'date_of_birth',
  'dob': 'date_of_birth',
  'birthday': 'date_of_birth',
  'birthdate': 'date_of_birth',
}

// Returns suggested mapping for a list of CSV headers.
// Headers that don't match any alias map to '' (unmapped).
export function suggestMapping(headers: string[]): Record<string, OffPitchField | ''> {
  const mapping: Record<string, OffPitchField | ''> = {}
  for (const h of headers) {
    mapping[h] = SE_COLUMN_ALIASES[h.trim().toLowerCase()] ?? ''
  }
  return mapping
}
