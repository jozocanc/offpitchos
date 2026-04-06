'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

export async function subscribePush(subscription: {
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

export async function unsubscribePush(endpoint: string) {
  const { profile, supabase } = await getUserProfile()

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('profile_id', profile.id)
    .eq('endpoint', endpoint)
}
