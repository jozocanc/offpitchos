// app-next/app/dashboard/roster-import/actions.ts
'use server'

// IMPORTANT: This module follows the demo-seed pattern (see
// app-next/app/dashboard/demo-seed-actions.ts) for parent creation:
// admin.auth.admin.createUser with email_confirm=true + random password
// for each unique parent email, then profiles + team_members + players.
// Spec: docs/superpowers/specs/2026-05-04-roster-import-design.md.

import { createClient } from '@/lib/supabase/server'
import {
  ColumnMapping,
  ParsedRow,
  PreviewResult,
  RowWarning,
  RowError,
  ActionFailure,
  REQUIRED_FIELDS,
} from './lib/types'
import { normalizeEmail, normalizeDate, trimName, teamKey } from './lib/normalize'

const MAX_ROWS = 1000

export async function previewImport(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  variant: 'onboarding' | 'dashboard'
): Promise<PreviewResult | ActionFailure> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || profile.role !== 'doc') {
    return { ok: false, error: 'DOC role required' }
  }

  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `Row cap is ${MAX_ROWS}. Split your CSV.` }
  }

  // Required-field-mapped check
  const mappedFields = new Set(Object.values(mapping).filter(Boolean))
  for (const required of REQUIRED_FIELDS) {
    if (!mappedFields.has(required)) {
      return { ok: false, error: `Map a column to "${required}" before previewing.` }
    }
  }

  // Existing player count (used for both empty-state guard and dashboard re-import dialog)
  const { count: existingPlayerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', profile.club_id)

  // Empty-state guard for onboarding path
  if (variant === 'onboarding' && (existingPlayerCount ?? 0) > 0) {
    return {
      ok: false,
      error: 'Onboarding import requires an empty club. Use the dashboard import for additional teams.',
    }
  }

  // Field-getter
  const fieldToHeader = (field: string): string | null => {
    for (const [header, mapped] of Object.entries(mapping)) {
      if (mapped === field) return header
    }
    return null
  }
  const get = (row: ParsedRow, field: string): string => {
    const header = fieldToHeader(field)
    return header ? (row.raw[header] ?? '').toString() : ''
  }

  // Existing teams (for match)
  const { data: existingTeams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)
  const teamByKey = new Map((existingTeams ?? []).map(t => [teamKey(t.name), t]))

  // Per-row validation + dedup
  const warnings: RowWarning[] = []
  const blockingErrors: RowError[] = []
  let skippedRows = 0
  const seenPlayerKeys = new Set<string>()
  const teamsToCreateMap = new Map<string, { name: string; age_group: string }>()
  const parentEmails = new Set<string>()
  const playersByEmail = new Map<string, number>()
  let importablePlayerCount = 0

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const ageGroupRaw = trimName(get(row, 'team_age_group'))
    const parent1EmailRaw = get(row, 'parent1_email')
    const parent2EmailRaw = get(row, 'parent2_email')

    if (!firstName || !lastName) {
      warnings.push({ rowNumber: row.rowNumber, message: 'Missing player name — row skipped' })
      skippedRows++
      continue
    }
    if (!teamName) {
      warnings.push({ rowNumber: row.rowNumber, field: 'team_name', message: 'Missing team — row skipped' })
      skippedRows++
      continue
    }
    const parent1Email = normalizeEmail(parent1EmailRaw)
    if (!parent1Email) {
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'parent1_email',
        message: parent1EmailRaw ? 'Invalid parent email — row skipped' : 'Missing parent email — row skipped',
      })
      skippedRows++
      continue
    }

    // Player dedup within CSV
    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys.has(playerKey)) {
      warnings.push({ rowNumber: row.rowNumber, message: `Duplicate of an earlier row — skipped` })
      skippedRows++
      continue
    }
    seenPlayerKeys.add(playerKey)

    // Team match-or-create
    const tk = teamKey(teamName)
    const existing = teamByKey.get(tk)
    if (!existing) {
      if (!teamsToCreateMap.has(tk)) {
        if (!ageGroupRaw) {
          warnings.push({
            rowNumber: row.rowNumber,
            field: 'team_age_group',
            message: `New team "${teamName}" — age group required, row skipped`,
          })
          skippedRows++
          continue
        }
        teamsToCreateMap.set(tk, { name: teamName, age_group: ageGroupRaw })
      }
    } else if (ageGroupRaw && ageGroupRaw !== existing.age_group) {
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'team_age_group',
        message: `Team "${existing.name}" exists with age_group "${existing.age_group}" — your "${ageGroupRaw}" ignored`,
      })
    }

    // Phone, DOB warnings (don't skip)
    const phoneRaw = get(row, 'parent1_phone')
    if (phoneRaw && !/\d/.test(phoneRaw)) {
      warnings.push({ rowNumber: row.rowNumber, field: 'parent1_phone', message: 'Phone not parseable — stored as-is' })
    }
    const dobRaw = get(row, 'date_of_birth')
    if (dobRaw) {
      const dob = normalizeDate(dobRaw)
      if (!dob.iso) {
        warnings.push({
          rowNumber: row.rowNumber,
          field: 'date_of_birth',
          message: dob.ambiguous ? 'Date ambiguous (US vs UK) — stored as null' : 'Date unparseable — stored as null',
        })
      }
    }

    parentEmails.add(parent1Email)
    playersByEmail.set(parent1Email, (playersByEmail.get(parent1Email) ?? 0) + 1)
    const parent2Email = normalizeEmail(parent2EmailRaw)
    if (parent2Email && parent2Email !== parent1Email) {
      parentEmails.add(parent2Email)
      playersByEmail.set(parent2Email, (playersByEmail.get(parent2Email) ?? 0) + 1)
    }

    importablePlayerCount++
  }

  if (importablePlayerCount === 0) {
    blockingErrors.push({ rowNumber: 0, message: 'No importable rows after validation' })
  }

  const siblingGroups = Array.from(playersByEmail.entries())
    .filter(([, count]) => count > 1)
    .map(([email, playerCount]) => ({ email, playerCount }))

  return {
    ok: true,
    data: {
      counts: {
        newTeams: teamsToCreateMap.size,
        newPlayers: importablePlayerCount,
        uniqueParentEmails: parentEmails.size,
        existingPlayerCount: existingPlayerCount ?? 0,
      },
      teamsToCreate: Array.from(teamsToCreateMap.values()),
      teamsExisting: (existingTeams ?? []).map(t => ({ name: t.name, id: t.id })),
      siblingGroups,
      warnings,
      skippedRows,
      blockingErrors,
    },
  }
}
