'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendCoachInviteEmail } from '@/lib/email'

export async function inviteCoach(
  formData: FormData,
): Promise<{ emailSent: boolean; emailError?: string }> {
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

  // Send invite email. The invite row already exists; an email failure
  // should not nuke the server action — the DOC can still copy the join
  // link from Pending Invites. Surface the state truthfully to the UI.
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('id', profile.club_id)
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  revalidatePath('/dashboard/coaches')

  try {
    await sendCoachInviteEmail({
      to: email.trim(),
      clubName: club?.name ?? 'your club',
      joinUrl: `${baseUrl}/join/${invite.token}`,
    })
    return { emailSent: true }
  } catch (err) {
    return {
      emailSent: false,
      emailError: err instanceof Error ? err.message : 'Unknown email error',
    }
  }
}

export async function resendInvite(
  inviteId: string,
): Promise<{ emailSent: boolean; emailError?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') {
    throw new Error('Only the Director of Coaching can resend invites')
  }

  // Fetch the invite to know email/role + scope it to this club
  const { data: invite, error: fetchError } = await supabase
    .from('invites')
    .select('id, email, role, token, status')
    .eq('id', inviteId)
    .eq('club_id', profile.club_id)
    .single()

  if (fetchError || !invite) throw new Error('Invite not found')
  if (invite.status !== 'pending') throw new Error('Only pending invites can be resent')

  // Bump created_at so the "older than 3 days" attention signal clears for a fresh window
  await supabase
    .from('invites')
    .update({ created_at: new Date().toISOString() })
    .eq('id', invite.id)

  // For coach invites with an email, re-send the invite email.
  // Parent invites don't currently send email (token is shared manually),
  // so for them we just bump the timestamp and consider it "resent".
  let emailSent = false
  if (invite.role === 'coach' && invite.email) {
    const { data: club } = await supabase
      .from('clubs')
      .select('name')
      .eq('id', profile.club_id)
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    try {
      await sendCoachInviteEmail({
        to: invite.email,
        clubName: club?.name ?? 'your club',
        joinUrl: `${baseUrl}/join/${invite.token}`,
      })
      emailSent = true
    } catch (err) {
      revalidatePath('/dashboard/coaches')
      revalidatePath('/dashboard')
      return {
        emailSent: false,
        emailError: err instanceof Error ? err.message : 'Unknown email error',
      }
    }
  }

  revalidatePath('/dashboard/coaches')
  revalidatePath('/dashboard')
  return { emailSent }
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
