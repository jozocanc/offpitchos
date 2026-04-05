import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, club_id')
    .eq('user_id', user.id)
    .single()

  // Count teams in the club
  const { count: teamCount } = profile?.club_id
    ? await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', profile.club_id)
    : { count: 0 }

  // Count today's sessions
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const { count: todaySessions } = profile?.club_id
    ? await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', profile.club_id)
        .eq('status', 'scheduled')
        .gte('start_time', todayStart.toISOString())
        .lte('start_time', todayEnd.toISOString())
    : { count: 0 }

  // Count active coverage requests (pending + escalated)
  const { count: coverageAlerts } = profile?.club_id
    ? await supabase
        .from('coverage_requests')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', profile.club_id)
        .in('status', ['pending', 'escalated'])
    : { count: 0 }

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'there'
  const isNewClub = (teamCount ?? 0) <= 1

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Welcome header */}
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight">
          Welcome back, <span className="text-green">{displayName}</span>
        </h1>
        <p className="text-gray mt-1 text-sm">Here&apos;s what&apos;s happening with your club today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Total Teams"
          value={String(teamCount ?? 0)}
          accent="green"
        />
        <StatCard
          label="Today's Sessions"
          value={String(todaySessions ?? 0)}
          accent="green"
        />
        <StatCard
          label="Coverage Alerts"
          value={String(coverageAlerts ?? 0)}
          accent={(coverageAlerts ?? 0) > 0 ? 'green' : 'gray'}
        />
      </div>

      {/* Quick actions for new clubs */}
      {isNewClub && (
        <div>
          <h2 className="text-lg font-bold mb-4">Quick actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QuickAction
              href="/dashboard/teams"
              title="Add a team"
              description="Create additional teams in your club."
              icon="⚽"
            />
            <QuickAction
              href="/dashboard/coaches"
              title="Invite a coach"
              description="Bring your coaching staff onto OffPitchOS."
              icon="📋"
            />
            <QuickAction
              href="/dashboard/schedule"
              title="Create a schedule"
              description="Set up practices, games, and events for your teams."
              icon="📅"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  note,
}: {
  label: string
  value: string
  accent: 'green' | 'gray'
  note?: string
}) {
  return (
    <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <p className="text-gray text-sm mb-2">{label}</p>
      <p className={`text-4xl font-black ${accent === 'green' ? 'text-green' : 'text-white'}`}>
        {value}
      </p>
      {note && <p className="text-gray text-xs mt-2">{note}</p>}
    </div>
  )
}

function QuickAction({
  href,
  title,
  description,
  icon,
}: {
  href: string
  title: string
  description: string
  icon: string
}) {
  return (
    <Link
      href={href}
      className="bg-dark-secondary rounded-2xl p-6 border border-white/5 hover:border-green/30 transition-colors group"
    >
      <span className="text-2xl mb-3 block">{icon}</span>
      <h3 className="font-bold group-hover:text-green transition-colors">{title}</h3>
      <p className="text-gray text-sm mt-1">{description}</p>
    </Link>
  )
}
