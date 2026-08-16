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

  // The auth row is anonymised in place rather than deleted.
  //
  // It cannot be DELETED: profiles.user_id -> auth.users is ON DELETE CASCADE,
  // so removing it would try to hard-delete the profile and fail against the
  // NO ACTION foreign keys from camp_registrations, drill_versions and
  // player_feedback. But it does not need to be deleted to remove the personal
  // data — overwriting the identifying fields severs them while every foreign
  // key stays intact.
  //
  // Both fields matter. soft_delete_own_profile() scrubs profiles.display_name
  // and nothing else, so without this the account kept:
  //   - email          the address itself
  //   - user_metadata  display_name / full_name / name, which is where the
  //                    real name lives for Google sign-ins
  //
  // The replacement address uses the .invalid TLD (RFC 2606), which is
  // guaranteed never to resolve, and embeds the user id so it cannot collide
  // with another scrubbed account. email_confirm marks it settled so Supabase
  // does not try to send a confirmation to an unroutable address.
  //
  // Metadata keys are set to null individually rather than replacing the whole
  // object, because the admin API merges user_metadata rather than overwriting
  // it — assigning {} would leave the existing keys in place.
  const service = createServiceClient()

  // invites.email is the one other column in the schema that stores an address,
  // and an accepted invite keeps it forever. Cleared here, while user.email is
  // still readable, i.e. before the auth row is anonymised below.
  //
  // The email is nulled rather than the row deleted, for the same reason the
  // profile is soft-deleted: the club keeps the record that an invite existed
  // without keeping who it was for. Any still-pending invite is also revoked,
  // since it now points at an account that cannot sign in.
  //
  // ilike, not eq, because invites.email is stored as the DOC typed it while
  // auth lowercases. The pattern is escaped first: an unescaped `_` is a
  // single-character wildcard in LIKE and underscores are common in email
  // addresses, so `john_doe@x.com` would otherwise also match `johnXdoe@x.com`.
  if (user.email) {
    const pattern = user.email.replace(/([%_\\])/g, '\\$1')
    await service.from('invites')
      .update({ status: 'revoked' })
      .ilike('email', pattern)
      .eq('status', 'pending')
    await service.from('invites')
      .update({ email: null })
      .ilike('email', pattern)
  }

  const { error: scrubError } = await service.auth.admin.updateUserById(user.id, {
    email: `deleted-${user.id}@deleted.invalid`,
    email_confirm: true,
    user_metadata: {
      display_name: null,
      full_name: null,
      name: null,
      avatar_url: null,
      picture: null,
      email: null,
    },
    ban_duration: '876000h', // ~100 years
  })

  if (scrubError) {
    // The profile is already scrubbed and detached, but the auth row still
    // holds the email and name, and sign-in still works. Say exactly that
    // rather than reporting a clean success.
    return {
      error: `Your club data was removed, but your email and sign-in could not be cleared: ${scrubError.message}. Contact support so it can be finished.`,
    }
  }

  await supabase.auth.signOut()
  return { success: true }
}
