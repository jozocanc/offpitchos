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

      const { data: nextEvents } = await supabase
        .from('events')
        .select('title, start_time')
        .eq('team_id', team.id)
        .eq('status', 'scheduled')
        .gte('start_time', now)
        .order('start_time', { ascending: true })
        .limit(1)

      return {
        ...team,
        member_count: memberCount ?? 0,
        coach_count: coachCount ?? 0,
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
  return (
    <Link
      href={`/dashboard/teams/${team.id}`}
      className="bg-dark-secondary rounded-2xl p-6 border border-white/5 hover:border-green/20 transition-colors block"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-lg leading-tight">{team.name}</h3>
        <span className="text-xs font-bold bg-green/10 text-green px-2 py-1 rounded-full shrink-0 ml-2">
          {team.age_group}
        </span>
      </div>
      <div className="flex items-center gap-3 text-gray text-sm">
        <span>{team.member_count} member{team.member_count !== 1 ? 's' : ''}</span>
        {team.coach_count > 0 && (
          <>
            <span className="text-white/10">|</span>
            <span>{team.coach_count} coach{team.coach_count !== 1 ? 'es' : ''}</span>
          </>
        )}
      </div>
      {team.next_event && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-xs text-gray">
            Next: <span className="text-white">{team.next_event.title}</span>
            {' '}&middot;{' '}
            {new Date(team.next_event.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </div>
      )}
    </Link>
  )
}
