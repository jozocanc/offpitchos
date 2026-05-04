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

  // Parent 1
  'parent 1 email': 'parent1_email',
  'parent email': 'parent1_email',
  'guardian email': 'parent1_email',
  'email address': 'parent1_email',
  'email': 'parent1_email',
  'parent 1 first name': 'parent1_first_name',
  'parent first name': 'parent1_first_name',
  'guardian first name': 'parent1_first_name',
  'parent name': 'parent1_first_name',
  'phone': 'parent1_phone',
  'parent phone': 'parent1_phone',
  'mobile phone': 'parent1_phone',
  'cell': 'parent1_phone',
  'cell phone': 'parent1_phone',
  'parent 1 phone': 'parent1_phone',

  // Parent 2
  'parent 2 email': 'parent2_email',
  'secondary email': 'parent2_email',
  'guardian 2 email': 'parent2_email',

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
