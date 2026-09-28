'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'
import { sendEmailToProfiles } from '@/lib/email'
import { getEffectiveRole } from '@/lib/admin-role'
import { ROLES } from '@/lib/constants'
import { type ActionResult, toActionError } from '@/lib/action-result'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No program found')
  return { user, profile, supabase }
}

interface TeamGearSummary {
  teamId: string
  teamName: string
  ageGroup: string
  playerCount: number
  jerseyBreakdown: Record<string, number>
  shortsBreakdown: Record<string, number>
  missingCount: number
  players: {
    id: string; firstName: string; lastName: string; jerseySize: string | null; shortsSize: string | null; collectToken: string
    // Travel readiness from /collect (052)
    hasTravelId: boolean | null
    passportExpiry: string | null
  }[]
}

export interface GearData {
  teams: TeamGearSummary[]
  userRole: string
  lastRequestedAt: string | null
  /** Player accounts notified by the last "Request sizes" send. */
  lastRequestedPlayerCount: number
  respondedSinceRequest: number
  /**
   * Players whose row is linked to their own login (players.parent_id points
   * at a player account). When this is 0 the in-app request would notify
   * nobody, so the UI leads with the per-player collect links instead.
   */
  playersWithAccounts: number
}

// Roles whose account a player row can be linked to. 'parent' is legacy and
// only kept so old linked rows still count.
const MEMBER_ROLES = [ROLES.PLAYER, ROLES.PARENT]

export async function getGearData(): Promise<GearData> {
  const { user, profile, supabase } = await getUserProfile()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)
    .order('age_group', { ascending: true })

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, team_id, jersey_size, shorts_size, collect_token, parent_id, has_travel_id, passport_expiry')
    .eq('club_id', profile.club_id)

  const teamSummaries: TeamGearSummary[] = (teams ?? []).map(team => {
    const teamPlayers = (players ?? []).filter(p => p.team_id === team.id)

    const jerseyBreakdown: Record<string, number> = {}
    const shortsBreakdown: Record<string, number> = {}
    let missingCount = 0

    for (const p of teamPlayers) {
      if (p.jersey_size) {
        jerseyBreakdown[p.jersey_size] = (jerseyBreakdown[p.jersey_size] ?? 0) + 1
      }
      if (p.shorts_size) {
        shortsBreakdown[p.shorts_size] = (shortsBreakdown[p.shorts_size] ?? 0) + 1
      }
      if (!p.jersey_size || !p.shorts_size) {
        missingCount++
      }
    }

    return {
      teamId: team.id,
      teamName: team.name,
      ageGroup: team.age_group,
      playerCount: teamPlayers.length,
      jerseyBreakdown,
      shortsBreakdown,
      missingCount,
      players: teamPlayers.map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        jerseySize: p.jersey_size,
        shortsSize: p.shorts_size,
        collectToken: p.collect_token,
        hasTravelId: p.has_travel_id ?? null,
        passportExpiry: p.passport_expiry ?? null,
      })),
    }
  })

  // Last-requested tracking + response progress
  const { data: settings } = await supabase
    .from('club_settings')
    .select('last_gear_size_request_at, last_gear_size_request_parent_count')
    .eq('club_id', profile.club_id)
    .maybeSingle()

  const lastRequestedAt = settings?.last_gear_size_request_at ?? null
  // Column name predates the team-only product; it now stores player accounts.
  const lastRequestedPlayerCount = settings?.last_gear_size_request_parent_count ?? 0

  // Unlinked rows keep parent_id pointing at the staff member who added them,
  // so "has an account" means parent_id belongs to a player (member) profile.
  const { data: memberProfiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('club_id', profile.club_id)
    .in('role', MEMBER_ROLES)
  const memberUserIds = new Set((memberProfiles ?? []).map(p => p.user_id))

  let respondedSinceRequest = 0
  if (lastRequestedAt) {
    // Count distinct linked player accounts whose row was updated since the
    // request AND now has both sizes filled.
    const { data: updatedPlayers } = await supabase
      .from('players')
      .select('parent_id')
      .eq('club_id', profile.club_id)
      .not('jersey_size', 'is', null)
      .not('shorts_size', 'is', null)
      .gt('updated_at', lastRequestedAt)

    const responded = new Set(
      (updatedPlayers ?? [])
        .map(p => p.parent_id)
        .filter((id): id is string => !!id && memberUserIds.has(id)),
    )
    respondedSinceRequest = responded.size
  }

  return {
    teams: teamSummaries,
    userRole: await getEffectiveRole(profile.role),
    lastRequestedAt,
    lastRequestedPlayerCount,
    respondedSinceRequest,
    playersWithAccounts: (players ?? []).filter(p => p.parent_id && memberUserIds.has(p.parent_id)).length,
  }
}

export async function updatePlayerSize(
  ...args: Parameters<typeof _updatePlayerSize>
): Promise<ActionResult<Awaited<ReturnType<typeof _updatePlayerSize>>>> {
  try {
    return { ok: true, data: await _updatePlayerSize(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _updatePlayerSize(playerId: string, jerseySize: string | null, shortsSize: string | null) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('players')
    .update({ jersey_size: jerseySize || null, shorts_size: shortsSize || null })
    .eq('id', playerId)

  if (error) throw new Error(`Failed to update size: ${error.message}`)

  revalidatePath('/dashboard/gear')
}

export interface RequestSizesResult {
  // Player accounts notified. Key name kept because attention-panel reads it.
  parentsNotified: number
  // Players missing at least one size (linked or not).
  kidsNeedingSizes: number
  alreadyComplete: boolean
  // Count of Resend rejections across the per-player fan-out. Part 1.5.
  emailFailed: number
}

export async function requestMissingSizes(
  ...args: Parameters<typeof _requestMissingSizes>
): Promise<ActionResult<Awaited<ReturnType<typeof _requestMissingSizes>>>> {
  try {
    return { ok: true, data: await _requestMissingSizes(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _requestMissingSizes(): Promise<RequestSizesResult> {
  const { profile } = await getUserProfile()

  if (profile.role !== 'doc') {
    throw new Error('Only the head coach can request sizes from players')
  }

  const service = createServiceClient()

  // Find every player in the club missing either size
  const { data: players, error } = await service
    .from('players')
    .select('id, first_name, last_name, parent_id, jersey_size, shorts_size')
    .eq('club_id', profile.club_id)
    .or('jersey_size.is.null,shorts_size.is.null')

  if (error) throw new Error(`Failed to load players: ${error.message}`)
  if (!players || players.length === 0) {
    return { parentsNotified: 0, kidsNeedingSizes: 0, alreadyComplete: true, emailFailed: 0 }
  }

  // Group player rows by linked account (players.parent_id = the player's
  // own login). Normally one row per account.
  const rowsByAccount = new Map<string, typeof players>()
  for (const p of players) {
    if (!p.parent_id) continue
    const existing = rowsByAccount.get(p.parent_id) ?? []
    existing.push(p)
    rowsByAccount.set(p.parent_id, existing)
  }

  if (rowsByAccount.size === 0) {
    return { parentsNotified: 0, kidsNeedingSizes: players.length, alreadyComplete: false, emailFailed: 0 }
  }

  // Resolve player profile ids (for push + email helpers). We filter on
  // member roles so that unlinked players, whose `parent_id` still points at
  // the DOC who added them, don't trigger a notification to the DOC about
  // their own roster. Once the player joins and is linked, they start
  // getting the reminders. Unlinked players are reached via collect links.
  const accountUserIds = Array.from(rowsByAccount.keys())
  const { data: playerProfiles } = await service
    .from('profiles')
    .select('id, user_id')
    .in('user_id', accountUserIds)
    .in('role', MEMBER_ROLES)

  if (!playerProfiles || playerProfiles.length === 0) {
    return { parentsNotified: 0, kidsNeedingSizes: players.length, alreadyComplete: false, emailFailed: 0 }
  }

  // Notify each player individually, one push+email per account. Part 1.5:
  // await the email send and sum per-account `failed.length` so the UI can
  // surface delivery failures across the whole batch.
  let emailFailed = 0
  const sends = await Promise.allSettled(
    playerProfiles.map(async account => {
      const rows = rowsByAccount.get(account.user_id) ?? []
      if (rows.length === 0) return { failed: 0 }

      const firstRowId = rows[0].id
      const title = 'Gear sizes needed'
      const message = rows.length === 1
        ? 'Please submit your jersey and shorts sizes.'
        : `Please submit jersey and shorts sizes for ${rows.map(r => `${r.first_name} ${r.last_name}`).join(' and ')}.`

      await sendPushToProfiles([account.id], {
        title,
        message,
        url: `/dashboard/players/${firstRowId}`,
        tag: 'gear_sizes_requested',
      })

      const emailResult = await sendEmailToProfiles(
        [account.id],
        'OffPitchOS: Gear sizes needed',
        message + ' Open OffPitchOS and tap the notification to submit.',
        `https://offpitchos.com/dashboard/players/${firstRowId}`,
      )
      return { failed: emailResult.failed.length }
    })
  )
  for (const r of sends) {
    if (r.status === 'fulfilled') emailFailed += r.value.failed
    // Rejected settlements mean the push send itself threw. Treat as
    // an email delivery failure for UI purposes (the player reached via
    // push isn't actually confirmed here either).
    else emailFailed += 1
  }

  // Persist the request so we can show "last requested X ago" and track responses
  await service
    .from('club_settings')
    .upsert(
      {
        club_id: profile.club_id,
        last_gear_size_request_at: new Date().toISOString(),
        last_gear_size_request_parent_count: playerProfiles.length,
      },
      { onConflict: 'club_id' }
    )

  revalidatePath('/dashboard/gear')

  return {
    parentsNotified: playerProfiles.length,
    kidsNeedingSizes: players.length,
    alreadyComplete: false,
    emailFailed,
  }
}
