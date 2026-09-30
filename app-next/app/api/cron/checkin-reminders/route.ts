import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToProfiles } from '@/lib/push'
import { zonedParts, DEFAULT_TIMEZONE } from '@/lib/format-datetime'
import { ROLES } from '@/lib/constants'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Local hour (team timezone) at which players get the morning check-in push.
const REMINDER_HOUR = 8

// Hourly Vercel Cron (app-next/vercel.json, "0 * * * *"). For every team whose
// local clock currently reads 8 AM, push a check-in reminder to each player
// account that owns a roster row and has not checked in for today (team-local
// day). Push only, never email: the Resend quota is for invites and digests.
//
// Double-send guard: before sending, the route claims (club_id, local date)
// in checkin_reminder_log (migration 054) with INSERT ... ON CONFLICT DO
// NOTHING. Only the invocation whose insert lands sends; a retried or
// duplicated invocation in the same hour (or any later hour that day) finds
// the row and skips. The push tag 'checkin' also collapses any duplicate on
// the device into one notification.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const service = createServiceClient()
  const now = new Date()

  const { data: clubs, error: clubsError } = await service
    .from('clubs')
    .select('id, timezone')

  if (clubsError) {
    console.error('[checkin-reminders] clubs query failed:', clubsError.message)
    return NextResponse.json({ ok: false, error: clubsError.message }, { status: 500 })
  }

  const results: { clubId: string; date: string; sent: number; skipped?: string }[] = []

  for (const club of clubs ?? []) {
    const tz = (club.timezone as string | null) || DEFAULT_TIMEZONE
    let local
    try {
      local = zonedParts(now, tz)
    } catch {
      continue // invalid zone string; nothing sensible to do
    }
    if (local.hour !== REMINDER_HOUR) continue

    const today = local.key

    // Claim today's reminder for this club. Empty result = already claimed.
    const { data: claimed, error: claimError } = await service
      .from('checkin_reminder_log')
      .upsert(
        { club_id: club.id, reminder_date: today },
        { onConflict: 'club_id,reminder_date', ignoreDuplicates: true },
      )
      .select('club_id')

    if (claimError) {
      console.error('[checkin-reminders] claim failed:', club.id, claimError.message)
      continue
    }
    if (!claimed || claimed.length === 0) {
      results.push({ clubId: club.id, date: today, sent: 0, skipped: 'already sent' })
      continue
    }

    const [{ data: players }, { data: checkins }] = await Promise.all([
      service
        .from('players')
        .select('id, parent_id')
        .eq('club_id', club.id)
        .not('parent_id', 'is', null),
      service
        .from('player_checkins')
        .select('player_id')
        .eq('club_id', club.id)
        .eq('checkin_date', today),
    ])

    const done = new Set((checkins ?? []).map(c => c.player_id as string))
    const userIds = Array.from(new Set(
      (players ?? [])
        .filter(p => !done.has(p.id as string))
        .map(p => p.parent_id as string),
    ))

    let profileIds: string[] = []
    if (userIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id')
        .eq('club_id', club.id)
        .in('user_id', userIds)
        .in('role', [ROLES.PLAYER, ROLES.PARENT])
      profileIds = (profiles ?? []).map(p => p.id as string)
    }

    if (profileIds.length > 0) {
      await sendPushToProfiles(profileIds, {
        title: 'Morning check-in',
        message: '10 seconds: how did you sleep and how do you feel?',
        url: '/dashboard/check-in',
        tag: 'checkin',
      })
    }

    await service
      .from('checkin_reminder_log')
      .update({ recipients: profileIds.length })
      .eq('club_id', club.id)
      .eq('reminder_date', today)

    results.push({ clubId: club.id, date: today, sent: profileIds.length })
  }

  return NextResponse.json({ ok: true, results })
}
