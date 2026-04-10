'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// A lightweight, coach-scoped version of the DOC attention panel. We keep
// this separate from the DOC list because the coach's priorities are a
// fundamentally different shape: they care about what they personally owe,
// not everything in the club. Three signal types for now; each one should
// answer "what do I need to do right now?" with a one-click follow-up.

export type CoachSignalType = 'coverage_waiting' | 'attendance_unmarked' | 'feedback_owed'

export interface CoachSignal {
  id: string
  type: CoachSignalType
  title: string
  subtitle: string
  // Hint about how urgent this is so the UI can sort / color it.
  urgency: 'critical' | 'important' | 'routine'
  // Where the one-tap CTA should land — kept as a relative URL so the
  // caller can either Link or router.push into it.
  href: string
}

export interface CoachAttentionResult {
  signals: CoachSignal[]
  generatedAt: string
}

async function getCoachContext() {
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

export async function getCoachAttention(): Promise<CoachAttentionResult> {
  const { user, profile, supabase } = await getCoachContext()

  const signals: CoachSignal[] = []

  // --- Signal 1: Coverage waiting for me ----------------------------------
  // Pending requests in my club that I didn't create and haven't responded
  // to yet. Pulled wide then filtered in memory because Supabase joins are
  // awkward for "not in subquery" semantics.
  const { data: pendingRequests } = await supabase
    .from('coverage_requests')
    .select('id, event_id, status, unavailable_coach_id, events(title, start_time, teams(age_group))')
    .eq('club_id', profile.club_id)
    .eq('status', 'pending')

  const pendingList = (pendingRequests ?? []).filter(
    r => r.unavailable_coach_id !== profile.id,
  )

  if (pendingList.length > 0) {
    const myResponses = await supabase
      .from('coverage_responses')
      .select('coverage_request_id')
      .eq('coach_id', profile.id)
      .in('coverage_request_id', pendingList.map(r => r.id))

    const respondedIds = new Set((myResponses.data ?? []).map(r => r.coverage_request_id))
    const actionable = pendingList.filter(r => !respondedIds.has(r.id))

    for (const req of actionable) {
      const ev = Array.isArray(req.events) ? req.events[0] : req.events
      const team = ev?.teams
        ? Array.isArray(ev.teams) ? ev.teams[0] : ev.teams
        : null
      const dateStr = ev?.start_time
        ? new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : ''
      const timeStr = ev?.start_time
        ? new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : ''

      signals.push({
        id: `coverage:${req.id}`,
        type: 'coverage_waiting',
        title: `Cover ${ev?.title ?? 'an event'}?`,
        subtitle: [team?.age_group, `${dateStr} at ${timeStr}`].filter(Boolean).join(' · '),
        urgency: 'critical',
        href: '/dashboard/coverage',
      })
    }
  }

  // --- Signal 2: Attendance unmarked on my teams' recent events -----------
  // "Recent" = last 7 days, already ended. Scope to teams I'm assigned to
  // as a coach so I don't see every team in the club.
  const nowDate = new Date()
  const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = nowDate.toISOString()

  const { data: myTeams } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('profile_id', profile.id)
    .eq('role', 'coach')

  const myTeamIds = (myTeams ?? []).map(tm => tm.team_id)

  if (myTeamIds.length > 0) {
    const { data: recentEvents } = await supabase
      .from('events')
      .select('id, title, start_time, team_id, teams(name, age_group)')
      .in('team_id', myTeamIds)
      .eq('status', 'scheduled')
      .gte('start_time', sevenDaysAgo)
      .lte('end_time', nowIso)
      .order('start_time', { ascending: false })

    if (recentEvents && recentEvents.length > 0) {
      const { data: attendanceRows } = await supabase
        .from('attendance')
        .select('event_id')
        .in('event_id', recentEvents.map(e => e.id))

      const eventsWithAttendance = new Set((attendanceRows ?? []).map(r => r.event_id))

      for (const ev of recentEvents) {
        if (eventsWithAttendance.has(ev.id)) continue
        const team = Array.isArray(ev.teams) ? ev.teams[0] : ev.teams
        const dateStr = new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        signals.push({
          id: `attendance:${ev.id}`,
          type: 'attendance_unmarked',
          title: `Mark attendance for ${ev.title}`,
          subtitle: [team?.name, dateStr].filter(Boolean).join(' · '),
          urgency: 'important',
          href: `/dashboard/schedule?highlight=${ev.id}`,
        })
      }
    }

    // --- Signal 3: Feedback owed -----------------------------------------
    // Post-game/practice events in the last 7 days where I wrote zero
    // feedback entries. We key by event, not player — one signal per event
    // keeps the list short even if the team has 20 kids.
    const { data: myFeedback } = await supabase
      .from('player_feedback')
      .select('event_id')
      .eq('coach_id', profile.id)
      .gte('created_at', sevenDaysAgo)

    const eventsWithMyFeedback = new Set(
      (myFeedback ?? [])
        .map(f => f.event_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    )

    const { data: finishedEvents } = await supabase
      .from('events')
      .select('id, title, start_time, team_id, type, teams(name)')
      .in('team_id', myTeamIds)
      .eq('status', 'scheduled')
      .in('type', ['practice', 'game', 'tournament'])
      .gte('start_time', sevenDaysAgo)
      .lte('end_time', nowIso)
      .order('start_time', { ascending: false })
      .limit(10)

    for (const ev of finishedEvents ?? []) {
      if (eventsWithMyFeedback.has(ev.id)) continue
      const team = Array.isArray(ev.teams) ? ev.teams[0] : ev.teams
      const dateStr = new Date(ev.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      signals.push({
        id: `feedback:${ev.id}`,
        type: 'feedback_owed',
        title: `Add feedback for ${ev.title}`,
        subtitle: [team?.name, dateStr].filter(Boolean).join(' · '),
        urgency: 'routine',
        // We don't have a per-event feedback entry point yet, so deep-link
        // to the team detail where the roster lives.
        href: `/dashboard/teams/${ev.team_id}`,
      })
    }
  }

  return { signals, generatedAt: new Date().toISOString() }
}
