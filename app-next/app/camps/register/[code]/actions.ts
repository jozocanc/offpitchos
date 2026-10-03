'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { getClubTimezoneById } from '@/lib/club-timezone-server'

// Public camp lookup — no auth required. Uses service client to bypass
// RLS so anyone with the link can see camp details.
export async function getCampByCode(code: string) {
  const service = createServiceClient()

  const { data: detail } = await service
    .from('camp_details')
    .select('id, event_id, fee_cents, capacity, registration_code, description, events(club_id, title, start_time, end_time, status, teams(name, age_group), venues(name, address))')
    .eq('registration_code', code.toUpperCase())
    .single()

  if (!detail) return null

  const event = Array.isArray(detail.events) ? detail.events[0] : detail.events
  const team = event?.teams ? (Array.isArray(event.teams) ? event.teams[0] : event.teams) : null
  const venue = event?.venues ? (Array.isArray(event.venues) ? event.venues[0] : event.venues) : null

  // Shown in the camp's own zone, not the server's or a fixed Eastern one.
  const tz = await getClubTimezoneById((event as { club_id?: string } | null)?.club_id)

  // Count current registrations
  const { count } = await service
    .from('camp_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('camp_detail_id', detail.id)

  return {
    detailId: detail.id,
    eventId: detail.event_id,
    title: event?.title ?? 'Camp',
    date: event?.start_time
      ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })
      : '',
    endDate: event?.end_time
      ? new Date(event.end_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })
      : '',
    startTime: event?.start_time
      ? new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
      : '',
    endTime: event?.end_time
      ? new Date(event.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
      : '',
    team: team?.name ?? null,
    ageGroup: team?.age_group ?? null,
    venue: venue?.name ?? null,
    address: venue?.address ?? null,
    feeCents: detail.fee_cents,
    capacity: detail.capacity,
    registered: count ?? 0,
    description: detail.description ?? null,
    spotsLeft: detail.capacity ? detail.capacity - (count ?? 0) : null,
    isFull: detail.capacity ? (count ?? 0) >= detail.capacity : false,
    status: event?.status ?? 'scheduled',
  }
}

// Guest registration: no auth, no account needed. The registrant is the
// athlete. Creates a camp_registration row with guest fields instead of
// player_id.
//
// Column mapping (the guest_* column names predate the team pivot and are
// kept to avoid a migration):
//   guest_kid_name     athlete's full name
//   guest_kid_age      athlete's age
//   guest_parent_email athlete's contact email (used for the duplicate check)
//   guest_parent_phone athlete's phone
//   guest_parent_name  optional guardian contact, only for under-18 athletes
export async function registerGuest(
  ...args: Parameters<typeof _registerGuest>
): Promise<ActionResult<Awaited<ReturnType<typeof _registerGuest>>>> {
  try {
    return { ok: true, data: await _registerGuest(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _registerGuest(input: {
  campDetailId: string
  athleteName: string
  athleteAge: string
  email: string
  phone: string
  guardianContact: string
}): Promise<{ success: boolean; message: string }> {
  if (!input.athleteName.trim()) throw new Error('Full name is required')
  if (!input.athleteAge.trim()) throw new Error('Age is required')
  if (!input.email.trim()) throw new Error('Email is required')

  const service = createServiceClient()

  // Check capacity
  const { data: detail } = await service
    .from('camp_details')
    .select('id, capacity')
    .eq('id', input.campDetailId)
    .single()

  if (!detail) throw new Error('Camp not found')

  if (detail.capacity) {
    const { count } = await service
      .from('camp_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('camp_detail_id', detail.id)

    if ((count ?? 0) >= detail.capacity) {
      return { success: false, message: 'Sorry, this camp is full.' }
    }
  }

  // Check duplicate by email + athlete name
  const { data: existing } = await service
    .from('camp_registrations')
    .select('id')
    .eq('camp_detail_id', input.campDetailId)
    .eq('guest_parent_email', input.email.trim().toLowerCase())
    .eq('guest_kid_name', input.athleteName.trim())
    .single()

  if (existing) {
    return { success: false, message: "You're already registered for this camp." }
  }

  const { error } = await service
    .from('camp_registrations')
    .insert({
      camp_detail_id: input.campDetailId,
      player_id: null,
      registered_by: null,
      guest_kid_name: input.athleteName.trim(),
      guest_kid_age: input.athleteAge.trim(),
      guest_parent_email: input.email.trim().toLowerCase(),
      guest_parent_phone: input.phone.trim() || null,
      guest_parent_name: input.guardianContact.trim() || null,
      payment_status: 'unpaid',
    })

  if (error) throw new Error(`Registration failed: ${error.message}`)

  return { success: true, message: "Registered! You'll receive confirmation details from the coaching staff." }
}
