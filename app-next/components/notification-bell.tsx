'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PushPrompt from './push-prompt'

interface Notification {
  id: string
  event_id: string
  type: string
  message: string
  read: boolean
  created_at: string
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    loadNotifications()

    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000)

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      clearInterval(interval)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  async function loadNotifications() {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('notifications')
        .select('id, event_id, type, message, read, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.read).length)
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
    }
  }

  async function markAsRead(notificationId: string) {
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    const supabase = createClient()
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return

    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unreadIds)

    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) loadNotifications() }}
        className="relative text-gray hover:text-white transition-colors p-1"
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-secondary rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden toast-enter">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-sm font-bold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-green hover:text-green/80 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-gray text-sm text-center py-8">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    markAsRead(n.id)
                    setOpen(false)
                    if (n.type === 'announcement_posted' || n.type === 'announcement_reply') {
                      router.push('/dashboard/messages')
                    } else if (n.type?.startsWith('coverage_')) {
                      router.push('/dashboard/coverage')
                    } else {
                      router.push('/dashboard/schedule')
                    }
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors ${
                    !n.read ? 'bg-green/[0.03]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="w-2 h-2 bg-green rounded-full mt-1.5 shrink-0" />
                    )}
                    <div className={!n.read ? '' : 'pl-4'}>
                      <p className="text-sm text-white">{n.message}</p>
                      <p className="text-xs text-gray mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <PushPrompt />
        </div>
      )}
    </div>
  )
}
