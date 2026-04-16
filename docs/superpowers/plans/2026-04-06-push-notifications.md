# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser push notifications so users get instant alerts (schedule changes, coverage, announcements) even when the app isn't open — replacing the 30-second polling.

**Architecture:** Web Push API with VAPID keys. A service worker handles incoming push events. When server actions create notifications, they also send push via the `web-push` npm package. Push subscriptions are stored in a new `push_subscriptions` table. Users opt in via a prompt in the notification bell.

**Tech Stack:** Web Push API (browser), `web-push` npm package (server), Service Worker, Supabase

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/014_push_subscriptions.sql` | New table for push subscription storage |
| `lib/push.ts` | Server-side push sending via web-push |
| `app/dashboard/push-actions.ts` | Server actions — subscribe, unsubscribe |
| `public/sw.js` | Service worker — handle push events, show browser notifications |
| `components/notification-bell.tsx` | Modify — add push subscribe button, keep polling as fallback |
| `components/push-prompt.tsx` | Client component — "Enable notifications" prompt |

---

### Task 1: Install web-push + generate VAPID keys

**Files:**
- Modify: `app-next/package.json`

- [ ] **Step 1: Install web-push**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm install web-push
```

- [ ] **Step 2: Generate VAPID keys**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npx web-push generate-vapid-keys
```

Copy the output and add to `.env.local`:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/package.json app-next/package-lock.json
git commit -m "chore: install web-push for push notifications"
```

---

### Task 2: Database migration — push_subscriptions

**Files:**
- Create: `supabase/migrations/014_push_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(profile_id, endpoint)
);

create index idx_push_sub_profile on push_subscriptions(profile_id);

alter table push_subscriptions enable row level security;

create policy push_sub_own on push_subscriptions for all
  using (profile_id in (select get_user_profile_ids()));
```

- [ ] **Step 2: Apply via Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add supabase/migrations/014_push_subscriptions.sql
git commit -m "feat: add push_subscriptions table"
```

---

### Task 3: Service worker

**Files:**
- Create: `app-next/public/sw.js`

- [ ] **Step 1: Create the service worker**

```javascript
self.addEventListener('push', function(event) {
  if (!event.data) return

  const data = event.data.json()

  const options = {
    body: data.message || 'New notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'offpitchos',
    data: {
      url: data.url || '/dashboard',
    },
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'OffPitchOS', options)
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/public/sw.js
git commit -m "feat: add service worker for push notification handling"
```

---

### Task 4: Server-side push sending

**Files:**
- Create: `app-next/lib/push.ts`

- [ ] **Step 1: Create the push utility**

```typescript
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

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      ).catch(async (err) => {
        // Remove expired/invalid subscriptions
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/lib/push.ts
git commit -m "feat: add server-side push notification sending via web-push"
```

---

### Task 5: Push subscription server actions

**Files:**
- Create: `app-next/app/dashboard/push-actions.ts`

- [ ] **Step 1: Create the push actions**

```typescript
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

export async function isPushSubscribed(): Promise<boolean> {
  const { profile, supabase } = await getUserProfile()

  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profile.id)

  return (count ?? 0) > 0
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/push-actions.ts
git commit -m "feat: add push subscription server actions"
```

---

### Task 6: Push prompt component + notification bell integration

**Files:**
- Create: `app-next/components/push-prompt.tsx`
- Modify: `app-next/components/notification-bell.tsx`

- [ ] **Step 1: Create the push prompt component**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { subscribePush, unsubscribePush } from '@/app/dashboard/push-actions'

export default function PushPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)

    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub)
      })
    })
  }, [])

  async function handleEnable() {
    setLoading(true)
    try {
      // Register service worker if not registered
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Request permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setLoading(false)
        return
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
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
    </div>
  )
}
```

- [ ] **Step 2: Add PushPrompt to notification bell dropdown**

In `components/notification-bell.tsx`, import `PushPrompt`:
```typescript
import PushPrompt from './push-prompt'
```

Add `<PushPrompt />` at the bottom of the notification dropdown, just before the closing `</div>` of the dropdown container.

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/components/push-prompt.tsx app-next/components/notification-bell.tsx
git commit -m "feat: add push notification prompt in notification bell"
```

---

### Task 7: Wire push sending into notification creation

**Files:**
- Modify: `app-next/app/dashboard/coverage/actions.ts`
- Modify: `app-next/app/dashboard/messages/actions.ts`
- Modify: `app-next/app/dashboard/schedule/actions.ts`

- [ ] **Step 1: Add push to coverage notification helpers**

In `app/dashboard/coverage/actions.ts`, import push:
```typescript
import { sendPushToProfiles } from '@/lib/push'
```

In `notifySpecificProfiles`, add after the DB insert:
```typescript
await sendPushToProfiles(profileIds, { title: 'OffPitchOS', message, url: '/dashboard/coverage', tag: type })
```

In `notifyClubCoaches`, add after the DB insert:
```typescript
const coachIds = coaches.map(c => c.id)
await sendPushToProfiles(coachIds, { title: 'OffPitchOS', message, url: '/dashboard/coverage', tag: type })
```

- [ ] **Step 2: Add push to schedule notification helper**

In `app/dashboard/schedule/actions.ts`, import push:
```typescript
import { sendPushToProfiles } from '@/lib/push'
```

In `notifyTeamMembers`, add after the DB insert:
```typescript
const memberIds = members.map(m => m.profile_id)
await sendPushToProfiles(memberIds, { title: 'OffPitchOS', message, url: '/dashboard/schedule', tag: type })
```

- [ ] **Step 3: Add push to messages notification**

In `app/dashboard/messages/actions.ts`, import push:
```typescript
import { sendPushToProfiles } from '@/lib/push'
```

After each notification insert in `createAnnouncement` and `createReply`, add:
```typescript
await sendPushToProfiles(recipientIds, { title: 'OffPitchOS', message: `New: ${input.title}`, url: '/dashboard/messages', tag: 'announcement' })
```

- [ ] **Step 4: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/coverage/actions.ts app-next/app/dashboard/schedule/actions.ts app-next/app/dashboard/messages/actions.ts
git commit -m "feat: send push notifications alongside in-app notifications"
```

---

### Task 8: End-to-end test

- [ ] **Step 1: Apply migration in Supabase SQL Editor**

- [ ] **Step 2: Generate VAPID keys and add to .env.local**

- [ ] **Step 3: Open notification bell dropdown**

Verify "Enable push notifications" button appears at the bottom.

- [ ] **Step 4: Click "Enable push notifications"**

Browser should prompt for notification permission. Allow it. Button should change to "Push notifications on".

- [ ] **Step 5: Test receiving a push**

From another tab or via voice command, cancel an event or post an announcement. Verify a browser push notification appears.

- [ ] **Step 6: Test notification click**

Click the push notification — verify it opens the app to the correct page.

- [ ] **Step 7: Final commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add -A
git commit -m "feat: push notifications — real-time alerts for schedule, coverage, and announcements"
```
