'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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

// Both of the actions below used to delete from team_members and profiles
// inline, unchecked, and then return success. Neither delete ever landed:
// profiles has no DELETE policy at all and team_members only has
// team_members_doc_all, so as the user themselves both matched zero rows.
// Zero-row DELETEs raise no error, so the app reported success while nothing
// happened. Migration 037 replaces them with SECURITY DEFINER RPCs.

export async function leaveClub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // The DOC guard now lives in the RPC too, so it holds even if something
  // else ever calls this.
  const { error } = await supabase.rpc('leave_own_club')
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Soft delete: scrubs display_name, sets deleted_at, drops team memberships
  // and nulls club_id. Nulling club_id is what removes them from the DOC's
  // roster, since profiles_doc_read matches on club_id.
  const { error } = await supabase.rpc('soft_delete_own_profile')
  if (error) return { error: error.message }

  // Ban rather than delete the auth row. profiles.user_id -> auth.users is
  // ON DELETE CASCADE, so deleting the auth user would try to hard-delete the
  // profile and fail against the NO ACTION foreign keys from
  // camp_registrations, drill_versions and player_feedback. Banning stops
  // sign-in without touching any history.
  const service = createServiceClient()
  const { error: banError } = await service.auth.admin.updateUserById(user.id, {
    ban_duration: '876000h', // ~100 years
  })

  if (banError) {
    // The profile is already scrubbed and detached, so their data is gone
    // either way. Say so plainly rather than claiming a clean success.
    return {
      error: `Your data was removed, but sign-in could not be disabled: ${banError.message}. Contact support.`,
    }
  }

  await supabase.auth.signOut()
  return { success: true }
}
