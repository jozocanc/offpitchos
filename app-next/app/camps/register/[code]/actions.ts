'use server'

import { createServiceClient } from '@/lib/supabase/service'

// Public camp lookup — no auth required. Uses service client to bypass
// RLS so anyone with the link can see camp details.
export async function getCampByCode(code: string) {
  const service = createServiceClient()

  const { data: detail } = await service
    .from('camp_details')
    .select('id, event_id, fee_cents, capacity, registration_code, description, events(title, start_time, end_time, status, teams(name, age_group), venues(name, address))')
    .eq('registration_code', code.toUpperCase())
    .single()

  if (!detail) return null

  const event = Array.isArray(detail.events) ? detail.events[0] : detail.events
  const team = event?.teams ? (Array.isArray(event.teams) ? event.teams[0] : event.teams) : null
  const venue = event?.venues ? (Array.isArray(event.venues) ? event.venues[0] : event.venues) : null

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
      ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
      : '',
    startTime: event?.start_time
      ? new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
      : '',
    endTime: event?.end_time
      ? new Date(event.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
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

// Guest registration — no auth, no account needed. Creates a
// camp_registration row with guest fields instead of player_id.
export async function registerGuest(input: {
  campDetailId: string
  parentName: string
  parentEmail: string
  parentPhone: string
  kidName: string
  kidAge: string
}): Promise<{ success: boolean; message: string }> {
  if (!input.parentName.trim()) throw new Error('Parent name is required')
  if (!input.parentEmail.trim()) throw new Error('Email is required')
  if (!input.kidName.trim()) throw new Error('Child name is required')
  if (!input.kidAge.trim()) throw new Error('Child age is required')

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

  // Check duplicate by email + kid name
  const { data: existing } = await service
    .from('camp_registrations')
    .select('id')
    .eq('camp_detail_id', input.campDetailId)
    .eq('guest_parent_email', input.parentEmail.trim().toLowerCase())
    .eq('guest_kid_name', input.kidName.trim())
    .single()

  if (existing) {
    return { success: false, message: 'This child is already registered for this camp.' }
  }

  const { error } = await service
    .from('camp_registrations')
    .insert({
      camp_detail_id: input.campDetailId,
      player_id: null,
      registered_by: null,
      guest_parent_name: input.parentName.trim(),
      guest_parent_email: input.parentEmail.trim().toLowerCase(),
      guest_parent_phone: input.parentPhone.trim() || null,
      guest_kid_name: input.kidName.trim(),
      guest_kid_age: input.kidAge.trim(),
      payment_status: 'unpaid',
    })

  if (error) throw new Error(`Registration failed: ${error.message}`)

  return { success: true, message: 'Registered! You\'ll receive confirmation details from the club.' }
}
