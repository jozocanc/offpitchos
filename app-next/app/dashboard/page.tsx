import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import AttentionPanel from './attention-panel'
import CoachAttentionPanel from './coach-attention-panel'
import ParentAttentionPanel from './parent-attention-panel'
import InstallPrompt from '@/components/install-prompt'

const ADMIN_EMAIL = 'jozo.cancar27@gmail.com'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, club_id, role')
    .eq('user_id', user.id)
    .single()

  // Respect the admin role switcher (same logic as layout)
  let userRole = profile?.role ?? 'parent'
  if (user.email === ADMIN_EMAIL) {
    const cookieStore = await cookies()
    const viewAs = cookieStore.get('viewAsRole')?.value
    if (viewAs && ['doc', 'coach', 'parent'].includes(viewAs)) {
      userRole = viewAs
    }
  }

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

  // Fetch user's teams (for coaches and parents)
  const { data: myTeamsRaw } = await supabase
    .from('team_members')
    .select('team_id, role, teams(name, age_group)')
    .eq('user_id', user.id)

  const myTeams = (myTeamsRaw ?? []) as unknown as { team_id: string; role: string; teams: { name: string; age_group: string } }[]

  // Fetch today's upcoming events with details
  const { data: todayEvents, error: todayEventsError } = profile?.club_id
    ? await supabase
        .from('events')
        .select('id, title, start_time, end_time, type, status, teams(name, age_group)')
        .eq('club_id', profile.club_id)
        .gte('start_time', todayStart.toISOString())
        .lte('start_time', todayEnd.toISOString())
        .order('start_time', { ascending: true })
        .limit(10)
    : { data: null, error: null }

  if (todayEventsError) console.error('todayEvents error:', todayEventsError)

  const displayName = profile?.display_name
    ?? user.user_metadata?.full_name
    ?? user.email?.split('@')[0]?.split('.')[0]?.replace(/\d+/g, '')?.replace(/^./, c => c.toUpperCase())
    ?? 'there'
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

      {/* PWA install CTA — self-contained, hides itself if already installed,
          dismissed, or running on a browser that can't install. Sits above
          the attention panels so it's visible but not blocking critical info. */}
      <InstallPrompt />

      {/* AI-prioritized attention list (DOC only) */}
      {userRole === 'doc' && <AttentionPanel />}

      {/* Coach-scoped attention panel — surfaces coverage requests waiting
          for them, recently-ended events with no attendance marked, and
          events where they still owe player feedback. Hidden entirely when
          there are no pending signals to avoid empty-state noise. */}
      {userRole === 'coach' && <CoachAttentionPanel />}

      {/* Parent-scoped panel — handles the "claim your kids" flow, gear
          size nudges, unpaid camp fees, and new coach feedback. Renders the
          "My Kids" navigation card once the parent has linked their
          children. Hidden entirely when there are no signals AND no kids. */}
      {userRole === 'parent' && <ParentAttentionPanel />}

      {/* Stat cards — 1 col mobile, 2 col sm, 3 col lg for DOC so cards never
          get squeezed below ~180 px at the 3-col breakpoint. */}
      <div className={`grid grid-cols-1 ${userRole === 'doc' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'} gap-3 sm:gap-4 mb-10`}>
        <StatCard
          label={userRole === 'doc' ? 'Total Teams' : 'My Teams'}
          value={String(userRole === 'doc' ? (teamCount ?? 0) : myTeams.length)}
          accent="green"
        />
        <StatCard
          label="Today&apos;s Sessions"
          value={String(todaySessions ?? 0)}
          accent="green"
        />
        {userRole === 'doc' && (
          <StatCard
            label="Coverage Alerts"
            value={String(coverageAlerts ?? 0)}
            accent={(coverageAlerts ?? 0) > 0 ? 'green' : 'gray'}
          />
        )}
      </div>

      {/* My Teams (for coaches and parents) */}
      {userRole !== 'doc' && myTeams.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-4">My Teams</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myTeams.map(tm => (
              <Link
                key={tm.team_id}
                href={`/dashboard/teams/${tm.team_id}`}
                className="bg-dark-secondary rounded-xl p-4 border border-white/5 hover:border-green/20 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{tm.teams.name}</p>
                  <p className="text-gray text-xs mt-0.5 capitalize">{tm.role}</p>
                </div>
                <span className="text-xs font-bold bg-green/10 text-green px-2 py-1 rounded-full">
                  {tm.teams.age_group}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Today's schedule */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Today&apos;s Schedule</h2>
          <Link href="/dashboard/schedule" className="text-xs font-bold text-green hover:opacity-80 transition-opacity">
            View all
          </Link>
        </div>
        {!todayEvents || todayEvents.length === 0 ? (
          <div className="bg-dark-secondary rounded-2xl p-6 text-center border border-white/5">
            <p className="text-gray text-sm">No events scheduled for today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayEvents.map(event => {
              const start = new Date(event.start_time)
              const end = new Date(event.end_time)
              const timeStr = `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              const team = event.teams as unknown as { name: string; age_group: string } | null
              const isCancelled = event.status === 'cancelled'

              return (
                <Link
                  key={event.id}
                  href="/dashboard/schedule"
                  className={`bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-4 hover:border-green/20 transition-colors block ${isCancelled ? 'opacity-50' : ''}`}
                >
                  <div className="text-center shrink-0 w-14">
                    <p className="text-green font-bold text-sm">{start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-sm truncate ${isCancelled ? 'line-through' : ''}`}>{event.title}</p>
                      {isCancelled && <span className="text-xs text-red font-bold">Cancelled</span>}
                    </div>
                    <p className="text-gray text-xs mt-0.5">
                      {timeStr}
                      {team && <span> &middot; {team.name} ({team.age_group})</span>}
                    </p>
                  </div>
                  <span className="text-xs font-medium bg-white/5 text-gray px-2 py-1 rounded-full shrink-0 capitalize">
                    {event.type}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick actions for new clubs — DOC only since these are admin setup steps */}
      {isNewClub && userRole === 'doc' && (
        <div>
          <h2 className="text-lg font-bold mb-4">Quick actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QuickAction
              href="/dashboard/teams"
              title="Add a team"
              description="Create additional teams in your club."
              icon="+"
            />
            <QuickAction
              href="/dashboard/coaches"
              title="Invite a coach"
              description="Bring your coaching staff onto OffPitchOS."
              icon="+"
            />
            <QuickAction
              href="/dashboard/schedule"
              title="Create a schedule"
              description="Set up practices, games, and events for your teams."
              icon="+"
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
  // Responsive sizing: smaller padding + font on narrow screens so labels
  // like "Today's Sessions" don't squeeze a big number off the card. The
  // min-w-0 lets the grid cell shrink below its content's intrinsic width
  // and truncate covers numeric overflow as a safety net.
  return (
    <div className="bg-dark-secondary rounded-2xl p-4 sm:p-6 border border-white/5 hover:border-green/10 transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,255,135,0.05)] min-w-0">
      <p className="text-gray text-xs sm:text-sm mb-2 leading-tight min-h-[2.4em] line-clamp-2">{label}</p>
      <p className={`text-2xl sm:text-3xl lg:text-4xl font-black truncate tabular-nums ${accent === 'green' ? 'text-green' : 'text-white'}`}>
        {value}
      </p>
      {note && <p className="text-gray text-xs mt-2 truncate">{note}</p>}
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
