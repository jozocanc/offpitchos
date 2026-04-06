import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

webpush.setVapidDetails(
  'mailto:support@offpitchos.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToProfiles(
  profileIds: string[],
  payload: { title: string; message: string; url?: string; tag?: string }
) {
  if (profileIds.length === 0) return

  const service = createServiceClient()

  const { data: subscriptions } = await service
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile_id')
    .in('profile_id', profileIds)

  if (!subscriptions || subscriptions.length === 0) return

  const body = JSON.stringify(payload)

  await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      ).catch(async (err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await service
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id)
        }
      })
    )
  )
}
