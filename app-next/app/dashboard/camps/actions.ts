'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getEffectiveRole } from '@/lib/admin-role'

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

  // Get camp details (fee, capacity) for all camp events
  const { data: campDetails } = await supabase
    .from('camp_details')
    .select('id, event_id, fee_cents, capacity')
    .eq('club_id', profile.club_id)

  // Get registration counts and revenue per camp
  const detailIds = (campDetails ?? []).map(d => d.id)
  let registrations: any[] = []
  if (detailIds.length > 0) {
    const { data } = await supabase
      .from('camp_registrations')
      .select('id, camp_detail_id, payment_status')
      .in('camp_detail_id', detailIds)
    registrations = data ?? []
  }

  // Build enriched camp list
  const camps = (campEvents ?? []).map(event => {
    const detail = (campDetails ?? []).find(d => d.event_id === event.id)
    const regs = detail ? registrations.filter(r => r.camp_detail_id === detail.id) : []
    const paidCount = regs.filter(r => r.payment_status === 'paid').length
    const feeCents = detail?.fee_cents ?? 0

    return {
      eventId: event.id,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      status: event.status,
      team: (event.teams as any)?.name ?? null,
      ageGroup: (event.teams as any)?.age_group ?? null,
      venue: (event.venues as any)?.name ?? null,
      detailId: detail?.id ?? null,
      feeCents,
      capacity: detail?.capacity ?? null,
      registeredCount: regs.length,
      paidCount,
      expectedRevenue: regs.length * feeCents,
      collectedRevenue: paidCount * feeCents,
    }
  })

  const effectiveRole = await getEffectiveRole(user.email ?? '', profile.role)

  return {
    camps,
    userRole: effectiveRole,
    userProfileId: profile.id,
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
    await supabase.from('camp_details').insert({
      event_id: input.eventId,
      club_id: profile.club_id,
      fee_cents: input.feeCents,
      capacity: input.capacity,
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
    .select('id, payment_status, created_at, players(first_name, last_name, team_id, teams(name))')
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
