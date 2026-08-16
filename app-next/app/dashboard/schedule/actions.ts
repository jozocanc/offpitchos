'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getEffectiveRole } from '@/lib/admin-role'
import { checkAndEscalateTimeouts } from '../coverage/actions'
import { checkConflicts } from './conflict-actions'
import { sendPushToProfiles } from '@/lib/push'
import { sendEmailToProfiles } from '@/lib/email'
import { getRsvpTalliesForEvents } from './rsvp-actions'

// ---------- Types ----------

interface CreateEventInput {
  teamId: string
  type: string
  title: string
  startTime: string
  endTime: string
  venueId: string | null
  address?: string | null
  link?: string | null
  notes: string | null
  recurring: {
    enabled: boolean
    days: number[]      // 0=Sun, 1=Mon, etc.
    endDate: string     // ISO date string
  }
}

interface UpdateEventInput {
  eventId: string
  title: string
  startTime: string
  endTime: string
  venueId: string | null
  address?: string | null
  link?: string | null
  notes: string | null
  updateFuture: boolean // true = edit all future in series
}

// ---------- Helpers ----------

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

export interface NotifyCounts {
  parents: number
  coaches: number
  // Count of email-delivery failures (Resend rejections) across the
  // bulk send. Independent of push delivery — a parent whose email
  // failed may still have gotten the push notification. Part 1.5.
  emailFailed: number
}

async function notifyTeamMembers(
  eventId: string,
  teamId: string,
  type: 'event_created' | 'event_updated' | 'event_cancelled',
  message: string
): Promise<NotifyCounts> {
  const service = createServiceClient()

  // Get all team members (coaches + parents)
  const { data: members } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', teamId)

  if (!members || members.length === 0) return { parents: 0, coaches: 0, emailFailed: 0 }

  const memberIds = members.map(m => m.profile_id)

  const notifications = members.map(m => ({
    profile_id: m.profile_id,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
  await sendPushToProfiles(memberIds, { title: 'OffPitchOS', message, url: '/dashboard/schedule', tag: type })
  const emailResult = await sendEmailToProfiles(memberIds, 'OffPitchOS — Schedule', message, 'https://offpitchos.com/dashboard/schedule')

  // Count by role so the caller can report "notified N parents and M coaches"
  const { data: profiles } = await service
    .from('profiles')
    .select('role')
    .in('id', memberIds)

  let parents = 0
  let coaches = 0
  for (const p of profiles ?? []) {
    if (p.role === 'parent') parents++
    else if (p.role === 'coach' || p.role === 'doc') coaches++
  }

  return { parents, coaches, emailFailed: emailResult.failed.length }
}

// ---------- Actions ----------

export async function createEvent(input: CreateEventInput): Promise<NotifyCounts> {
  const { user, profile, supabase } = await getUserProfile()

  if (!input.recurring?.enabled) {
    // Check for team conflicts on single events (recurring relies on UI-side warnings)
    const conflicts = await checkConflicts({
      teamId: input.teamId,
      startTime: input.startTime,
      endTime: input.endTime,
      venueId: input.venueId,
    })

    if (conflicts.some(c => c.type === 'team')) {
      throw new Error('This team already has an event at this time. Please choose a different time.')
    }

    // Single event
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        club_id: profile.club_id,
        team_id: input.teamId,
        type: input.type,
        title: input.title.trim(),
        start_time: input.startTime,
        end_time: input.endTime,
        venue_id: input.venueId,
        address: input.address?.trim() || null,
        link: input.link?.trim() || null,
        notes: input.notes?.trim() || null,
        status: 'scheduled',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create event: ${error.message}`)

    const locationLabel = await resolveLocationLabel(supabase, input.venueId, input.address)
    const createdMessage = locationLabel
      ? `New event: ${input.title.trim()} at ${locationLabel}`
      : `New event: ${input.title.trim()}`
    const counts = await notifyTeamMembers(event.id, input.teamId, 'event_created', createdMessage)

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return counts
  } else {
    // Recurring — generate individual events
    const recurrenceGroup = crypto.randomUUID()
    const startDate = new Date(input.startTime)
    const endDate = new Date(input.recurring.endDate)
    const startHour = startDate.getHours()
    const startMin = startDate.getMinutes()
    const endEventTime = new Date(input.endTime)
    const durationMs = endEventTime.getTime() - startDate.getTime()

    const events: Array<{
      club_id: string
      team_id: string
      type: string
      title: string
      start_time: string
      end_time: string
      venue_id: string | null
      address: string | null
      link: string | null
      notes: string | null
      status: string
      created_by: string
      recurrence_group: string
    }> = []

    // Iterate day by day from start to end
    const cursor = new Date(startDate)
    cursor.setHours(0, 0, 0, 0)
    const endCursor = new Date(endDate)
    endCursor.setHours(23, 59, 59, 999)

    while (cursor <= endCursor) {
      if (input.recurring.days.includes(cursor.getDay())) {
        const eventStart = new Date(cursor)
        eventStart.setHours(startHour, startMin, 0, 0)
        const eventEnd = new Date(eventStart.getTime() + durationMs)

        events.push({
          club_id: profile.club_id!,
          team_id: input.teamId,
          type: input.type,
          title: input.title.trim(),
          start_time: eventStart.toISOString(),
          end_time: eventEnd.toISOString(),
          venue_id: input.venueId,
          address: input.address?.trim() || null,
          link: input.link?.trim() || null,
          notes: input.notes?.trim() || null,
          status: 'scheduled',
          created_by: user.id,
          recurrence_group: recurrenceGroup,
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    if (events.length === 0) throw new Error('No events match the selected days in the date range')

    const { data: inserted, error } = await supabase
      .from('events')
      .insert(events)
      .select('id')

    if (error) throw new Error(`Failed to create recurring events: ${error.message}`)

    // Notify for the first event only (avoid spam)
    let counts: NotifyCounts = { parents: 0, coaches: 0, emailFailed: 0 }
    if (inserted && inserted.length > 0) {
      counts = await notifyTeamMembers(
        inserted[0].id,
        input.teamId,
        'event_created',
        `New recurring schedule: ${input.title.trim()} (${events.length} events)`
      )
    }

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return counts
  }
}

async function resolveLocationLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  venueId: string | null,
  address: string | null | undefined,
): Promise<string | null> {
  // Returns a human-readable "Venue name, Address" string (or just one, or null)
  let venueName: string | null = null
  let addr: string | null = address?.trim() || null

  if (venueId) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name, address')
      .eq('id', venueId)
      .single()
    venueName = venue?.name ?? null
    if (!addr) addr = venue?.address ?? null
  }

  if (venueName && addr) return `${venueName}, ${addr}`
  if (venueName) return venueName
  if (addr) return addr
  return null
}

export async function updateEvent(input: UpdateEventInput): Promise<NotifyCounts> {
  const { supabase } = await getUserProfile()

  const updates = {
    title: input.title.trim(),
    start_time: input.startTime,
    end_time: input.endTime,
    venue_id: input.venueId,
    address: input.address?.trim() || null,
    link: input.link?.trim() || null,
    notes: input.notes?.trim() || null,
  }

  if (input.updateFuture) {
    // Only team_id is needed here — the RPC does its own lookup of the
    // recurrence group and start time, and returns just a row count.
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('team_id')
      .eq('id', input.eventId)
      .single()

    if (fetchError || !event) throw new Error('Could not load the event to update')

    // One atomic statement (migration 040) instead of N unchecked awaits in a
    // loop. SECURITY INVOKER, so RLS still applies and a caller without write
    // access gets 0 rows back rather than a half-updated series.
    const { data: updatedCount, error: seriesError } = await supabase.rpc('update_event_series', {
      p_event_id: input.eventId,
      p_title: updates.title,
      p_start_time: input.startTime,
      p_end_time: input.endTime,
      p_venue_id: input.venueId,
      p_address: updates.address,
      p_link: updates.link,
      p_notes: updates.notes,
    })

    if (seriesError) throw new Error(`Failed to update the series: ${seriesError.message}`)

    // Checked before notifying. The old code skipped its loop silently when the
    // fetch failed and then messaged every parent that the schedule had moved.
    if (!updatedCount) {
      throw new Error('No events were updated. You may not have permission to edit this series.')
    }

    const locationLabel = await resolveLocationLabel(supabase, input.venueId, input.address)
    const futureMessage = locationLabel
      ? `Schedule updated: ${input.title.trim()} — now at ${locationLabel} (this and future events)`
      : `Schedule updated: ${input.title.trim()} (this and future events)`

    const counts = await notifyTeamMembers(
      input.eventId,
      event.team_id,
      'event_updated',
      futureMessage,
    )

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return counts
  } else {
    // Single event update
    const { data: event, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', input.eventId)
      .select('team_id')
      .single()

    if (error) throw new Error(`Failed to update event: ${error.message}`)

    const locationLabel = await resolveLocationLabel(supabase, input.venueId, input.address)
    const singleMessage = locationLabel
      ? `Event updated: ${input.title.trim()} — now at ${locationLabel}`
      : `Event updated: ${input.title.trim()}`

    const counts = await notifyTeamMembers(input.eventId, event.team_id, 'event_updated', singleMessage)

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return counts
  }
}

export async function restoreEvent(eventId: string): Promise<NotifyCounts> {
  const { supabase } = await getUserProfile()

  const { data: event, error } = await supabase
    .from('events')
    .update({ status: 'scheduled' })
    .eq('id', eventId)
    .select('title, team_id')
    .single()

  if (error) throw new Error(`Failed to restore event: ${error.message}`)

  const counts = await notifyTeamMembers(
    eventId,
    event.team_id,
    'event_updated',
    `Event restored: ${event.title}`,
  )

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')

  return counts
}

export async function cancelEvent(eventId: string): Promise<NotifyCounts> {
  const { supabase } = await getUserProfile()

  const { data: event, error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)
    .select('title, team_id')
    .single()

  if (error) throw new Error(`Failed to cancel event: ${error.message}`)

  const counts = await notifyTeamMembers(eventId, event.team_id, 'event_cancelled', `Event cancelled: ${event.title}`)

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')

  return counts
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw new Error(`Failed to delete event: ${error.message}`)

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

// ============================================================
// Tactics session plan (Phase A.5) — attach drills to events
// ============================================================

export interface AttachedDrill {
  id: string
  drillId: string
  orderIndex: number
  durationMinutes: number
  coachNotes: string | null
  title: string
  category: string
  thumbnailUrl: string | null
  teamId: string | null
}

export async function listAttachedDrills(eventId: string): Promise<AttachedDrill[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_drills')
    .select('id, drill_id, order_index, duration_minutes, coach_notes, drills!inner(title, category, thumbnail_path, team_id)')
    .eq('event_id', eventId)
    .order('order_index')
  if (!data) return []
  return data.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: r.id,
    drillId: r.drill_id,
    orderIndex: r.order_index,
    durationMinutes: r.duration_minutes,
    coachNotes: r.coach_notes,
    title: r.drills.title,
    category: r.drills.category,
    teamId: r.drills.team_id,
    thumbnailUrl: r.drills.thumbnail_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${r.drills.thumbnail_path}`
      : null,
  }))
}

export async function listDrillsForPicker(eventId: string) {
  const supabase = await createClient()
  const { data: ev } = await supabase.from('events').select('team_id, club_id').eq('id', eventId).single()
  if (!ev) return []
  // Drills for this team OR club-wide (team_id null with visibility='club')
  const { data } = await supabase
    .from('drills')
    .select('id, title, category, visibility, team_id, thumbnail_path')
    .eq('club_id', ev.club_id)
    .or(`team_id.eq.${ev.team_id},and(team_id.is.null,visibility.eq.club)`)
    .order('updated_at', { ascending: false })
    .limit(200)
  return (data ?? []).map((d: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: d.id,
    title: d.title,
    category: d.category,
    teamId: d.team_id,
    thumbnailUrl: d.thumbnail_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${d.thumbnail_path}`
      : null,
  }))
}

export async function attachDrill(eventId: string, drillId: string) {
  const supabase = await createClient()
  const { data: maxRow } = await supabase
    .from('event_drills')
    .select('order_index')
    .eq('event_id', eventId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextIndex = (maxRow?.order_index ?? -1) + 1
  const { error } = await supabase.from('event_drills').insert({
    event_id: eventId, drill_id: drillId, order_index: nextIndex,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/schedule')
}

export async function detachDrill(attachmentId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('event_drills').delete().eq('id', attachmentId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/schedule')
}

export async function reorderDrills(eventId: string, ids: string[]) {
  const supabase = await createClient()
  await Promise.all(ids.map((id, i) =>
    supabase.from('event_drills').update({ order_index: i }).eq('id', id).eq('event_id', eventId)
  ))
  revalidatePath('/dashboard/schedule')
}

export async function updateAttachment(
  attachmentId: string,
  patch: { duration_minutes?: number; coach_notes?: string | null }
) {
  const supabase = await createClient()
  const { error } = await supabase.from('event_drills').update(patch).eq('id', attachmentId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/schedule')
}

export async function getPastEvents() {
  const { profile, supabase } = await getUserProfile()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000)

  const { data: events } = await supabase
    .from('events')
    .select(`
      id, team_id, type, title, start_time, end_time,
      venue_id, address, link, recurrence_group, notes, status,
      teams ( name, age_group ),
      venues ( name, address )
    `)
    .eq('club_id', profile.club_id!)
    .gte('start_time', thirtyDaysAgo.toISOString())
    .lt('start_time', todayStart.toISOString())
    .order('start_time', { ascending: false })

  // Figure out which past events still have zero attendance rows — we
  // surface those with an "Unmarked" badge so coaches can spot (and fix)
  // forgotten sessions at a glance without running down the attention
  // panel one-by-one.
  const eventIds = (events ?? []).map(e => e.id)
  let unmarkedEventIds: string[] = []
  if (eventIds.length > 0) {
    const { data: attRows } = await supabase
      .from('attendance')
      .select('event_id')
      .in('event_id', eventIds)

    const marked = new Set((attRows ?? []).map(r => r.event_id))
    unmarkedEventIds = eventIds.filter(id => !marked.has(id))
  }

  return { events: events ?? [], unmarkedEventIds }
}

export async function getScheduleData() {
  const { user, profile, supabase } = await getUserProfile()

  // Only load today and future events (past events are rarely needed)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: events } = await supabase
    .from('events')
    .select(`
      id, team_id, type, title, start_time, end_time,
      venue_id, address, link, recurrence_group, notes, status,
      teams ( name, age_group ),
      venues ( name, address )
    `)
    .eq('club_id', profile.club_id!)
    .gte('start_time', todayStart.toISOString())
    .order('start_time', { ascending: true })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id!)
    .order('age_group')

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address')
    .eq('club_id', profile.club_id!)
    .order('name')

  // Check coverage timeouts
  await checkAndEscalateTimeouts()

  // Get coverage requests for events
  const { data: coverageRequests } = await supabase
    .from('coverage_requests')
    .select('id, event_id, status, covering_coach_id, unavailable_coach_id, profiles!coverage_requests_covering_coach_id_fkey ( display_name )')
    .eq('club_id', profile.club_id!)
    .in('status', ['pending', 'accepted', 'escalated', 'resolved'])

  // Coach assignments per team — DOC sees "Coaches: Name1, Name2" on
  // each event card so they know at a glance who's running each session.
  const { data: coachMembers } = await supabase
    .from('team_members')
    .select('team_id, profiles(display_name)')
    .eq('role', 'coach')

  const coachesByTeam: Record<string, string[]> = {}
  for (const cm of coachMembers ?? []) {
    const name = (Array.isArray(cm.profiles) ? cm.profiles[0] : cm.profiles)?.display_name
    if (!name || !cm.team_id) continue
    if (!coachesByTeam[cm.team_id]) coachesByTeam[cm.team_id] = []
    coachesByTeam[cm.team_id].push(name)
  }

  // RSVP forecast counts per upcoming event so the agenda can paint
  // "8 going · 2 not coming · 5 no response" without extra round-trips.
  const upcomingEventIds = (events ?? []).map(e => e.id)
  const rsvpTallies = await getRsvpTalliesForEvents(upcomingEventIds)

  return {
    events: events ?? [],
    teams: teams ?? [],
    venues: venues ?? [],
    coverageRequests: coverageRequests ?? [],
    coachesByTeam,
    rsvpTallies,
    userRole: await getEffectiveRole(profile.role),
    userProfileId: profile.id,
  }
}
