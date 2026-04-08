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
}

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
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

  // Get member counts, coach counts, and next event for each team
  const now = new Date().toISOString()
  const teams: Team[] = await Promise.all(
    (teamsRaw ?? []).map(async team => {
      const { count: memberCount } = await supabase
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)

      const { count: coachCount } = await supabase
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('role', 'coach')

      const { count: playerCount } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)

      const { data: nextEvents } = await supabase
        .from('events')
        .select('title, start_time')
        .eq('team_id', team.id)
        .eq('status', 'scheduled')
        .gte('start_time', now)
        .order('start_time', { ascending: true })
        .limit(1)

      // Attendance rate (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentTeamEvents } = await supabase
        .from('events')
        .select('id')
        .eq('team_id', team.id)
        .eq('status', 'scheduled')
        .gte('start_time', thirtyDaysAgo)
        .lte('start_time', now)

      let attendanceRate = 0
      const recentIds = (recentTeamEvents ?? []).map(e => e.id)
      if (recentIds.length > 0) {
        const { data: att } = await supabase
          .from('attendance')
          .select('status')
          .in('event_id', recentIds)
        const total = att?.length ?? 0
        const present = att?.filter(a => a.status === 'present' || a.status === 'late').length ?? 0
        attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0
      }

      return {
        ...team,
        member_count: memberCount ?? 0,
        coach_count: coachCount ?? 0,
        player_count: playerCount ?? 0,
        attendance_rate: attendanceRate,
        next_event: nextEvents?.[0] ?? null,
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
        <AddTeamForm />
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

  return (
    <div className="bg-dark-secondary rounded-2xl border border-white/5 hover:border-green/20 transition-colors flex flex-col h-full">
      <Link href={`/dashboard/teams/${team.id}`} className="block p-6 flex-1">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-lg leading-tight">{team.name}</h3>
          <span className="text-xs font-bold bg-green/10 text-green px-2 py-1 rounded-full shrink-0 ml-2">
            {team.age_group}
          </span>
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
