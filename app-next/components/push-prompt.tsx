'use client'

import { useState, useEffect } from 'react'
import { unsubscribePush } from '@/app/dashboard/push-actions'
import { enablePushNotifications, isPushSupported } from '@/lib/push-client'

export default function PushPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) {
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
    const res = await enablePushNotifications()
    setPermission(res.permission)
    if (res.ok) setSubscribed(true)
    else setError(res.error)
    setLoading(false)
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
