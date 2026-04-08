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

function getDateRange(period: string): { start: Date; end: Date; label: string } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  switch (period) {
    case '7d': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      start.setHours(0, 0, 0, 0)
      return { start, end, label: 'Last 7 Days' }
    }
    case '90d': {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      start.setHours(0, 0, 0, 0)
      return { start, end, label: 'Last 90 Days' }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start, end, label: 'This Month' }
    }
    case '30d':
    default: {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      start.setHours(0, 0, 0, 0)
      return { start, end, label: 'Last 30 Days' }
    }
  }
}

export async function getAnalyticsData(period: string = '30d') {
  const { profile, supabase } = await getUserProfile()
  const clubId = profile.club_id!
  const { start: rangeStart, end: rangeEnd } = getDateRange(period)

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

  // --- Events in range ---
  const { data: rangeEvents } = await supabase
    .from('events')
    .select('id, type, status, start_time')
    .eq('club_id', clubId)
    .gte('start_time', rangeStart.toISOString())
    .lte('start_time', rangeEnd.toISOString())

  const eventsInRange = rangeEvents?.length ?? 0
  const cancelledInRange = rangeEvents?.filter(e => e.status === 'cancelled').length ?? 0

  // --- Events by day for chart ---
  const eventsByDay: Record<string, { scheduled: number; cancelled: number }> = {}
  for (const event of rangeEvents ?? []) {
    const day = new Date(event.start_time).toISOString().split('T')[0]
    if (!eventsByDay[day]) eventsByDay[day] = { scheduled: 0, cancelled: 0 }
    if (event.status === 'cancelled') {
      eventsByDay[day].cancelled++
    } else {
      eventsByDay[day].scheduled++
    }
  }

  const eventsChartData = Object.entries(eventsByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      scheduled: counts.scheduled,
      cancelled: counts.cancelled,
    }))

  // --- Attendance data in range ---
  const { data: recentEvents } = await supabase
    .from('events')
    .select('id, start_time')
    .eq('club_id', clubId)
    .eq('status', 'scheduled')
    .gte('start_time', rangeStart.toISOString())
    .lte('start_time', rangeEnd.toISOString())

  const recentEventIds = (recentEvents ?? []).map(e => e.id)
  let attendanceRate = 0
  let totalAttendance = 0
  let presentCount = 0

  // Attendance by day for chart
  const attendanceByDay: Record<string, { present: number; late: number; absent: number }> = {}

  if (recentEventIds.length > 0) {
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('status, event_id')
      .in('event_id', recentEventIds)

    totalAttendance = attendanceData?.length ?? 0
    presentCount = attendanceData?.filter(a => a.status === 'present' || a.status === 'late').length ?? 0
    attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0

    // Map event_id -> date for grouping
    const eventDateMap: Record<string, string> = {}
    for (const e of recentEvents ?? []) {
      eventDateMap[e.id] = new Date(e.start_time).toISOString().split('T')[0]
    }

    for (const a of attendanceData ?? []) {
      const day = eventDateMap[a.event_id]
      if (!day) continue
      if (!attendanceByDay[day]) attendanceByDay[day] = { present: 0, late: 0, absent: 0 }
      if (a.status === 'present') attendanceByDay[day].present++
      else if (a.status === 'late') attendanceByDay[day].late++
      else attendanceByDay[day].absent++
    }
  }

  const attendanceChartData = Object.entries(attendanceByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      present: counts.present,
      late: counts.late,
      absent: counts.absent,
    }))

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
      .gte('start_time', rangeStart.toISOString())

    // Get attendance rate per team
    const { data: teamEvents } = await supabase
      .from('events')
      .select('id')
      .eq('team_id', team.id)
      .eq('status', 'scheduled')
      .gte('start_time', rangeStart.toISOString())
      .lte('start_time', rangeEnd.toISOString())

    const teamEventIds = (teamEvents ?? []).map(e => e.id)
    let teamAttendanceRate = 0
    let teamTotalAttendance = 0
    let teamPresentCount = 0

    if (teamEventIds.length > 0) {
      const { data: teamAttendance } = await supabase
        .from('attendance')
        .select('status')
        .in('event_id', teamEventIds)

      teamTotalAttendance = teamAttendance?.length ?? 0
      teamPresentCount = teamAttendance?.filter(a => a.status === 'present' || a.status === 'late').length ?? 0
      teamAttendanceRate = teamTotalAttendance > 0 ? Math.round((teamPresentCount / teamTotalAttendance) * 100) : 0
    }

    teamStats.push({
      name: team.name,
      ageGroup: team.age_group,
      players: playerCount ?? 0,
      eventsLast30: eventCount ?? 0,
      attendanceRate: teamAttendanceRate,
      totalRecords: teamTotalAttendance,
      presentRecords: teamPresentCount,
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
      eventsInRange,
      cancelledInRange,
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
    charts: {
      events: eventsChartData,
      attendance: attendanceChartData,
    },
  }
}
