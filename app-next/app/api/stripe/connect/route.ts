import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

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
