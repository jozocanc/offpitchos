'use server'

import { createClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/app-url'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendCoachInviteEmail } from '@/lib/email'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { createServiceClient } from '@/lib/supabase/service'
import { ROLES, STAFF_TITLES, DEFAULT_STAFF_TITLE } from '@/lib/constants'

type InviteEmailState = { emailSent: boolean; emailError?: string }

export async function inviteCoach(
  formData: FormData,
): Promise<ActionResult<InviteEmailState>> {
 try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email = formData.get('email') as string
  const teamId = formData.get('teamId') as string | null
  const titleInput = (formData.get('staffTitle') as string | null) ?? DEFAULT_STAFF_TITLE
  const staffTitle = (STAFF_TITLES as readonly string[]).includes(titleInput) ? titleInput : DEFAULT_STAFF_TITLE

  if (!email?.trim()) {
    throw new Error('Email is required')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile?.club_id) {
    throw new Error('Could not find your club')
  }
  if (profile.role !== ROLES.DOC) throw new Error('Only the head coach can invite staff')

  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      club_id: profile.club_id,
      team_id: teamId || null,
      email: email.trim(),
      role: 'coach',
      staff_title: staffTitle,
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

  const baseUrl = appUrl()

  revalidatePath('/dashboard/coaches')

  try {
    await sendCoachInviteEmail({
      to: email.trim(),
      clubName: club?.name ?? 'your club',
      joinUrl: `${baseUrl}/join/${invite.token}`,
    })
    return { ok: true, data: { emailSent: true } }
  } catch (err) {
    // An email failure is NOT an action failure: the invite row already
    // exists and the DOC can copy the join link from Pending Invites.
    // Reported as a successful action carrying emailSent: false.
    return {
      ok: true,
      data: {
        emailSent: false,
        emailError: err instanceof Error ? err.message : 'Unknown email error',
      },
    }
  }
 } catch (e) {
  return toActionError(e)
 }
}

export async function resendInvite(
  inviteId: string,
): Promise<ActionResult<InviteEmailState>> {
 try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') {
    throw new Error('Only the head coach can resend invites')
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

    const baseUrl = appUrl()
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
        ok: true,
        data: {
          emailSent: false,
          emailError: err instanceof Error ? err.message : 'Unknown email error',
        },
      }
    }
  }

  revalidatePath('/dashboard/coaches')
  revalidatePath('/dashboard')
  return { ok: true, data: { emailSent } }
 } catch (e) {
  return toActionError(e)
 }
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
 try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') {
    throw new Error('Only the head coach can revoke invites')
  }

  const { error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to revoke invite: ${error.message}`)

  revalidatePath('/dashboard/coaches')
  return { ok: true, data: undefined }
 } catch (e) {
  return toActionError(e)
 }
}

// The head coach relabels a staff member. Title only, never the role: every
// titled coach keeps the same staff permissions. Service client because
// profiles_own_update only lets a user edit their own row, and the privilege
// guard (migration 051) blocks anyone setting their own title.
export async function updateCoachTitle(
  profileId: string,
  staffTitle: string,
): Promise<ActionResult<null>> {
 try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== ROLES.DOC || !profile.club_id) {
    throw new Error('Only the head coach can change staff titles')
  }
  if (!(STAFF_TITLES as readonly string[]).includes(staffTitle)) {
    throw new Error('Pick a title from the list')
  }

  const { data, error } = await createServiceClient()
    .from('profiles')
    .update({ staff_title: staffTitle })
    .eq('id', profileId)
    .eq('club_id', profile.club_id)
    .eq('role', ROLES.COACH)
    .select('id')

  if (error) throw new Error(`Couldn't update title: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Coach not found on your team')

  revalidatePath('/dashboard/coaches')
  return { ok: true, data: null }
 } catch (e) {
  return toActionError(e)
 }
}
