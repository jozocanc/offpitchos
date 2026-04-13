'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import { askClubQuestion } from '@/lib/ai'

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

export async function getAskPageData() {
  const { user, profile } = await getUserProfile()

  // Ask Ref always starts with a fresh conversation. Prior chats are still
  // persisted to ai_chats (for the DOC AI Log), but we don't restore them
  // into the chat UI across page loads.
  return {
    userRole: await getEffectiveRole(user.email ?? '', profile.role),
    chatHistory: [] as { id: string; question: string; answer: string; created_at: string }[],
  }
}

export async function askQuestion(question: string) {
  if (!question.trim()) throw new Error('Question cannot be empty')
  if (question.length > 500) throw new Error('Question too long (max 500 characters)')

  const { profile, supabase } = await getUserProfile()

  // Gather club context
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('id', profile.club_id)
    .single()

  // Teams with coaches and player count
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)

  const teamData = []
  for (const team of teams ?? []) {
    const { data: members } = await supabase
      .from('team_members')
      .select('profiles(display_name), role')
      .eq('team_id', team.id)

    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)

    const coaches = (members ?? [])
      .filter((m: any) => m.role === 'coach')
      .map((m: any) => m.profiles?.display_name ?? 'Unknown')

    teamData.push({
      name: team.name,
      ageGroup: team.age_group,
      coaches,
      playerCount: playerCount ?? 0,
    })
  }

  // Upcoming events (next 14 days)
  const now = new Date()
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const { data: events } = await supabase
    .from('events')
    .select('title, type, start_time, end_time, status, teams(name), venues(name)')
    .eq('club_id', profile.club_id)
    .gte('start_time', now.toISOString())
    .lte('start_time', twoWeeks.toISOString())
    .order('start_time', { ascending: true })
    .limit(50)

  const upcomingEvents = (events ?? []).map((e: any) => {
    const team = Array.isArray(e.teams) ? e.teams[0] : e.teams
    const venue = Array.isArray(e.venues) ? e.venues[0] : e.venues
    return {
      title: e.title,
      type: e.type,
      team: team?.name ?? 'Club',
      date: new Date(e.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
      time: new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }),
      endTime: new Date(e.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }),
      venue: venue?.name ?? 'TBD',
      address: e.address ?? venue?.address ?? null,
      status: e.status,
    }
  })

  // Recent announcements (last 7 days)
  const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const { data: announcements } = await supabase
    .from('announcements')
    .select('title, body, created_at, teams(name)')
    .eq('club_id', profile.club_id)
    .gte('created_at', oneWeek.toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  const recentAnnouncements = (announcements ?? []).map((a: any) => {
    const aTeam = Array.isArray(a.teams) ? a.teams[0] : a.teams
    return {
      title: a.title,
      body: a.body,
      team: aTeam?.name ?? null,
      date: new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
    }
  })

  // Upcoming camps with fees
  const { data: campEvents } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, teams(name, age_group), venues(name)')
    .eq('club_id', profile.club_id)
    .eq('type', 'camp')
    .gte('start_time', now.toISOString())
    .order('start_time', { ascending: true })
    .limit(10)

  const campDetailIds = (campEvents ?? []).map(e => e.id)
  const { data: campDetails } = campDetailIds.length > 0
    ? await supabase.from('camp_details').select('event_id, fee_cents, capacity').in('event_id', campDetailIds)
    : { data: [] }

  const upcomingCamps = (campEvents ?? []).map((e: any) => {
    const cTeam = Array.isArray(e.teams) ? e.teams[0] : e.teams
    const cVenue = Array.isArray(e.venues) ? e.venues[0] : e.venues
    const detail = (campDetails ?? []).find((d: any) => d.event_id === e.id)
    return {
      title: e.title,
      team: cTeam?.name ?? 'Club',
      ageGroup: cTeam?.age_group ?? '',
      date: new Date(e.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }),
      time: new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }),
      venue: cVenue?.name ?? 'TBD',
      fee: detail?.fee_cents ? `$${(detail.fee_cents / 100).toFixed(2)}` : 'Free',
      capacity: detail?.capacity ?? 'Unlimited',
    }
  })

  // Coverage requests (pending)
  const { data: coverageReqs } = await supabase
    .from('coverage_requests')
    .select('status, events(title, start_time, teams(name))')
    .eq('club_id', profile.club_id)
    .in('status', ['pending', 'escalated'])

  const pendingCoverage = (coverageReqs ?? []).map((cr: any) => {
    const crEvent = Array.isArray(cr.events) ? cr.events[0] : cr.events
    const crTeam = crEvent?.teams ? (Array.isArray(crEvent.teams) ? crEvent.teams[0] : crEvent.teams) : null
    return {
      event: crEvent?.title ?? 'Unknown',
      team: crTeam?.name ?? '',
      status: cr.status,
    }
  })

  // Call Claude
  const answer = await askClubQuestion(question, {
    clubName: club?.name ?? 'Unknown Club',
    teams: teamData,
    upcomingEvents,
    recentAnnouncements,
    upcomingCamps,
    pendingCoverage,
  })

  // Persist to ai_chats
  await supabase.from('ai_chats').insert({
    club_id: profile.club_id,
    profile_id: profile.id,
    question: question.trim(),
    answer,
  })

  return { answer }
}

// DOC-only: get all AI chats across the club
export async function getAiLog() {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Unauthorized')

  const { data: chats } = await supabase
    .from('ai_chats')
    .select('id, question, answer, created_at, profiles(display_name)')
    .eq('club_id', profile.club_id)
    .order('created_at', { ascending: false })
    .limit(100)

  return chats ?? []
}
