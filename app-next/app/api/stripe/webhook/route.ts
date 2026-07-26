import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  // Signature verification is mandatory. This route writes paid registrations
  // with the service-role client, so an unverified body would let anyone forge
  // a checkout.session.completed event and register players for free.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set: rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
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
