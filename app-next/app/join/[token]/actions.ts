'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type AcceptInviteResult = { ok: false; error: string }

export async function acceptInvite(formData: FormData): Promise<AcceptInviteResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const token = formData.get('token') as string
  if (!token) return { ok: false, error: 'Invalid invite token' }

  // display_name is set by email signup (signup/page.tsx:30) and is the
  // canonical name field — it must win the fallback, otherwise the name the
  // user typed gets overwritten with their email local-part. Same rule as
  // onboarding/actions.ts and join/code/[code]/actions.ts.
  const displayName =
    (user.user_metadata?.display_name as string) ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    'User'

  // One SECURITY DEFINER RPC does the whole accept atomically: validate,
  // upsert profile, upsert team membership, claim any targeted player, and
  // mark the invite accepted. See migration 033.
  //
  // It has to be SECURITY DEFINER because this runs as the INVITEE, who is
  // never a DOC. Done inline, the `invites` update cannot satisfy
  // invites_doc_all and the player claim cannot satisfy players_parent_own
  // (parent_id = auth.uid() is false *before* the claim), so both writes were
  // silently dropped by RLS — zero-row UPDATEs raise no error. The invite
  // therefore stayed 'pending' forever and the link remained reusable.
  const { error } = await supabase.rpc('accept_invite_by_token', {
    p_token: token,
    p_display_name: displayName,
  })

  // Returned rather than thrown: Next redacts thrown server-action messages in
  // production, which would turn "This invite has expired" into a digest string.
  if (error) return { ok: false, error: error.message }

  redirect('/dashboard')
}
