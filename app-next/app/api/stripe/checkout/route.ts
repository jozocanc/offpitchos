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
