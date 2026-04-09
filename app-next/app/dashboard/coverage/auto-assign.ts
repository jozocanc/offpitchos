import { createServiceClient } from '@/lib/supabase/service'

export interface RankedCandidate {
  profileId: string
  displayName: string
  score: number
  reason: string
  sameTeam: boolean
  recentCoverages: number
}

function buildReason(sameTeam: boolean, recentCoverages: number): string {
  if (sameTeam && recentCoverages === 0) return 'Same team · lightest load this month'
  if (sameTeam) return `Same team · ${recentCoverages} recent coverage${recentCoverages === 1 ? '' : 's'}`
  if (recentCoverages === 0) return 'Lightest load this month'
  return `${recentCoverages} recent coverage${recentCoverages === 1 ? '' : 's'}`
}

/**
 * Rank available coaches for a coverage request using the same scoring the
 * auto-assign flow uses. Returned list is sorted best → worst. Empty array
 * means no available candidates (all coaches busy or none exist).
 */
export async function rankCoverageCandidates(
  eventId: string,
  clubId: string,
  unavailableCoachId: string,
): Promise<RankedCandidate[]> {
  const service = createServiceClient()

  // Get event details
  const { data: event } = await service
    .from('events')
    .select('title, start_time, end_time, team_id')
    .eq('id', eventId)
    .single()

  if (!event) return []

  // Get all coaches in the club except the unavailable one
  const { data: allCoaches } = await service
    .from('profiles')
    .select('id, display_name')
    .eq('club_id', clubId)
    .eq('role', 'coach')
    .neq('id', unavailableCoachId)

  if (!allCoaches || allCoaches.length === 0) return []

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
  if (availableCoaches.length === 0) return []

  // Same-team bonus
  const { data: teamMembers } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', event.team_id)
    .eq('role', 'coach')

  const sameTeamCoachIds = new Set((teamMembers ?? []).map(m => m.profile_id))

  // Count recent coverage assignments (last 30 days) — load balance
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

  const ranked: RankedCandidate[] = availableCoaches.map(c => {
    const sameTeam = sameTeamCoachIds.has(c.id)
    const recentCoverages = coverageCount[c.id] ?? 0

    let score = 0
    if (sameTeam) score += 10
    score += Math.max(0, 5 - recentCoverages)

    return {
      profileId: c.id,
      displayName: c.display_name ?? 'Coach',
      score,
      reason: buildReason(sameTeam, recentCoverages),
      sameTeam,
      recentCoverages,
    }
  })

  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

export async function autoAssignCoverage(
  requestId: string,
  eventId: string,
  clubId: string,
  unavailableCoachId: string
): Promise<{ assigned: boolean; coachName?: string; reason?: string }> {
  const ranked = await rankCoverageCandidates(eventId, clubId, unavailableCoachId)
  if (ranked.length === 0) return { assigned: false }

  const bestMatch = ranked[0]
  const service = createServiceClient()

  // Atomic assign — only succeeds if the request is still pending
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

  return { assigned: true, coachName: bestMatch.displayName, reason: bestMatch.reason }
}
