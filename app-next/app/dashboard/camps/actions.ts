'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getEffectiveRole } from '@/lib/admin-role'
import { sendPushToProfiles } from '@/lib/push'
import { sendEmailToProfiles } from '@/lib/email'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  return { user, profile, supabase }
}

export async function getCampsData() {
  const { user, profile, supabase } = await getUserProfile()

  // Get all camp events for this club
  const { data: campEvents } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, status, team_id, teams(name, age_group), venues(name)')
    .eq('club_id', profile.club_id)
    .eq('type', 'camp')
    .order('start_time', { ascending: true })

  // Get camp details (fee, capacity, registration code) for all camp events
  const { data: campDetails } = await supabase
    .from('camp_details')
    .select('id, event_id, fee_cents, capacity, registration_code')
    .eq('club_id', profile.club_id)

  // Get registration counts and revenue per camp
  const detailIds = (campDetails ?? []).map(d => d.id)
  let registrations: { id: string; camp_detail_id: string; payment_status: string }[] = []
  if (detailIds.length > 0) {
    const { data } = await supabase
      .from('camp_registrations')
      .select('id, camp_detail_id, payment_status')
      .in('camp_detail_id', detailIds)
    registrations = data ?? []
  }

  // Build enriched camp list — includes `unpaidCount` so cards can show a
  // per-camp nudge badge without the client refetching.
  const camps = (campEvents ?? []).map(event => {
    const detail = (campDetails ?? []).find(d => d.event_id === event.id)
    const regs = detail ? registrations.filter(r => r.camp_detail_id === detail.id) : []
    const paidCount = regs.filter(r => r.payment_status === 'paid').length
    const unpaidCount = regs.length - paidCount
    const feeCents = detail?.fee_cents ?? 0

    return {
      eventId: event.id,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      status: event.status,
      team: (event.teams as { name?: string; age_group?: string } | null)?.name ?? null,
      ageGroup: (event.teams as { name?: string; age_group?: string } | null)?.age_group ?? null,
      venue: (event.venues as { name?: string } | null)?.name ?? null,
      detailId: detail?.id ?? null,
      registrationCode: detail?.registration_code ?? null,
      feeCents,
      capacity: detail?.capacity ?? null,
      registeredCount: regs.length,
      paidCount,
      unpaidCount,
      expectedRevenue: regs.length * feeCents,
      collectedRevenue: paidCount * feeCents,
    }
  })

  // Lookups for the inline Create Camp modal — fetched once on page load so
  // the modal is instant when the DOC clicks the button.
  const [{ data: teamsList }, { data: venuesList }] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, age_group')
      .eq('club_id', profile.club_id)
      .order('age_group', { ascending: true }),
    supabase
      .from('venues')
      .select('id, name')
      .eq('club_id', profile.club_id)
      .order('name', { ascending: true }),
  ])

  const effectiveRole = await getEffectiveRole(user.email ?? '', profile.role)

  return {
    camps,
    userRole: effectiveRole,
    userProfileId: profile.id,
    teams: teamsList ?? [],
    venues: venuesList ?? [],
  }
}

export async function setCampDetails(input: {
  eventId: string
  feeCents: number
  capacity: number | null
}) {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Only directors can set camp details')

  const { data: existing } = await supabase
    .from('camp_details')
    .select('id')
    .eq('event_id', input.eventId)
    .single()

  if (existing) {
    await supabase
      .from('camp_details')
      .update({ fee_cents: input.feeCents, capacity: input.capacity })
      .eq('id', existing.id)
  } else {
    const autoCode = 'CAMP-' + Math.floor(Math.random() * 90000 + 10000)
    await supabase.from('camp_details').insert({
      event_id: input.eventId,
      club_id: profile.club_id,
      fee_cents: input.feeCents,
      capacity: input.capacity,
      registration_code: autoCode,
    })
  }

  revalidatePath('/dashboard/camps')
}

export async function getCampRegistrations(eventId: string) {
  const { supabase } = await getUserProfile()

  const { data: detail } = await supabase
    .from('camp_details')
    .select('id, fee_cents, capacity')
    .eq('event_id', eventId)
    .single()

  if (!detail) return { registrations: [], feeCents: 0, capacity: null }

  const { data: regs } = await supabase
    .from('camp_registrations')
    .select('id, payment_status, created_at, guest_kid_name, guest_parent_name, guest_parent_email, players(first_name, last_name, team_id, teams(name))')
    .eq('camp_detail_id', detail.id)
    .order('created_at', { ascending: true })

  return {
    registrations: regs ?? [],
    feeCents: detail.fee_cents,
    capacity: detail.capacity,
  }
}

export async function registerForCamp(eventId: string, playerId: string) {
  const { profile, supabase } = await getUserProfile()

  const { data: detail } = await supabase
    .from('camp_details')
    .select('id, capacity')
    .eq('event_id', eventId)
    .single()

  if (!detail) throw new Error('Camp details not set up yet. Contact your director.')

  // Check capacity
  if (detail.capacity) {
    const { count } = await supabase
      .from('camp_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('camp_detail_id', detail.id)

    if ((count ?? 0) >= detail.capacity) {
      throw new Error('This camp is full.')
    }
  }

  const { error } = await supabase.from('camp_registrations').insert({
    camp_detail_id: detail.id,
    player_id: playerId,
    registered_by: profile.id,
  })

  if (error) {
    if (error.code === '23505') throw new Error('This player is already registered.')
    throw new Error(`Registration failed: ${error.message}`)
  }

  revalidatePath('/dashboard/camps')
}

export async function togglePayment(registrationId: string) {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Only directors can update payment status')

  const { data: reg } = await supabase
    .from('camp_registrations')
    .select('payment_status')
    .eq('id', registrationId)
    .single()

  if (!reg) throw new Error('Registration not found')

  const newStatus = reg.payment_status === 'paid' ? 'unpaid' : 'paid'

  await supabase
    .from('camp_registrations')
    .update({ payment_status: newStatus })
    .eq('id', registrationId)

  revalidatePath('/dashboard/camps')
}

export async function getParentPlayers() {
  const { user, supabase } = await getUserProfile()

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, team_id, teams(name)')
    .eq('parent_id', user.id)

  return players ?? []
}

interface CreateCampInput {
  title: string
  teamId: string
  startTime: string // ISO
  endTime: string   // ISO
  venueId: string | null
  address: string | null
  feeCents: number
  capacity: number | null
  description: string | null
  notes: string | null
}

// Inline camp creation: writes the event + camp_details in one step and
// notifies the team (parents + coaches) via the existing push/email path.
// Before this existed, a DOC had to open /dashboard/schedule, create the
// event, come back to /dashboard/camps, find it, and set the fee/capacity.
export async function createCamp(input: CreateCampInput) {
  const { user, profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Only directors can create camps')

  if (!input.title.trim()) throw new Error('Title is required')
  if (!input.teamId) throw new Error('Team is required')
  if (new Date(input.endTime) <= new Date(input.startTime)) {
    throw new Error('End time must be after start time')
  }
  if (input.feeCents < 0) throw new Error('Fee cannot be negative')
  if (input.capacity !== null && input.capacity < 1) {
    throw new Error('Capacity must be at least 1')
  }

  // 1) Insert the camp event.
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      club_id: profile.club_id,
      team_id: input.teamId,
      type: 'camp',
      title: input.title.trim(),
      start_time: input.startTime,
      end_time: input.endTime,
      venue_id: input.venueId,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      status: 'scheduled',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (eventError || !event) throw new Error(`Failed to create camp: ${eventError?.message ?? 'unknown'}`)

  // 2) Insert camp_details alongside so the Manage modal has fee + capacity
  // pre-populated from the start. Auto-generate a registration code so the
  // DOC can immediately share a public registration link.
  const regCode = input.title.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 15) + '-' + Math.floor(Math.random() * 900 + 100)
  const { error: detailError } = await supabase
    .from('camp_details')
    .insert({
      event_id: event.id,
      club_id: profile.club_id,
      fee_cents: input.feeCents,
      capacity: input.capacity,
      registration_code: regCode,
      description: input.description,
    })

  if (detailError) {
    // Roll back the event so we don't orphan an event without details.
    await supabase.from('events').delete().eq('id', event.id)
    throw new Error(`Failed to set camp details: ${detailError.message}`)
  }

  // 3) Notify the team so parents know registration is open. We reuse the
  // 'event_created' notification type since that's what the notifications
  // table check constraint allows.
  try {
    const service = createServiceClient()
    const { data: members } = await service
      .from('team_members')
      .select('profile_id')
      .eq('team_id', input.teamId)

    const memberIds = (members ?? []).map(m => m.profile_id)
    if (memberIds.length > 0) {
      const message = `New camp: ${input.title.trim()}`
      const rows = memberIds.map(id => ({
        profile_id: id,
        event_id: event.id,
        type: 'event_created' as const,
        message,
      }))
      await service.from('notifications').insert(rows)
      await sendPushToProfiles(memberIds, {
        title: 'OffPitchOS',
        message,
        url: '/dashboard/camps',
        tag: 'event_created',
      })
      // Fire and forget — email is best-effort, don't block the UI on it.
      void sendEmailToProfiles(memberIds, 'OffPitchOS — New camp', message, 'https://offpitchos.com/dashboard/camps')
    }
  } catch {
    // Creation itself succeeded; notification failure shouldn't fail the action.
  }

  revalidatePath('/dashboard/camps')

  return { eventId: event.id }
}

// DOC action: nudge parents who haven't paid for a given camp yet.
// Returns counts so the UI can show "Nudged N · skipped M unlinked" — the
// skipped count catches kids whose parent_id still points at the DOC (i.e.
// the Roster Ops "Unlinked" case).
export async function sendCampPaymentReminders(eventId: string): Promise<{
  nudged: number
  skipped: number
  campTitle: string
}> {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Only directors can send payment reminders')

  // Camp + fee for the reminder message.
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_time, club_id')
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .single()

  if (!event) throw new Error('Camp not found')

  const { data: detail } = await supabase
    .from('camp_details')
    .select('id, fee_cents')
    .eq('event_id', eventId)
    .single()

  if (!detail) throw new Error('This camp has no details yet')

  // Pull unpaid registrations + their player's current parent_id so we can
  // resolve it to a real parent profile.
  const { data: unpaidRegs } = await supabase
    .from('camp_registrations')
    .select('id, players(id, first_name, last_name, parent_id)')
    .eq('camp_detail_id', detail.id)
    .eq('payment_status', 'unpaid')

  const regs = (unpaidRegs ?? []) as unknown as {
    id: string
    players: { id: string; first_name: string; last_name: string; parent_id: string } | null
  }[]

  if (regs.length === 0) {
    return { nudged: 0, skipped: 0, campTitle: event.title }
  }

  // Collect candidate user_ids (skipping registrations without a player row).
  const candidateUserIds = Array.from(
    new Set(regs.map(r => r.players?.parent_id).filter((id): id is string => Boolean(id))),
  )

  // Only nudge profiles whose role is actually 'parent' — this filters out
  // the common case where player.parent_id still points at the DOC.
  const { data: parentProfiles } = await supabase
    .from('profiles')
    .select('id, user_id, role')
    .in('user_id', candidateUserIds)
    .eq('role', 'parent')

  const linkedParentProfileIds = new Set((parentProfiles ?? []).map(p => p.id))
  const linkedParentByUserId = new Map(
    (parentProfiles ?? []).map(p => [p.user_id as string, p.id as string]),
  )

  const targetProfileIds = new Set<string>()
  let skipped = 0
  for (const reg of regs) {
    const parentUserId = reg.players?.parent_id
    if (!parentUserId) {
      skipped += 1
      continue
    }
    const profileId = linkedParentByUserId.get(parentUserId)
    if (!profileId || !linkedParentProfileIds.has(profileId)) {
      skipped += 1
      continue
    }
    targetProfileIds.add(profileId)
  }

  if (targetProfileIds.size > 0) {
    const feeLabel =
      detail.fee_cents > 0
        ? ` ($${(detail.fee_cents / 100).toFixed(2)})`
        : ''
    const message = `Payment reminder: ${event.title}${feeLabel}`
    const ids = Array.from(targetProfileIds)
    await sendPushToProfiles(ids, {
      title: 'OffPitchOS · Payment due',
      message,
      url: '/dashboard/camps',
      tag: 'payment_reminder',
    })
    void sendEmailToProfiles(
      ids,
      'OffPitchOS — Camp payment reminder',
      `${message}. Open the app to pay.`,
      'https://offpitchos.com/dashboard/camps',
    )
  }

  return {
    nudged: targetProfileIds.size,
    skipped,
    campTitle: event.title,
  }
}
