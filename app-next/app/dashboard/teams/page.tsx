import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddTeamForm from './add-team-form'

export const metadata: Metadata = { title: 'Teams' }

interface Team {
  id: string
  name: string
  age_group: string
  member_count: number
  coach_count: number
  player_count: number
  attendance_rate: number
  next_event: { title: string; start_time: string } | null
  // Per-team roster health counts, computed server-side so the card can show
  // an "N issues" pill without the client re-querying.
  unlinked_count: number
  missing_sizes_count: number
  low_attendance_count: number
}

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <h1 className="text-3xl font-black tracking-tight">Teams</h1>
        <p className="text-gray mt-4">No club found. Please complete onboarding.</p>
      </div>
    )
  }

  const { data: teamsRaw, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)
    .order('age_group', { ascending: true })

  if (teamsError) {
    console.error('Teams query error:', teamsError.message)
  }

  // Get member counts, coach counts, next event, and per-team roster health for each team.
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const thirtyDaysAgo = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const teams: Team[] = await Promise.all(
    (teamsRaw ?? []).map(async team => {
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('user_id, role')
        .eq('team_id', team.id)

      const memberCount = teamMembers?.length ?? 0
      const coachCount = teamMembers?.filter(m => m.role === 'coach').length ?? 0
      const parentMemberIds = new Set(
        (teamMembers ?? []).filter(m => m.role === 'parent').map(m => m.user_id),
      )

      const { data: teamPlayers } = await supabase
        .from('players')
        .select('id, parent_id, jersey_size, shorts_size')
        .eq('team_id', team.id)

      const playerCount = teamPlayers?.length ?? 0

      // Unlinked: parent_id is not one of the team's parent team_members.
      // Missing sizes: jersey_size or shorts_size is null.
      const unlinkedCount = (teamPlayers ?? []).filter(p => !parentMemberIds.has(p.parent_id)).length
      const missingSizesCount = (teamPlayers ?? []).filter(p => !p.jersey_size || !p.shorts_size).length

      const { data: nextEvents } = await supabase
        .from('events')
        .select('title, start_time')
        .eq('team_id', team.id)
        .eq('status', 'scheduled')
        .gte('start_time', now)
        .order('start_time', { ascending: true })
        .limit(1)

      // Attendance rate (last 30 days) — team-wide, plus per-player rate so we
      // can count how many players are trending < 60%.
      const { data: recentTeamEvents } = await supabase
        .from('events')
        .select('id')
        .eq('team_id', team.id)
        .eq('status', 'scheduled')
        .gte('start_time', thirtyDaysAgo)
        .lte('start_time', now)

      let attendanceRate = 0
      let lowAttendanceCount = 0
      const recentIds = (recentTeamEvents ?? []).map(e => e.id)
      if (recentIds.length > 0) {
        const { data: att } = await supabase
          .from('attendance')
          .select('player_id, status')
          .in('event_id', recentIds)

        const total = att?.length ?? 0
        const present = att?.filter(a => a.status === 'present' || a.status === 'late').length ?? 0
        attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0

        const perPlayer: Record<string, { total: number; present: number }> = {}
        for (const row of att ?? []) {
          const t = perPlayer[row.player_id] ?? { total: 0, present: 0 }
          t.total += 1
          if (row.status === 'present' || row.status === 'late') t.present += 1
          perPlayer[row.player_id] = t
        }
        for (const p of teamPlayers ?? []) {
          const stats = perPlayer[p.id]
          if (!stats || stats.total === 0) continue
          const rate = (stats.present / stats.total) * 100
          if (rate < 60) lowAttendanceCount += 1
        }
      }

      return {
        ...team,
        member_count: memberCount,
        coach_count: coachCount,
        player_count: playerCount,
        attendance_rate: attendanceRate,
        next_event: nextEvents?.[0] ?? null,
        unlinked_count: unlinkedCount,
        missing_sizes_count: missingSizesCount,
        low_attendance_count: lowAttendanceCount,
      }
    })
  )

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Teams</h1>
          <p className="text-gray text-sm mt-1">{teams.length} team{teams.length !== 1 ? 's' : ''} in your club</p>
        </div>
        {profile?.role === 'doc' && <AddTeamForm />}
      </div>

      {teams.length === 0 ? (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
          <p className="text-gray text-lg">No teams yet.</p>
          <p className="text-gray text-sm mt-1">Use the &quot;Add Team&quot; button to create your first team.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </div>
  )
}

function TeamCard({ team }: { team: Team }) {
  const rateColor = team.attendance_rate >= 80 ? 'text-green' : team.attendance_rate >= 60 ? 'text-yellow-400' : 'text-red-400'
  const issueCount = team.unlinked_count + team.missing_sizes_count + team.low_attendance_count
  // "Needs attention" if there are any unlinked players (the biggest silent
  // notification risk) or low-attendance kids; missing sizes alone is softer.
  const issueTone = team.unlinked_count > 0 || team.low_attendance_count > 0 ? 'warn' : 'soft'

  return (
    <div className="bg-dark-secondary rounded-2xl border border-white/5 hover:border-green/20 transition-colors flex flex-col h-full">
      <Link href={`/dashboard/teams/${team.id}`} className="block p-6 flex-1">
        <div className="flex items-start justify-between mb-3 gap-2">
          <h3 className="font-bold text-lg leading-tight">{team.name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {issueCount > 0 && (
              <span
                title={[
                  team.unlinked_count > 0 ? `${team.unlinked_count} unlinked` : null,
                  team.missing_sizes_count > 0 ? `${team.missing_sizes_count} missing sizes` : null,
                  team.low_attendance_count > 0 ? `${team.low_attendance_count} low attendance` : null,
                ].filter(Boolean).join(' · ')}
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  issueTone === 'warn'
                    ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
                    : 'bg-white/5 text-gray border border-white/10'
                }`}
              >
                ⚠ {issueCount}
              </span>
            )}
            <span className="text-xs font-bold bg-green/10 text-green px-2 py-1 rounded-full">
              {team.age_group}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{team.player_count}</p>
            <p className="text-[10px] text-gray uppercase tracking-wider">Players</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">{team.coach_count}</p>
            <p className="text-[10px] text-gray uppercase tracking-wider">Coaches</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${rateColor}`}>{team.attendance_rate}%</p>
            <p className="text-[10px] text-gray uppercase tracking-wider">Attendance</p>
          </div>
        </div>

        {/* Attendance bar */}
        <div className="w-full bg-white/5 rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all ${team.attendance_rate >= 80 ? 'bg-green' : team.attendance_rate >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${team.attendance_rate}%` }}
          />
        </div>

        {/* Next event */}
        <div className="pt-3 border-t border-white/5">
          {team.next_event ? (
            <p className="text-xs text-gray">
              Next: <span className="text-white">{team.next_event.title}</span>
              {' '}&middot;{' '}
              {new Date(team.next_event.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          ) : (
            <p className="text-xs text-gray/50">No upcoming events</p>
          )}
        </div>
      </Link>

      {/* Quick actions */}
      <div className="flex border-t border-white/5 text-xs">
        <Link
          href={`/dashboard/teams/${team.id}`}
          className="flex-1 text-center py-2.5 text-gray hover:text-green hover:bg-white/[0.02] transition-colors rounded-bl-2xl"
        >
          Roster
        </Link>
        <Link
          href={`/dashboard/schedule?team=${team.id}`}
          className="flex-1 text-center py-2.5 text-gray hover:text-green hover:bg-white/[0.02] transition-colors border-x border-white/5"
        >
          Schedule
        </Link>
        <Link
          href={`/dashboard/schedule?team=${team.id}`}
          className="flex-1 text-center py-2.5 text-gray hover:text-green hover:bg-white/[0.02] transition-colors rounded-br-2xl"
        >
          Attendance
        </Link>
      </div>
    </div>
  )
}
