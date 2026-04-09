'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'
import { sendEmailToProfiles } from '@/lib/email'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
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
  players: { id: string; firstName: string; lastName: string; jerseySize: string | null; shortsSize: string | null }[]
}

export interface GearData {
  teams: TeamGearSummary[]
  userRole: string
  lastRequestedAt: string | null
  lastRequestedParentCount: number
  respondedSinceRequest: number
}

export async function getGearData(): Promise<GearData> {
  const { profile, supabase } = await getUserProfile()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)
    .order('age_group', { ascending: true })

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, team_id, jersey_size, shorts_size')
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
  const lastRequestedParentCount = settings?.last_gear_size_request_parent_count ?? 0

  let respondedSinceRequest = 0
  if (lastRequestedAt) {
    // Count distinct parents whose kids had a row update since the request AND
    // whose kids now have both sizes filled.
    const { data: updatedPlayers } = await supabase
      .from('players')
      .select('parent_id')
      .eq('club_id', profile.club_id)
      .not('jersey_size', 'is', null)
      .not('shorts_size', 'is', null)
      .gt('updated_at', lastRequestedAt)

    const parentSet = new Set((updatedPlayers ?? []).map(p => p.parent_id))
    respondedSinceRequest = parentSet.size
  }

  return {
    teams: teamSummaries,
    userRole: profile.role,
    lastRequestedAt,
    lastRequestedParentCount,
    respondedSinceRequest,
  }
}

export async function updatePlayerSize(playerId: string, jerseySize: string | null, shortsSize: string | null) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('players')
    .update({ jersey_size: jerseySize || null, shorts_size: shortsSize || null })
    .eq('id', playerId)

  if (error) throw new Error(`Failed to update size: ${error.message}`)

  revalidatePath('/dashboard/gear')
}

export interface RequestSizesResult {
  parentsNotified: number
  kidsNeedingSizes: number
  alreadyComplete: boolean
}

export async function requestMissingSizes(): Promise<RequestSizesResult> {
  const { profile } = await getUserProfile()

  if (profile.role !== 'doc') {
    throw new Error('Only directors can request sizes from parents')
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
    return { parentsNotified: 0, kidsNeedingSizes: 0, alreadyComplete: true }
  }

  // Group kids by parent auth-user id
  const kidsByParent = new Map<string, typeof players>()
  for (const p of players) {
    if (!p.parent_id) continue
    const existing = kidsByParent.get(p.parent_id) ?? []
    existing.push(p)
    kidsByParent.set(p.parent_id, existing)
  }

  if (kidsByParent.size === 0) {
    return { parentsNotified: 0, kidsNeedingSizes: players.length, alreadyComplete: false }
  }

  // Get parent profile ids (for push + email helpers)
  const parentUserIds = Array.from(kidsByParent.keys())
  const { data: parentProfiles } = await service
    .from('profiles')
    .select('id, user_id')
    .in('user_id', parentUserIds)

  if (!parentProfiles || parentProfiles.length === 0) {
    return { parentsNotified: 0, kidsNeedingSizes: players.length, alreadyComplete: false }
  }

  // Notify each parent individually — personalized message per parent, but only one push+email per parent
  await Promise.allSettled(
    parentProfiles.map(async parent => {
      const kids = kidsByParent.get(parent.user_id) ?? []
      if (kids.length === 0) return

      const kidNames = kids.map(k => `${k.first_name} ${k.last_name}`).join(' and ')
      const firstKidId = kids[0].id
      const title = 'Gear sizes needed'
      const message = `Please submit jersey and shorts sizes for ${kidNames}.`

      await sendPushToProfiles([parent.id], {
        title,
        message,
        url: `/dashboard/players/${firstKidId}`,
        tag: 'gear_sizes_requested',
      })

      sendEmailToProfiles(
        [parent.id],
        'OffPitchOS — Gear sizes needed',
        message + ' Open OffPitchOS and tap the notification to submit.',
        `https://offpitchos.com/dashboard/players/${firstKidId}`,
      )
    })
  )

  // Persist the request so we can show "last requested X ago" and track responses
  await service
    .from('club_settings')
    .upsert(
      {
        club_id: profile.club_id,
        last_gear_size_request_at: new Date().toISOString(),
        last_gear_size_request_parent_count: parentProfiles.length,
      },
      { onConflict: 'club_id' }
    )

  revalidatePath('/dashboard/gear')

  return {
    parentsNotified: parentProfiles.length,
    kidsNeedingSizes: players.length,
    alreadyComplete: false,
  }
}
