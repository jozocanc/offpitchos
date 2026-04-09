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

export async function getPlayerProfile(playerId: string) {
  const { user, profile, supabase } = await getUserProfile()

  // Get player info
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, position, date_of_birth, notes, jersey_size, shorts_size, team_id, parent_id, teams(name, age_group)')
    .eq('id', playerId)
    .eq('club_id', profile.club_id)
    .single()

  if (!player) throw new Error('Player not found')

  const isParent = player.parent_id === user.id

  // Get feedback history
  const { data: feedback } = await supabase
    .from('player_feedback')
    .select('id, category, rating, notes, created_at, coach_id, event_id, profiles(display_name), events(title, type, start_time)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Get recent events for the player's team (for linking feedback to events)
  const { data: recentEvents } = await supabase
    .from('events')
    .select('id, title, type, start_time')
    .eq('team_id', player.team_id)
    .eq('status', 'scheduled')
    .order('start_time', { ascending: false })
    .limit(20)

  // Calculate category averages
  const categoryAverages: Record<string, { total: number; count: number; avg: number }> = {}
  for (const f of feedback ?? []) {
    if (f.rating) {
      if (!categoryAverages[f.category]) {
        categoryAverages[f.category] = { total: 0, count: 0, avg: 0 }
      }
      categoryAverages[f.category].total += f.rating
      categoryAverages[f.category].count += 1
      categoryAverages[f.category].avg = Math.round((categoryAverages[f.category].total / categoryAverages[f.category].count) * 10) / 10
    }
  }

  return {
    player,
    feedback: feedback ?? [],
    recentEvents: recentEvents ?? [],
    categoryAverages,
    userRole: profile.role,
    userProfileId: profile.id,
    isParent,
  }
}

export async function submitPlayerSize(
  playerId: string,
  jerseySize: string | null,
  shortsSize: string | null,
) {
  const { user, profile, supabase } = await getUserProfile()

  // Verify the caller is either the parent of this player OR staff (doc/coach in this club)
  const { data: player } = await supabase
    .from('players')
    .select('parent_id, club_id')
    .eq('id', playerId)
    .single()

  if (!player) throw new Error('Player not found')

  const isParent = player.parent_id === user.id
  const isStaff = (profile.role === 'doc' || profile.role === 'coach') && player.club_id === profile.club_id

  if (!isParent && !isStaff) {
    throw new Error('You are not authorized to update this player')
  }

  const { error } = await supabase
    .from('players')
    .update({
      jersey_size: jerseySize || null,
      shorts_size: shortsSize || null,
    })
    .eq('id', playerId)

  if (error) throw new Error(`Failed to update size: ${error.message}`)

  revalidatePath(`/dashboard/players/${playerId}`)
  revalidatePath('/dashboard/gear')
}

export async function addFeedback(input: {
  playerId: string
  eventId: string | null
  category: string
  rating: number
  notes: string
}) {
  const { profile, supabase } = await getUserProfile()

  if (profile.role !== 'doc' && profile.role !== 'coach') {
    throw new Error('Only coaches and directors can add feedback')
  }

  if (!input.notes.trim()) throw new Error('Feedback notes are required')

  const { error } = await supabase.from('player_feedback').insert({
    player_id: input.playerId,
    club_id: profile.club_id,
    coach_id: profile.id,
    event_id: input.eventId || null,
    category: input.category,
    rating: input.rating,
    notes: input.notes.trim(),
  })

  if (error) throw new Error(`Failed to save feedback: ${error.message}`)

  revalidatePath(`/dashboard/players/${input.playerId}`)
}
