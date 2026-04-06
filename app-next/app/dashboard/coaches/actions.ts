'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendCoachInviteEmail } from '@/lib/email'

export async function inviteCoach(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email = formData.get('email') as string
  const teamId = formData.get('teamId') as string | null

  if (!email?.trim()) {
    throw new Error('Email is required')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile?.club_id) {
    throw new Error('Could not find your club')
  }

  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      club_id: profile.club_id,
      team_id: teamId || null,
      email: email.trim(),
      role: 'coach',
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error) throw new Error(`Failed to create invite: ${error.message}`)

  // Send invite email (best-effort — don't block on failure)
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('id', profile.club_id)
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  await sendCoachInviteEmail({
    to: email.trim(),
    clubName: club?.name ?? 'your club',
    joinUrl: `${baseUrl}/join/${invite.token}`,
  }).catch(err => console.error('Email send failed (non-blocking):', err))

  revalidatePath('/dashboard/coaches')
}

export async function revokeInvite(inviteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') {
    throw new Error('Only the Director of Coaching can revoke invites')
  }

  const { error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to revoke invite: ${error.message}`)

  revalidatePath('/dashboard/coaches')
}
