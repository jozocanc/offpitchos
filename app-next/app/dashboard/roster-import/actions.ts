// app-next/app/dashboard/roster-import/actions.ts
'use server'

// IMPORTANT: This module follows the demo-seed pattern (see
// app-next/app/dashboard/demo-seed-actions.ts) for parent creation:
// admin.auth.admin.createUser with email_confirm=true + random password
// for each unique parent email, then profiles + team_members + players.
// Spec: docs/superpowers/specs/2026-05-04-roster-import-design.md.

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { bustAttentionCache } from '../attention-actions'
import {
  ColumnMapping,
  ParsedRow,
  PreviewResult,
  RowWarning,
  RowError,
  ActionFailure,
  CommitResult,
  REQUIRED_FIELDS,
} from './lib/types'
import { normalizeEmail, normalizePhone, normalizeDate, trimName, teamKey } from './lib/normalize'
import { sendRosterRecoveryEmail } from '@/lib/email'

const MAX_ROWS = 1000

function cryptoRandomPassword(): string {
  // 24 random bytes -> base64url. Long enough to be unguessable; parent will reset.
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

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

export async function commitImport(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  variant: 'onboarding' | 'dashboard'
): Promise<CommitResult | ActionFailure> {
  // Re-run preview server-side as the source of truth -- never trust client data
  const preview = await previewImport(rows, mapping, variant)
  if (!preview.ok) return preview
  if (preview.data.blockingErrors.length > 0) {
    return { ok: false, error: 'Preview has blocking errors' }
  }

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

  const service = createServiceClient()
  const clubId = profile.club_id

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

  // 1) Insert new teams
  const teamInserts = preview.data.teamsToCreate.map(t => ({
    club_id: clubId,
    name: t.name,
    age_group: t.age_group,
  }))
  let teamsCreated = 0
  let allTeams = preview.data.teamsExisting.map(t => ({ id: t.id, name: t.name }))

  if (teamInserts.length > 0) {
    const { data: insertedTeams, error: teamErr } = await service
      .from('teams')
      .insert(teamInserts)
      .select('id, name')
    if (teamErr) return { ok: false, error: `Team insert failed: ${teamErr.message}` }
    teamsCreated = insertedTeams?.length ?? 0
    allTeams = allTeams.concat(insertedTeams ?? [])
  }
  const teamIdByKey = new Map(allTeams.map(t => [teamKey(t.name), t.id]))

  // 2) Pass 1 -- collect unique parents (deduped by email) + which teams each is on
  type ParentRecord = {
    email: string
    firstName: string
    lastName: string
    phone: string
    teamIds: Set<string>
  }
  const parentByEmail = new Map<string, ParentRecord>()
  const seenPlayerKeys = new Set<string>()

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const parent1Email = normalizeEmail(get(row, 'parent1_email'))
    if (!firstName || !lastName || !teamName || !parent1Email) continue
    const teamId = teamIdByKey.get(teamKey(teamName))
    if (!teamId) continue

    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys.has(playerKey)) continue
    seenPlayerKeys.add(playerKey)

    let p1 = parentByEmail.get(parent1Email)
    if (!p1) {
      p1 = {
        email: parent1Email,
        firstName: trimName(get(row, 'parent1_first_name')) || 'Parent',
        lastName: lastName,  // best guess: parent shares player's last name
        phone: normalizePhone(get(row, 'parent1_phone')),
        teamIds: new Set(),
      }
      parentByEmail.set(parent1Email, p1)
    }
    p1.teamIds.add(teamId)

    const parent2Email = normalizeEmail(get(row, 'parent2_email'))
    if (parent2Email && parent2Email !== parent1Email) {
      let p2 = parentByEmail.get(parent2Email)
      if (!p2) {
        p2 = {
          email: parent2Email,
          firstName: 'Parent',
          lastName: lastName,
          phone: '',
          teamIds: new Set(),
        }
        parentByEmail.set(parent2Email, p2)
      }
      p2.teamIds.add(teamId)
    }
  }

  // 3) Create auth.users + profiles + team_members for each unique parent.
  // Pattern matches demo-seed-actions.ts lines 208-244.
  const parentUserIdByEmail = new Map<string, string>()
  for (const parent of parentByEmail.values()) {
    const { data: created, error: authErr } = await service.auth.admin.createUser({
      email: parent.email,
      password: cryptoRandomPassword(),
      email_confirm: true,
      user_metadata: {
        full_name: `${parent.firstName} ${parent.lastName}`.trim(),
        imported_at: new Date().toISOString(),
      },
    })
    if (authErr || !created.user) {
      return { ok: false, error: `Failed to create parent ${parent.email}: ${authErr?.message ?? 'unknown'}` }
    }
    const authId = created.user.id
    parentUserIdByEmail.set(parent.email, authId)

    const { data: insertedProfile, error: profileErr } = await service
      .from('profiles')
      .insert({
        user_id: authId,
        club_id: clubId,
        role: 'parent',
        display_name: `${parent.firstName} ${parent.lastName}`.trim(),
        onboarding_complete: true,
      })
      .select('id')
      .single()
    if (profileErr || !insertedProfile) {
      return { ok: false, error: `Failed to create profile for ${parent.email}: ${profileErr?.message}` }
    }

    if (parent.teamIds.size > 0) {
      const memberInserts = Array.from(parent.teamIds).map(tId => ({
        team_id: tId,
        profile_id: insertedProfile.id,
        role: 'parent',
      }))
      const { error: memberErr } = await service.from('team_members').insert(memberInserts)
      if (memberErr) {
        return { ok: false, error: `Failed to link ${parent.email} to teams: ${memberErr.message}` }
      }
    }
  }

  // 4) Pass 2 -- insert players
  type PlayerInsert = {
    club_id: string
    team_id: string
    parent_id: string
    first_name: string
    last_name: string
    jersey_number: number | null
    position: string | null
    date_of_birth: string | null
  }
  const playerInserts: PlayerInsert[] = []
  const seenPlayerKeys2 = new Set<string>()

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const parent1Email = normalizeEmail(get(row, 'parent1_email'))
    if (!firstName || !lastName || !teamName || !parent1Email) continue

    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys2.has(playerKey)) continue
    seenPlayerKeys2.add(playerKey)

    const teamId = teamIdByKey.get(teamKey(teamName))
    if (!teamId) continue
    const parentId = parentUserIdByEmail.get(parent1Email)
    if (!parentId) continue

    const dob = normalizeDate(get(row, 'date_of_birth'))
    const jerseyRaw = get(row, 'jersey_number').replace(/\D/g, '')
    playerInserts.push({
      club_id: clubId,
      team_id: teamId,
      parent_id: parentId,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyRaw ? parseInt(jerseyRaw, 10) : null,
      position: trimName(get(row, 'position')) || null,
      date_of_birth: dob.iso,
    })
  }

  if (playerInserts.length === 0) {
    return { ok: false, error: 'No importable rows after parent creation' }
  }

  const { data: insertedPlayers, error: playerErr } = await service
    .from('players')
    .insert(playerInserts)
    .select('id')
  if (playerErr) return { ok: false, error: `Player insert failed: ${playerErr.message}` }

  // Cache busts
  await bustAttentionCache(clubId)
  revalidatePath('/dashboard/teams')
  revalidatePath('/dashboard')

  return {
    ok: true,
    data: {
      teamsCreated,
      playersCreated: insertedPlayers?.length ?? 0,
      parentsCreated: parentByEmail.size,
      parentUserIds: Array.from(parentUserIdByEmail.values()),
    },
  }
}

export async function sendParentRecoveryEmails(
  parentUserIds: string[]
): Promise<
  | { ok: true; data: { sent: number; failed: number; failures: { email: string; reason: string }[] } }
  | ActionFailure
> {
  if (parentUserIds.length === 0) {
    return { ok: true, data: { sent: 0, failed: 0, failures: [] } }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || profile.role !== 'doc') {
    return { ok: false, error: 'DOC role required' }
  }

  // Security: verify these parent profiles all belong to the DOC's club
  const { data: parentProfiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('club_id', profile.club_id)
    .eq('role', 'parent')
    .in('user_id', parentUserIds)
  if (profilesErr) return { ok: false, error: profilesErr.message }

  const allowed = new Set((parentProfiles ?? []).map(p => p.user_id))
  const filteredIds = parentUserIds.filter(id => allowed.has(id))

  // Get club name for email body
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('id', profile.club_id)
    .single()
  const clubName = club?.name ?? 'Your club'

  const service = createServiceClient()
  const failures: { email: string; reason: string }[] = []
  let sent = 0

  for (const userId of filteredIds) {
    let email = ''
    try {
      const { data: authUser, error: lookupErr } = await service.auth.admin.getUserById(userId)
      if (lookupErr || !authUser?.user?.email) throw new Error(lookupErr?.message ?? 'User lookup failed')
      email = authUser.user.email

      const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
        type: 'recovery',
        email,
      })
      if (linkErr || !linkData?.properties?.action_link) {
        throw new Error(linkErr?.message ?? 'Recovery-link generation failed')
      }

      await sendRosterRecoveryEmail({
        to: email,
        clubName,
        recoveryUrl: linkData.properties.action_link,
      })
      sent++
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : 'send failed'
      failures.push({ email: email || userId, reason })
    }
  }

  return { ok: true, data: { sent, failed: failures.length, failures } }
}
