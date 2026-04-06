import { createServiceClient } from '@/lib/supabase/service'

interface RankedCoach {
  profileId: string
  displayName: string
  score: number
}

export async function autoAssignCoverage(
  requestId: string,
  eventId: string,
  clubId: string,
  unavailableCoachId: string
): Promise<{ assigned: boolean; coachName?: string }> {
  const service = createServiceClient()

  // Get event details
  const { data: event } = await service
    .from('events')
    .select('title, start_time, end_time, team_id')
    .eq('id', eventId)
    .single()

  if (!event) return { assigned: false }

  // Get all coaches in the club except the unavailable one
  const { data: allCoaches } = await service
    .from('profiles')
    .select('id, display_name')
    .eq('club_id', clubId)
    .eq('role', 'coach')
    .neq('id', unavailableCoachId)

  if (!allCoaches || allCoaches.length === 0) return { assigned: false }

  // Find coaches with conflicting events at the same time (exclude the event being covered)
  const { data: conflictingEvents } = await service
    .from('events')
    .select('team_id')
    .eq('club_id', clubId)
    .eq('status', 'scheduled')
    .neq('id', eventId)
    .lt('start_time', event.end_time)
    .gt('end_time', event.start_time)

  const busyTeamIds = (conflictingEvents ?? []).map(e => e.team_id)

  // Find which coaches are on those busy teams
  const busyCoachIds = new Set<string>()
  if (busyTeamIds.length > 0) {
    const { data: busyMembers } = await service
      .from('team_members')
      .select('profile_id')
      .in('team_id', busyTeamIds)
      .eq('role', 'coach')

    for (const m of busyMembers ?? []) {
      busyCoachIds.add(m.profile_id)
    }
  }

  // Filter to available coaches
  const availableCoaches = allCoaches.filter(c => !busyCoachIds.has(c.id))

  if (availableCoaches.length === 0) return { assigned: false }

  // Rank coaches
  // 1. Coaches on the same team get +10 points (they know the players)
  // 2. Fewer recent coverage assignments = higher score (spread the load)
  const { data: teamMembers } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', event.team_id)
    .eq('role', 'coach')

  const sameTeamCoachIds = new Set((teamMembers ?? []).map(m => m.profile_id))

  // Count recent coverage assignments (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentCoverage } = await service
    .from('coverage_requests')
    .select('covering_coach_id')
    .eq('club_id', clubId)
    .in('status', ['accepted', 'resolved'])
    .gte('created_at', thirtyDaysAgo)
    .not('covering_coach_id', 'is', null)

  const coverageCount: Record<string, number> = {}
  for (const r of recentCoverage ?? []) {
    if (r.covering_coach_id) {
      coverageCount[r.covering_coach_id] = (coverageCount[r.covering_coach_id] ?? 0) + 1
    }
  }

  const ranked: RankedCoach[] = availableCoaches.map(c => {
    let score = 0
    // Same team bonus
    if (sameTeamCoachIds.has(c.id)) score += 10
    // Fewer recent coverages = higher score (max 5 bonus points)
    const count = coverageCount[c.id] ?? 0
    score += Math.max(0, 5 - count)
    return { profileId: c.id, displayName: c.display_name, score }
  })

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score)

  const bestMatch = ranked[0]

  // Auto-assign
  const { error } = await service
    .from('coverage_requests')
    .update({
      status: 'accepted',
      covering_coach_id: bestMatch.profileId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) return { assigned: false }

  // Log the auto-accept response
  await service.from('coverage_responses').insert({
    coverage_request_id: requestId,
    coach_id: bestMatch.profileId,
    response: 'accepted',
  })

  return { assigned: true, coachName: bestMatch.displayName }
}
