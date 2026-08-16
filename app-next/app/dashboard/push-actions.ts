'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { type ActionResult, toActionError } from '@/lib/action-result'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) throw new Error('No profile found')
  return { profile, supabase }
}

export async function subscribePush(
  ...args: Parameters<typeof _subscribePush>
): Promise<ActionResult<Awaited<ReturnType<typeof _subscribePush>>>> {
  try {
    return { ok: true, data: await _subscribePush(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _subscribePush(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}) {
  const { profile, supabase } = await getUserProfile()

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profile.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'profile_id,endpoint' }
  )

  if (error) throw new Error(`Failed to save subscription: ${error.message}`)
}

export async function unsubscribePush(
  ...args: Parameters<typeof _unsubscribePush>
): Promise<ActionResult<Awaited<ReturnType<typeof _unsubscribePush>>>> {
  try {
    return { ok: true, data: await _unsubscribePush(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _unsubscribePush(endpoint: string) {
  const { profile, supabase } = await getUserProfile()

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('profile_id', profile.id)
    .eq('endpoint', endpoint)
}
