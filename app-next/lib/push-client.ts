// Browser-side Web Push subscribe flow, shared by the bell's PushPrompt and the
// dashboard install/notifications card. Client components only.
import { subscribePush } from '@/app/dashboard/push-actions'

// Convert a base64url VAPID public key into the Uint8Array format
// required by PushManager.subscribe's applicationServerKey option.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

export type EnablePushResult =
  | { ok: true; permission: 'granted' }
  | { ok: false; permission: NotificationPermission; error: string }

/**
 * Ask for permission, register /sw.js, subscribe, and save the subscription.
 * Call straight from a tap handler: permission is requested FIRST, before any
 * other await, because iOS only shows the prompt inside a live user gesture.
 */
export async function enablePushNotifications(): Promise<EnablePushResult> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    return { ok: false, permission: Notification.permission, error: 'Push is not configured on this server.' }
  }

  const permission = await Notification.requestPermission()
  if (permission === 'denied') {
    return { ok: false, permission, error: 'Notifications are blocked. Enable them in your settings and try again.' }
  }
  if (permission !== 'granted') {
    return { ok: false, permission, error: 'Notification permission was not granted.' }
  }

  try {
    // Idempotent: returns the existing registration if there is one.
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // applicationServerKey MUST be a Uint8Array, not a base64 string. Cast is
    // needed because TS wants ArrayBuffer specifically, not ArrayBufferLike.
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })

    const json = sub.toJSON()
    const res = await subscribePush({
      endpoint: json.endpoint!,
      keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
    })
    if (!res.ok) return { ok: false, permission, error: res.error }
    return { ok: true, permission: 'granted' }
  } catch (err) {
    console.error('Push subscription failed:', err)
    return { ok: false, permission, error: err instanceof Error ? err.message : 'Push subscription failed.' }
  }
}
