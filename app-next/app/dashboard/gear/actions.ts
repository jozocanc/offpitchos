'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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

export async function getGearData(): Promise<{ teams: TeamGearSummary[]; userRole: string }> {
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

  return { teams: teamSummaries, userRole: profile.role }
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
