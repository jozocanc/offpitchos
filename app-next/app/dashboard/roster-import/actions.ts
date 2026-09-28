// app-next/app/dashboard/roster-import/actions.ts
'use server'

// IMPORTANT: This module follows the demo-seed pattern (see
// app-next/app/dashboard/demo-seed-actions.ts) for account creation:
// admin.auth.admin.createUser with email_confirm=true + random password
// for each unique player email, then profiles + team_members + players.
// Each player account owns its roster row via players.parent_id (the column
// name is historical; it means "the account linked to this player row").
// Parent/guardian columns are no longer imported.
// Spec: docs/superpowers/specs/2026-05-04-roster-import-design.md.

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
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
import { normalizeEmail, normalizeDate, trimName, teamKey } from './lib/normalize'
import { ROLES, NO_AGE_GROUP } from '@/lib/constants'
import { sendRosterRecoveryEmail } from '@/lib/email'

const MAX_ROWS = 1000

function cryptoRandomPassword(): string {
  // 24 random bytes -> base64url. Long enough to be unguessable; the player will reset.
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
  const playerEmails = new Set<string>()
  const playersByEmail = new Map<string, number>()
  let importablePlayerCount = 0

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const ageGroupRaw = trimName(get(row, 'team_age_group'))
    const emailRaw = get(row, 'player_email')

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
    const email = normalizeEmail(emailRaw)
    if (!email && emailRaw) {
      // Imported as an unclaimed player rather than skipped. Only flag it when
      // an email was supplied but could not be parsed; a blank cell is normal
      // and not worth a warning per row.
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'player_email',
        message: 'Invalid email. Player imported without an account',
      })
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
        // Age group is optional: a college or first-team roster has none.
        // teams.age_group is NOT NULL, so blank is stored as NO_AGE_GROUP.
        teamsToCreateMap.set(tk, { name: teamName, age_group: ageGroupRaw || NO_AGE_GROUP })
      }
    } else if (ageGroupRaw && ageGroupRaw !== existing.age_group) {
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'team_age_group',
        message: `Team "${existing.name}" exists with age_group "${existing.age_group}" — your "${ageGroupRaw}" ignored`,
      })
    }

    // DOB warnings (don't skip)
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

    if (email) {
      if (playerEmails.has(email)) {
        warnings.push({
          rowNumber: row.rowNumber,
          field: 'player_email',
          message: `Email ${email} is already used by an earlier row. Player imported without an account`,
        })
      }
      playerEmails.add(email)
      playersByEmail.set(email, (playersByEmail.get(email) ?? 0) + 1)
    }

    importablePlayerCount++
  }

  if (importablePlayerCount === 0) {
    blockingErrors.push({ rowNumber: 0, message: 'No importable rows after validation' })
  }

  const sharedEmails = Array.from(playersByEmail.entries())
    .filter(([, count]) => count > 1)
    .map(([email, playerCount]) => ({ email, playerCount }))

  return {
    ok: true,
    data: {
      counts: {
        newTeams: teamsToCreateMap.size,
        newPlayers: importablePlayerCount,
        playerAccounts: playerEmails.size,
        existingPlayerCount: existingPlayerCount ?? 0,
      },
      teamsToCreate: Array.from(teamsToCreateMap.values()),
      teamsExisting: (existingTeams ?? []).map(t => ({ name: t.name, id: t.id })),
      sharedEmails,
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

  // 2) Pass 1 -- collect one account per unique player email. The first row
  //    with an email owns it; later rows reusing it import without an account.
  type AccountRecord = {
    email: string
    firstName: string
    lastName: string
    teamId: string
  }
  const accountByEmail = new Map<string, AccountRecord>()
  const seenPlayerKeys = new Set<string>()

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const email = normalizeEmail(get(row, 'player_email'))
    if (!firstName || !lastName || !teamName) continue
    const teamId = teamIdByKey.get(teamKey(teamName))
    if (!teamId) continue

    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys.has(playerKey)) continue
    seenPlayerKeys.add(playerKey)

    // No email on this row: the player is still imported below, just
    // without an account (shows as "not claimed" on the roster).
    if (!email || accountByEmail.has(email)) continue
    accountByEmail.set(email, { email, firstName, lastName, teamId })
  }

  // 3) Create auth.users + profiles + team_members for each player account.
  // Pattern matches demo-seed-actions.ts lines 208-244.
  const accountUserIdByEmail = new Map<string, string>()
  for (const account of accountByEmail.values()) {
    const fullName = `${account.firstName} ${account.lastName}`.trim()
    const { data: created, error: authErr } = await service.auth.admin.createUser({
      email: account.email,
      password: cryptoRandomPassword(),
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        imported_at: new Date().toISOString(),
      },
    })
    if (authErr || !created.user) {
      return { ok: false, error: `Failed to create account for ${account.email}: ${authErr?.message ?? 'unknown'}` }
    }
    const authId = created.user.id
    accountUserIdByEmail.set(account.email, authId)

    const { data: insertedProfile, error: profileErr } = await service
      .from('profiles')
      .insert({
        user_id: authId,
        club_id: clubId,
        role: ROLES.PLAYER,
        display_name: fullName,
        onboarding_complete: true,
      })
      .select('id')
      .single()
    if (profileErr || !insertedProfile) {
      return { ok: false, error: `Failed to create profile for ${account.email}: ${profileErr?.message}` }
    }

    const { error: memberErr } = await service.from('team_members').insert({
      team_id: account.teamId,
      profile_id: insertedProfile.id,
      role: ROLES.PLAYER,
    })
    if (memberErr) {
      return { ok: false, error: `Failed to add ${account.email} to their team: ${memberErr.message}` }
    }
  }

  // 4) Pass 2 -- insert players
  type PlayerInsert = {
    club_id: string
    team_id: string
    // The player's own account, or null for a row with no (or a reused)
    // email. The roster page shows those as "not claimed".
    parent_id: string | null
    first_name: string
    last_name: string
    jersey_number: number | null
    position: string | null
    date_of_birth: string | null
  }
  const playerInserts: PlayerInsert[] = []
  const seenPlayerKeys2 = new Set<string>()
  const claimedEmails = new Set<string>()

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const email = normalizeEmail(get(row, 'player_email'))
    if (!firstName || !lastName || !teamName) continue

    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys2.has(playerKey)) continue
    seenPlayerKeys2.add(playerKey)

    const teamId = teamIdByKey.get(teamKey(teamName))
    if (!teamId) continue
    // Only the first row with a given email gets that account, matching pass 1.
    let accountId: string | null = null
    if (email && !claimedEmails.has(email)) {
      accountId = accountUserIdByEmail.get(email) ?? null
      claimedEmails.add(email)
    }

    const dob = normalizeDate(get(row, 'date_of_birth'))
    const jerseyRaw = get(row, 'jersey_number').replace(/\D/g, '')
    playerInserts.push({
      club_id: clubId,
      team_id: teamId,
      parent_id: accountId,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyRaw ? parseInt(jerseyRaw, 10) : null,
      position: trimName(get(row, 'position')) || null,
      date_of_birth: dob.iso,
    })
  }

  if (playerInserts.length === 0) {
    return { ok: false, error: 'No importable rows after account creation' }
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
      accountsCreated: accountByEmail.size,
      accountUserIds: Array.from(accountUserIdByEmail.values()),
    },
  }
}

// Sends each imported player a "set your password" email. Exported name kept
// for compatibility; it no longer targets parents.
export async function sendParentRecoveryEmails(
  userIds: string[]
): Promise<
  | { ok: true; data: { sent: number; failed: number; failures: { email: string; reason: string }[] } }
  | ActionFailure
> {
  if (userIds.length === 0) {
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

  // Security: verify these member profiles all belong to the DOC's club.
  // Legacy 'parent' accounts are still accepted so old imports can resend.
  const { data: memberProfiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('club_id', profile.club_id)
    .in('role', [ROLES.PLAYER, ROLES.PARENT])
    .in('user_id', userIds)
  if (profilesErr) return { ok: false, error: profilesErr.message }

  const allowed = new Set((memberProfiles ?? []).map(p => p.user_id))
  const filteredIds = userIds.filter(id => allowed.has(id))

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

  // Derive site origin so recovery links route through /auth/callback?next=/reset-password
  // on the host the request came in on (works for prod, preview, and localhost).
  const h = await headers()
  const host = h.get('host') ?? 'offpitchos.com'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const siteOrigin = `${protocol}://${host}`

  for (const userId of filteredIds) {
    let email = ''
    try {
      const { data: authUser, error: lookupErr } = await service.auth.admin.getUserById(userId)
      if (lookupErr || !authUser?.user?.email) throw new Error(lookupErr?.message ?? 'User lookup failed')
      email = authUser.user.email

      const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${siteOrigin}/auth/callback?next=/reset-password`,
        },
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
