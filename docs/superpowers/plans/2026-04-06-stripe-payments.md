# Stripe Connect Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable clubs to collect camp payments from parents via Stripe Connect — DOC connects their Stripe account, parents pay through Stripe Checkout, payments go directly to the club.

**Architecture:** DOC clicks "Connect Stripe" in settings → redirected to Stripe Connect onboarding → Stripe account ID stored in club_settings. When parent registers for a camp, they're redirected to a Stripe Checkout session that charges the camp fee. A webhook confirms payment and auto-updates the registration to "paid". Platform takes a configurable fee (default 0% for now).

**Tech Stack:** Stripe Connect (Express accounts), Stripe Checkout, `stripe` npm package, webhooks via API route

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/015_stripe_connect.sql` | Add stripe_account_id to club_settings |
| `lib/stripe.ts` | Stripe client initialization |
| `app/api/stripe/connect/route.ts` | API route — handle Stripe Connect OAuth redirect |
| `app/api/stripe/webhook/route.ts` | API route — handle Stripe webhook events |
| `app/dashboard/settings/stripe-connect.tsx` | Client component — Connect Stripe button in settings |
| `app/dashboard/settings/actions.ts` or settings page | Modify — add Stripe connect actions |
| `app/dashboard/camps/actions.ts` | Modify — create Checkout session for camp registration |
| `app/dashboard/camps/register-modal.tsx` | Modify — redirect to Stripe Checkout instead of free registration |

---

### Task 1: Database migration + Stripe client

**Files:**
- Create: `supabase/migrations/015_stripe_connect.sql`
- Create: `app-next/lib/stripe.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Add Stripe Connect account ID to club_settings
alter table club_settings add column stripe_account_id text;
```

- [ ] **Step 2: Create Stripe client**

```typescript
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add supabase/migrations/015_stripe_connect.sql app-next/lib/stripe.ts
git commit -m "feat: add Stripe client and stripe_account_id migration"
```

---

### Task 2: Stripe Connect onboarding flow

**Files:**
- Create: `app-next/app/api/stripe/connect/route.ts`
- Create: `app-next/app/dashboard/settings/stripe-connect.tsx`

- [ ] **Step 1: Create the Connect API route**

This handles creating a Stripe Connect account and returning the onboarding URL.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'doc') {
    return NextResponse.json({ error: 'Only directors can connect Stripe' }, { status: 403 })
  }

  // Check if club already has a Stripe account
  const { data: settings } = await supabase
    .from('club_settings')
    .select('stripe_account_id')
    .eq('club_id', profile.club_id)
    .single()

  let accountId = settings?.stripe_account_id

  if (!accountId) {
    // Create a new Connect Express account
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })
    accountId = account.id

    // Save to club_settings
    await supabase
      .from('club_settings')
      .upsert({
        club_id: profile.club_id,
        stripe_account_id: accountId,
      }, { onConflict: 'club_id' })
  }

  // Create onboarding link
  const origin = req.headers.get('origin') || 'http://localhost:3000'
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard/settings`,
    return_url: `${origin}/dashboard/settings?stripe=connected`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ connected: false })

  const { data: settings } = await supabase
    .from('club_settings')
    .select('stripe_account_id')
    .eq('club_id', profile.club_id)
    .single()

  if (!settings?.stripe_account_id) {
    return NextResponse.json({ connected: false })
  }

  // Check if account is fully onboarded
  const account = await stripe.accounts.retrieve(settings.stripe_account_id)

  return NextResponse.json({
    connected: account.charges_enabled,
    accountId: settings.stripe_account_id,
  })
}
```

- [ ] **Step 2: Create the Stripe Connect UI component**

```tsx
'use client'

import { useState, useEffect } from 'react'

export default function StripeConnect() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    fetch('/api/stripe/connect')
      .then(res => res.json())
      .then(data => setConnected(data.connected))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/stripe/connect', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setConnecting(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">Stripe Payments</h3>
          <p className="text-sm text-gray mt-1">
            {connected
              ? 'Your Stripe account is connected. Parents can pay for camps online.'
              : 'Connect your Stripe account to collect camp payments from parents.'}
          </p>
        </div>
        {connected ? (
          <span className="text-sm text-green font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green rounded-full" />
            Connected
          </span>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="bg-[#635BFF] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect Stripe'}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/api/stripe/connect/route.ts app-next/app/dashboard/settings/stripe-connect.tsx
git commit -m "feat: add Stripe Connect onboarding flow"
```

---

### Task 3: Add StripeConnect to settings page

**Files:**
- Modify: `app-next/app/dashboard/settings/` (settings page or client)

- [ ] **Step 1: Read the settings page to find where to add StripeConnect**

- [ ] **Step 2: Import and add StripeConnect component**

Add to the settings page (DOC only):
```tsx
import StripeConnect from './stripe-connect'

// In the JSX, add for DOC role:
{userRole === 'doc' && <StripeConnect />}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/settings/
git commit -m "feat: add Stripe Connect to settings page"
```

---

### Task 4: Stripe Checkout for camp registration

**Files:**
- Create: `app-next/app/api/stripe/checkout/route.ts`
- Modify: `app-next/app/dashboard/camps/register-modal.tsx`

- [ ] **Step 1: Create the Checkout API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 })

  const body = await req.json()
  const { eventId, playerId } = body

  // Get camp details
  const { data: detail } = await supabase
    .from('camp_details')
    .select('id, fee_cents, capacity')
    .eq('event_id', eventId)
    .single()

  if (!detail) return NextResponse.json({ error: 'Camp not found' }, { status: 404 })
  if (detail.fee_cents === 0) return NextResponse.json({ error: 'This camp is free — register directly' }, { status: 400 })

  // Get club's Stripe account
  const { data: settings } = await supabase
    .from('club_settings')
    .select('stripe_account_id')
    .eq('club_id', profile.club_id)
    .single()

  if (!settings?.stripe_account_id) {
    return NextResponse.json({ error: 'Club has not connected Stripe yet' }, { status: 400 })
  }

  // Get event title
  const { data: event } = await supabase
    .from('events')
    .select('title')
    .eq('id', eventId)
    .single()

  // Get player name
  const { data: player } = await supabase
    .from('players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .single()

  const origin = req.headers.get('origin') || 'http://localhost:3000'

  // Create Checkout session on the connected account
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: event?.title ?? 'Camp Registration',
          description: `Registration for ${player?.first_name} ${player?.last_name}`,
        },
        unit_amount: detail.fee_cents,
      },
      quantity: 1,
    }],
    metadata: {
      camp_detail_id: detail.id,
      player_id: playerId,
      profile_id: profile.id,
    },
    success_url: `${origin}/dashboard/camps?payment=success`,
    cancel_url: `${origin}/dashboard/camps?payment=cancelled`,
  }, {
    stripeAccount: settings.stripe_account_id,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 2: Modify register-modal.tsx to use Stripe Checkout for paid camps**

In the `handleRegister` function, check if the camp has a fee. If yes, redirect to Stripe Checkout instead of registering directly:

```typescript
async function handleRegister() {
  if (!selectedPlayerId) return
  setSubmitting(true)
  setError(null)
  try {
    if (camp.feeCents > 0) {
      // Paid camp — redirect to Stripe Checkout
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: camp.eventId, playerId: selectedPlayerId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.url) {
        window.location.href = data.url
        return
      }
    }
    // Free camp — register directly
    await registerForCamp(camp.eventId, selectedPlayerId)
    setSuccess(true)
  } catch (err: any) {
    setError(err.message)
  } finally {
    setSubmitting(false)
  }
}
```

Also update the button text:
```tsx
{submitting ? 'Processing...' : camp.feeCents > 0 ? 'Register & Pay' : 'Register'}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/api/stripe/checkout/route.ts app-next/app/dashboard/camps/register-modal.tsx
git commit -m "feat: add Stripe Checkout for paid camp registration"
```

---

### Task 5: Stripe webhook — auto-confirm payment

**Files:**
- Create: `app-next/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Create the webhook handler**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  // In test mode without webhook secret, parse directly
  // In production, verify with STRIPE_WEBHOOK_SECRET
  let event
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET)
    } else {
      event = JSON.parse(body)
    }
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const { camp_detail_id, player_id, profile_id } = session.metadata || {}

    if (camp_detail_id && player_id && profile_id) {
      const service = createServiceClient()

      // Register the player (upsert in case already registered)
      const { data: existing } = await service
        .from('camp_registrations')
        .select('id')
        .eq('camp_detail_id', camp_detail_id)
        .eq('player_id', player_id)
        .single()

      if (existing) {
        // Update payment status
        await service
          .from('camp_registrations')
          .update({ payment_status: 'paid' })
          .eq('id', existing.id)
      } else {
        // Create registration with paid status
        await service
          .from('camp_registrations')
          .insert({
            camp_detail_id,
            player_id,
            registered_by: profile_id,
            payment_status: 'paid',
          })
      }
    }
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/api/stripe/webhook/route.ts
git commit -m "feat: add Stripe webhook to auto-confirm camp payments"
```

---

### Task 6: End-to-end test

- [ ] **Step 1: Apply migration in Supabase SQL Editor**

```sql
alter table club_settings add column stripe_account_id text;
```

- [ ] **Step 2: Add Stripe keys to Vercel env vars**

Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in Vercel project settings.

- [ ] **Step 3: Test Connect flow**

Go to Settings → click "Connect Stripe" → complete Stripe onboarding → verify "Connected" badge appears.

- [ ] **Step 4: Test payment flow**

Set a camp fee → as parent, click "Register & Pay" → complete Stripe Checkout with test card `4242 4242 4242 4242` → verify registration shows as "paid".

- [ ] **Step 5: Final commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add -A
git commit -m "feat: Stripe Connect payments — clubs collect camp fees from parents"
```
