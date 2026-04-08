'use client'

import { useState, useEffect } from 'react'
import { subscribePush, unsubscribePush } from '@/app/dashboard/push-actions'

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

export default function PushPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)

    // Only check existing subscription if a service worker is already registered.
    // navigator.serviceWorker.ready hangs forever if none has ever been registered.
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub)
      })
    })
  }, [])

  async function handleEnable() {
    setLoading(true)
    setError(null)
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setError('Push is not configured on this server.')
        return
      }

      // Register service worker (idempotent — returns existing registration if any)
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Request permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm === 'denied') {
        setError('Notifications are blocked. Enable them in your browser settings and try again.')
        return
      }
      if (perm !== 'granted') {
        setError('Notification permission was not granted.')
        return
      }

      // Subscribe to push — applicationServerKey MUST be a Uint8Array, not a base64 string.
      // Cast is needed because TS types want ArrayBuffer specifically, not ArrayBufferLike.
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })

      const json = sub.toJSON()
      await subscribePush({
        endpoint: json.endpoint!,
        keys: {
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
      })

      setSubscribed(true)
    } catch (err) {
      console.error('Push subscription failed:', err)
      const message = err instanceof Error ? err.message : 'Push subscription failed.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await unsubscribePush(sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {}
    setLoading(false)
  }

  if (permission === 'unsupported') return null

  return (
    <div className="px-3 py-2 border-t border-white/5">
      {!subscribed ? (
        <button
          onClick={handleEnable}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-gray hover:text-white transition-colors w-full"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {loading ? 'Enabling...' : 'Enable push notifications'}
        </button>
      ) : (
        <button
          onClick={handleDisable}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-green hover:text-green/70 transition-colors w-full"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Push notifications on
        </button>
      )}
      {error && (
        <p className="text-[11px] text-red-400 mt-1.5 leading-snug">{error}</p>
      )}
    </div>
  )
}
