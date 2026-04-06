'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { checkAndEscalateTimeouts } from '../coverage/actions'
import { checkConflicts } from './conflict-actions'
import { sendPushToProfiles } from '@/lib/push'

// ---------- Types ----------

interface CreateEventInput {
  teamId: string
  type: string
  title: string
  startTime: string
  endTime: string
  venueId: string | null
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

async function notifyTeamMembers(
  eventId: string,
  teamId: string,
  type: 'event_created' | 'event_updated' | 'event_cancelled',
  message: string
) {
  const service = createServiceClient()

  // Get all team members (coaches + parents)
  const { data: members } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', teamId)

  if (!members || members.length === 0) return

  const notifications = members.map(m => ({
    profile_id: m.profile_id,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
  const memberIds = members.map(m => m.profile_id)
  await sendPushToProfiles(memberIds, { title: 'OffPitchOS', message, url: '/dashboard/schedule', tag: type })
}

// ---------- Actions ----------

export async function createEvent(input: CreateEventInput) {
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
        notes: input.notes?.trim() || null,
        status: 'scheduled',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create event: ${error.message}`)

    await notifyTeamMembers(event.id, input.teamId, 'event_created', `New event: ${input.title.trim()}`)
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
    if (inserted && inserted.length > 0) {
      await notifyTeamMembers(
        inserted[0].id,
        input.teamId,
        'event_created',
        `New recurring schedule: ${input.title.trim()} (${events.length} events)`
      )
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

export async function updateEvent(input: UpdateEventInput) {
  const { supabase } = await getUserProfile()

  const updates = {
    title: input.title.trim(),
    start_time: input.startTime,
    end_time: input.endTime,
    venue_id: input.venueId,
    notes: input.notes?.trim() || null,
  }

  if (input.updateFuture) {
    // Get the event to find its recurrence_group and start_time
    const { data: event } = await supabase
      .from('events')
      .select('recurrence_group, start_time, team_id')
      .eq('id', input.eventId)
      .single()

    if (!event?.recurrence_group) throw new Error('Event is not part of a recurring series')

    // Calculate time offset from original to apply to all future events
    const originalStart = new Date(event.start_time)
    const newStart = new Date(input.startTime)
    const offsetMs = newStart.getTime() - originalStart.getTime()

    // Get all future events in this series
    const { data: futureEvents } = await supabase
      .from('events')
      .select('id, start_time, end_time')
      .eq('recurrence_group', event.recurrence_group)
      .gte('start_time', event.start_time)
      .order('start_time')

    if (futureEvents) {
      for (const fe of futureEvents) {
        const feStart = new Date(new Date(fe.start_time).getTime() + offsetMs)
        const feEnd = new Date(new Date(fe.end_time).getTime() + offsetMs)

        await supabase
          .from('events')
          .update({
            title: input.title.trim(),
            start_time: feStart.toISOString(),
            end_time: feEnd.toISOString(),
            venue_id: input.venueId,
            notes: input.notes?.trim() || null,
          })
          .eq('id', fe.id)
      }
    }

    await notifyTeamMembers(
      input.eventId,
      event.team_id,
      'event_updated',
      `Schedule updated: ${input.title.trim()} (this and future events)`
    )
  } else {
    // Single event update
    const { data: event, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', input.eventId)
      .select('team_id')
      .single()

    if (error) throw new Error(`Failed to update event: ${error.message}`)

    await notifyTeamMembers(input.eventId, event.team_id, 'event_updated', `Event updated: ${input.title.trim()}`)
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

export async function cancelEvent(eventId: string) {
  const { supabase } = await getUserProfile()

  const { data: event, error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)
    .select('title, team_id')
    .single()

  if (error) throw new Error(`Failed to cancel event: ${error.message}`)

  await notifyTeamMembers(eventId, event.team_id, 'event_cancelled', `Event cancelled: ${event.title}`)

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
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

export async function getScheduleData() {
  const { profile, supabase } = await getUserProfile()

  // Only load today and future events (past events are rarely needed)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: events } = await supabase
    .from('events')
    .select(`
      id, team_id, type, title, start_time, end_time,
      venue_id, recurrence_group, notes, status,
      teams ( name, age_group ),
      venues ( name )
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

  return {
    events: events ?? [],
    teams: teams ?? [],
    venues: venues ?? [],
    coverageRequests: coverageRequests ?? [],
    userRole: profile.role,
    userProfileId: profile.id,
  }
}
