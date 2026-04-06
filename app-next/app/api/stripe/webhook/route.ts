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
