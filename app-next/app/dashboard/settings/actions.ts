'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateDisplayName(name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name cannot be empty' }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function updateClubName(name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Club name cannot be empty' }

  // Only DOCs can update club name
  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') return { error: 'Only the Director of Coaching can change the club name' }

  const { error } = await supabase
    .from('clubs')
    .update({ name: trimmed })
    .eq('id', profile.club_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function leaveClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role === 'doc') return { error: 'DOC cannot leave their own club. Transfer ownership first.' }

  // Look up the profile PK to delete team_members by profile_id
  const { data: fullProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (fullProfile) {
    await supabase.from('team_members').delete().eq('profile_id', fullProfile.id)
  }
  await supabase.from('profiles').delete().eq('user_id', user.id)

  return { success: true }
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Look up the profile PK to delete team_members by profile_id
  const { data: delProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (delProfile) {
    await supabase.from('team_members').delete().eq('profile_id', delProfile.id)
  }
  await supabase.from('profiles').delete().eq('user_id', user.id)
  await supabase.auth.signOut()

  return { success: true }
}
