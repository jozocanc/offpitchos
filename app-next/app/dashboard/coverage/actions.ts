'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { autoAssignCoverage } from './auto-assign'

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

async function getClubTimeoutMinutes(clubId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('club_settings')
    .select('coverage_timeout_minutes')
    .eq('club_id', clubId)
    .single()

  return data?.coverage_timeout_minutes ?? 120
}

async function notifyClubCoaches(
  eventId: string,
  clubId: string,
  excludeProfileId: string,
  type: 'coverage_requested' | 'coverage_accepted' | 'coverage_escalated',
  message: string
) {
  const service = createServiceClient()

  const { data: coaches } = await service
    .from('profiles')
    .select('id')
    .eq('club_id', clubId)
    .eq('role', 'coach')
    .neq('id', excludeProfileId)

  if (!coaches || coaches.length === 0) return

  const notifications = coaches.map(c => ({
    profile_id: c.id,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
}

async function notifySpecificProfiles(
  eventId: string,
  profileIds: string[],
  type: 'coverage_requested' | 'coverage_accepted' | 'coverage_escalated',
  message: string
) {
  if (profileIds.length === 0) return
  const service = createServiceClient()

  const notifications = profileIds.map(pid => ({
    profile_id: pid,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
}

async function getDocProfileId(clubId: string): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('id')
    .eq('club_id', clubId)
    .eq('role', 'doc')
    .single()

  return data?.id ?? null
}

// ---------- Actions ----------

export async function createCoverageRequest(eventId: string, unavailableCoachId: string) {
  const { user, profile, supabase } = await getUserProfile()
  const timeoutMinutes = await getClubTimeoutMinutes(profile.club_id!)
  const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000)

  const { data: event } = await supabase
    .from('events')
    .select('title, start_time, team_id')
    .eq('id', eventId)
    .single()

  if (!event) throw new Error('Event not found')

  const { data: request, error } = await supabase
    .from('coverage_requests')
    .insert({
      event_id: eventId,
      club_id: profile.club_id!,
      unavailable_coach_id: unavailableCoachId,
      status: 'pending',
      created_by: user.id,
      timeout_at: timeoutAt.toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create coverage request: ${error.message}`)

  const dateStr = new Date(event.start_time).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
  const timeStr = new Date(event.start_time).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })

  // Try to auto-assign the best available coach
  const result = await autoAssignCoverage(
    request.id,
    eventId,
    profile.club_id!,
    unavailableCoachId
  )

  if (result.assigned) {
    // Auto-assigned! Notify the covering coach, unavailable coach, and DOC
    const message = `${result.coachName} has been auto-assigned to cover ${event.title} on ${dateStr} at ${timeStr}`

    const { data: assignedRequest } = await supabase
      .from('coverage_requests')
      .select('covering_coach_id')
      .eq('id', request.id)
      .single()

    const docId = await getDocProfileId(profile.club_id!)
    const notifyIds = [unavailableCoachId]
    if (assignedRequest?.covering_coach_id) notifyIds.push(assignedRequest.covering_coach_id)
    if (docId) notifyIds.push(docId)

    await notifySpecificProfiles(eventId, notifyIds, 'coverage_accepted', message)
  } else {
    // No one available — broadcast to coaches and escalate to DOC immediately
    await notifyClubCoaches(
      eventId,
      profile.club_id!,
      unavailableCoachId,
      'coverage_requested',
      `Can you cover ${event.title} on ${dateStr} at ${timeStr}? (No auto-match found)`
    )

    const docId = await getDocProfileId(profile.club_id!)
    if (docId) {
      await notifySpecificProfiles(
        eventId,
        [docId],
        'coverage_escalated',
        `No available coach found for ${event.title} on ${dateStr} — please assign manually`
      )
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/coverage')
  revalidatePath('/dashboard')
}

export async function acceptCoverage(requestId: string) {
  const { profile, supabase } = await getUserProfile()

  // Atomic update — only succeeds if still pending
  const { data: request, error } = await supabase
    .from('coverage_requests')
    .update({
      status: 'accepted',
      covering_coach_id: profile.id,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('event_id, club_id, unavailable_coach_id')
    .single()

  if (error || !request) {
    throw new Error('This coverage request has already been taken or is no longer available.')
  }

  await supabase.from('coverage_responses').insert({
    coverage_request_id: requestId,
    coach_id: profile.id,
    response: 'accepted',
  })

  const service = createServiceClient()
  const { data: event } = await service
    .from('events')
    .select('title, start_time, team_id')
    .eq('id', request.event_id)
    .single()

  const { data: coveringCoach } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', profile.id)
    .single()

  const coachName = coveringCoach?.display_name ?? 'A coach'
  const message = `${coachName} is covering ${event?.title ?? 'an event'}`

  const docId = await getDocProfileId(request.club_id)
  const notifyIds = [request.unavailable_coach_id]
  if (docId) notifyIds.push(docId)

  await notifySpecificProfiles(request.event_id, notifyIds, 'coverage_accepted', message)

  if (event?.team_id) {
    const { data: parents } = await service
      .from('team_members')
      .select('profile_id, profiles!inner(role)')
      .eq('team_id', event.team_id)

    const parentIds = (parents ?? [])
      .filter((p: any) => p.profiles?.role === 'parent')
      .map((p: any) => p.profile_id)

    if (parentIds.length > 0) {
      await notifySpecificProfiles(request.event_id, parentIds, 'coverage_accepted', message)
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/coverage')
  revalidatePath('/dashboard')
}

export async function declineCoverage(requestId: string) {
  const { profile, supabase } = await getUserProfile()

  await supabase.from('coverage_responses').insert({
    coverage_request_id: requestId,
    coach_id: profile.id,
    response: 'declined',
  })

  revalidatePath('/dashboard/coverage')
}

export async function assignCoverage(requestId: string, coachProfileId: string) {
  const { supabase } = await getUserProfile()

  // Check if the assigned coach has a conflicting event
  const { data: requestInfo } = await supabase
    .from('coverage_requests')
    .select('event_id')
    .eq('id', requestId)
    .single()

  if (requestInfo) {
    const { data: event } = await supabase
      .from('events')
      .select('start_time, end_time, club_id')
      .eq('id', requestInfo.event_id)
      .single()

    if (event) {
      const { data: coachTeams } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('profile_id', coachProfileId)
        .eq('role', 'coach')

      if (coachTeams && coachTeams.length > 0) {
        const teamIds = coachTeams.map(t => t.team_id)
        const { data: conflicts } = await supabase
          .from('events')
          .select('id, title')
          .eq('club_id', event.club_id)
          .in('team_id', teamIds)
          .eq('status', 'scheduled')
          .lt('start_time', event.end_time)
          .gt('end_time', event.start_time)

        if (conflicts && conflicts.length > 0) {
          throw new Error(`${conflicts[0].title} conflicts — this coach is already busy at that time.`)
        }
      }
    }
  }

  const { data: request, error } = await supabase
    .from('coverage_requests')
    .update({
      status: 'resolved',
      covering_coach_id: coachProfileId,
    })
    .eq('id', requestId)
    .in('status', ['pending', 'escalated'])
    .select('event_id, club_id, unavailable_coach_id')
    .single()

  if (error || !request) throw new Error('Failed to assign coverage')

  const service = createServiceClient()
  const { data: event } = await service
    .from('events')
    .select('title, team_id')
    .eq('id', request.event_id)
    .single()

  const { data: assignedCoach } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', coachProfileId)
    .single()

  const message = `${assignedCoach?.display_name ?? 'A coach'} is covering ${event?.title ?? 'an event'}`

  await notifySpecificProfiles(
    request.event_id,
    [coachProfileId, request.unavailable_coach_id],
    'coverage_accepted',
    message
  )

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/coverage')
  revalidatePath('/dashboard')
}

export async function checkAndEscalateTimeouts() {
  const service = createServiceClient()

  const { data: expired } = await service
    .from('coverage_requests')
    .select('id, event_id, club_id')
    .eq('status', 'pending')
    .lt('timeout_at', new Date().toISOString())

  if (!expired || expired.length === 0) return

  for (const req of expired) {
    await service
      .from('coverage_requests')
      .update({ status: 'escalated' })
      .eq('id', req.id)

    const { data: event } = await service
      .from('events')
      .select('title')
      .eq('id', req.event_id)
      .single()

    const docId = await getDocProfileId(req.club_id)
    if (docId) {
      await notifySpecificProfiles(
        req.event_id,
        [docId],
        'coverage_escalated',
        `No one accepted coverage for ${event?.title ?? 'an event'} — assign manually`
      )
    }
  }
}

export async function getCoverageData() {
  const { profile, supabase } = await getUserProfile()

  await checkAndEscalateTimeouts()

  const { data: requests } = await supabase
    .from('coverage_requests')
    .select(`
      id, event_id, status, timeout_at, created_at,
      unavailable_coach_id, covering_coach_id,
      events ( title, start_time, end_time, team_id, teams ( name, age_group ) ),
      profiles!coverage_requests_unavailable_coach_id_fkey ( display_name ),
      covering:profiles!coverage_requests_covering_coach_id_fkey ( display_name )
    `)
    .eq('club_id', profile.club_id!)
    .order('created_at', { ascending: false })

  const { data: responses } = await supabase
    .from('coverage_responses')
    .select(`
      id, coverage_request_id, response, created_at,
      profiles ( display_name )
    `)

  const { data: coaches } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('club_id', profile.club_id!)
    .eq('role', 'coach')

  return {
    requests: requests ?? [],
    responses: responses ?? [],
    coaches: coaches ?? [],
    userRole: profile.role,
    userProfileId: profile.id,
  }
}

export async function updateCoverageTimeout(minutes: number) {
  const { profile, supabase } = await getUserProfile()

  if (minutes < 15 || minutes > 1440) throw new Error('Timeout must be between 15 minutes and 24 hours')

  const { error } = await supabase
    .from('club_settings')
    .upsert({
      club_id: profile.club_id!,
      coverage_timeout_minutes: minutes,
    }, { onConflict: 'club_id' })

  if (error) throw new Error(`Failed to update timeout: ${error.message}`)

  revalidatePath('/dashboard/settings')
}

export async function getCoverageTimeout() {
  const { profile } = await getUserProfile()
  return getClubTimeoutMinutes(profile.club_id!)
}
