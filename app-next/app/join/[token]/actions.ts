'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ROLES } from '@/lib/constants'

export async function acceptInvite(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const token = formData.get('token') as string
  if (!token) throw new Error('Invalid invite token')

  // Look up invite via RPC
  const { data: inviteRaw, error: inviteError } = await supabase
    .rpc('get_invite_by_token', { invite_token: token })
    .single()

  if (inviteError || !inviteRaw) throw new Error('Invite not found')

  const invite = inviteRaw as {
    id: string
    club_id: string
    team_id: string | null
    role: string
    status: string
    expires_at: string | null
  }

  if (invite.status !== 'pending') throw new Error('This invite has already been used or revoked')
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('This invite has expired')
  }

  // Upsert the profile for this user
  const displayName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    'User'

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      club_id: invite.club_id,
      role: invite.role === 'coach' ? ROLES.COACH : ROLES.PARENT,
      display_name: displayName,
      onboarding_complete: true,
    }, { onConflict: 'user_id' })

  if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`)

  // Add to team if invite has a team_id
  if (invite.team_id) {
    // Get the profile id we just created/updated
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (profile) {
      const { error: memberError } = await supabase
        .from('team_members')
        .upsert({
          team_id: invite.team_id,
          profile_id: profile.id,
          role: invite.role,
        }, { onConflict: 'team_id,profile_id' })

      if (memberError) throw new Error(`Failed to join team: ${memberError.message}`)
    }
  }

  // Mark invite as accepted
  await supabase
    .from('invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('token', token)

  redirect('/dashboard')
}
