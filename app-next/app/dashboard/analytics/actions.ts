'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
  return { profile, supabase }
}

export async function getAnalyticsData() {
  const { profile, supabase } = await getUserProfile()
  const clubId = profile.club_id!

  // --- Counts ---
  const { count: totalTeams } = await supabase
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)

  const { count: totalPlayers } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)

  const { count: totalCoaches } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('role', 'coach')

  const { count: totalParents } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('role', 'parent')

  // --- Events this month ---
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { data: monthEvents } = await supabase
    .from('events')
    .select('id, type, status')
    .eq('club_id', clubId)
    .gte('start_time', monthStart.toISOString())
    .lte('start_time', monthEnd.toISOString())

  const eventsThisMonth = monthEvents?.length ?? 0
  const cancelledThisMonth = monthEvents?.filter(e => e.status === 'cancelled').length ?? 0

  // --- Attendance rate (last 30 days) ---
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const { data: recentEvents } = await supabase
    .from('events')
    .select('id')
    .eq('club_id', clubId)
    .eq('status', 'scheduled')
    .gte('start_time', thirtyDaysAgo.toISOString())
    .lte('start_time', now.toISOString())

  const recentEventIds = (recentEvents ?? []).map(e => e.id)
  let attendanceRate = 0
  let totalAttendance = 0
  let presentCount = 0

  if (recentEventIds.length > 0) {
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('status')
      .in('event_id', recentEventIds)

    totalAttendance = attendanceData?.length ?? 0
    presentCount = attendanceData?.filter(a => a.status === 'present' || a.status === 'late').length ?? 0
    attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0
  }

  // --- Coverage stats ---
  const { data: coverageData } = await supabase
    .from('coverage_requests')
    .select('id, status, created_at')
    .eq('club_id', clubId)

  const totalCoverageRequests = coverageData?.length ?? 0
  const acceptedCoverage = coverageData?.filter(c => c.status === 'accepted' || c.status === 'resolved').length ?? 0
  const coverageRate = totalCoverageRequests > 0 ? Math.round((acceptedCoverage / totalCoverageRequests) * 100) : 0
  const pendingCoverage = coverageData?.filter(c => c.status === 'pending' || c.status === 'escalated').length ?? 0

  // --- Camp revenue ---
  const { data: campDetails } = await supabase
    .from('camp_details')
    .select('id, fee_cents')
    .eq('club_id', clubId)

  let totalRevenue = 0
  let totalCollected = 0
  let totalCampRegistrations = 0

  if (campDetails && campDetails.length > 0) {
    const detailIds = campDetails.map(d => d.id)
    const { data: regs } = await supabase
      .from('camp_registrations')
      .select('camp_detail_id, payment_status')
      .in('camp_detail_id', detailIds)

    totalCampRegistrations = regs?.length ?? 0

    for (const reg of regs ?? []) {
      const detail = campDetails.find(d => d.id === reg.camp_detail_id)
      if (detail) {
        totalRevenue += detail.fee_cents
        if (reg.payment_status === 'paid') {
          totalCollected += detail.fee_cents
        }
      }
    }
  }

  // --- Team breakdown ---
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', clubId)
    .order('age_group', { ascending: true })

  const teamStats = []
  for (const team of teams ?? []) {
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)

    const { count: eventCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('status', 'scheduled')
      .gte('start_time', thirtyDaysAgo.toISOString())

    teamStats.push({
      name: team.name,
      ageGroup: team.age_group,
      players: playerCount ?? 0,
      eventsLast30: eventCount ?? 0,
    })
  }

  // --- Feedback count ---
  const { count: totalFeedback } = await supabase
    .from('player_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)

  return {
    overview: {
      totalTeams: totalTeams ?? 0,
      totalPlayers: totalPlayers ?? 0,
      totalCoaches: totalCoaches ?? 0,
      totalParents: totalParents ?? 0,
    },
    activity: {
      eventsThisMonth,
      cancelledThisMonth,
      attendanceRate,
      totalAttendance,
      presentCount,
    },
    coverage: {
      totalRequests: totalCoverageRequests,
      coverageRate,
      pendingCoverage,
    },
    revenue: {
      totalRevenueCents: totalRevenue,
      totalCollectedCents: totalCollected,
      totalCampRegistrations,
    },
    teamStats,
    totalFeedback: totalFeedback ?? 0,
  }
}
