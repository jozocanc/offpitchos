import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AttentionPanel from './attention-panel'
import CoachAttentionPanel from './coach-attention-panel'
import ParentAttentionPanel from './parent-attention-panel'
import OnboardingChecklist from './onboarding-checklist'
import DemoSeedButton from './demo-seed-button'
import { getDemoSeedState } from './demo-seed-actions'
import InstallPrompt from '@/components/install-prompt'
import { getEffectiveRole } from '@/lib/admin-role'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { formatTime } from '@/lib/format-datetime'
import { isMember } from '@/lib/constants'
import { teamLabel, ageGroupLabel } from '@/lib/team-label'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  // getClaims verifies the JWT locally (asymmetric signing keys) — no network
  // round-trip to the auth server. Middleware already refreshed the session.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (!claims) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, club_id, role')
    .eq('user_id', claims.sub)
    .single()

  // Respect the "preview as" switcher (same helper as the layout)
  const userRole = await getEffectiveRole(profile?.role ?? 'parent')

  const displayName = profile?.display_name
    ?? claims.user_metadata?.full_name
    ?? claims.email?.split('@')[0]?.split('.')[0]?.replace(/\d+/g, '')?.replace(/^./, c => c.toUpperCase())
    ?? 'there'

  // Only the header below blocks first paint (one profile query). Everything
  // data-heavy streams in via <DashboardBody> so the shell renders instantly.
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
          dismissed, or running on a browser that can't install. */}
      <InstallPrompt />

      <Suspense fallback={<DashboardBodySkeleton userRole={userRole} />}>
        <DashboardBody
          userRole={userRole}
          clubId={profile?.club_id ?? null}
          profileId={profile?.id ?? null}
        />
      </Suspense>
    </div>
  )
}

async function DashboardBody({
  userRole,
  clubId,
  profileId,
}: {
  userRole: string
  clubId: string | null
  profileId: string | null
}) {
  const supabase = await createClient()
  const timezone = await getClubTimezone()
  const isDoc = userRole === 'doc'

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  // Wave 1: every query that only needs club_id / profile_id, fired
  // concurrently instead of one-after-another.
  const [teamCountRes, todaySessionsRes, coverageRes, myTeamsRes, demoState] =
    await Promise.all([
      isDoc && clubId
        ? supabase.from('teams').select('id', { count: 'exact', head: true }).eq('club_id', clubId)
        : Promise.resolve({ count: 0 }),
      clubId
        ? supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .eq('status', 'scheduled')
            .gte('start_time', todayStart.toISOString())
            .lte('start_time', todayEnd.toISOString())
        : Promise.resolve({ count: 0 }),
      isDoc && clubId
        ? supabase
            .from('coverage_requests')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .in('status', ['pending', 'escalated'])
        : Promise.resolve({ count: 0 }),
      profileId
        ? supabase
            .from('team_members')
            .select('team_id, role, teams(name, age_group)')
            .eq('profile_id', profileId)
        : Promise.resolve({ data: null }),
      isDoc ? getDemoSeedState() : Promise.resolve(null),
    ])

  const teamCount = teamCountRes.count
  const todaySessions = todaySessionsRes.count
  const coverageAlerts = coverageRes.count
  const myTeams = (myTeamsRes.data ?? []) as unknown as { team_id: string; role: string; teams: { name: string; age_group: string } }[]
  const myTeamIds = myTeams.map(tm => tm.team_id)

  // Wave 2: today's events — scoped to the viewer's teams for coach/parent so
  // they don't see other teams' events. Depends on myTeamIds, so it follows.
  let todayEventsQuery = supabase
    .from('events')
    .select('id, title, start_time, end_time, type, status, team_id, teams(name, age_group)')
    .eq('club_id', clubId ?? '')
    .gte('start_time', todayStart.toISOString())
    .lte('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true })
    .limit(10)

  if (!isDoc && myTeamIds.length > 0) {
    todayEventsQuery = todayEventsQuery.in('team_id', myTeamIds)
  }

  const { data: todayEvents, error: todayEventsError } = clubId
    ? await todayEventsQuery
    : { data: null, error: null }

  if (todayEventsError) console.error('todayEvents error:', todayEventsError)

  return (
    <>
      {/* Demo seed button (DOC only, gated by NEXT_PUBLIC_ALLOW_DEMO_SEED). */}
      {isDoc && demoState && <DemoSeedButton state={demoState} />}

      {/* Post-wizard setup checklist (DOC only, self-hides when dismissed). */}
      {isDoc && <OnboardingChecklist />}

      {/* AI-prioritized attention list (DOC only). Key flips on seed/clear so
          React remounts the client component and re-runs its load effect. */}
      {isDoc && <AttentionPanel key={`demo-${demoState?.loaded ? 'on' : 'off'}`} />}

      {/* Coach-scoped attention panel. */}
      {userRole === 'coach' && <CoachAttentionPanel />}

      {/* Parent-scoped attention panel. */}
      {isMember(userRole) && <ParentAttentionPanel />}

      {/* Stat cards. */}
      <div className={`grid grid-cols-1 ${isDoc ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'} gap-3 sm:gap-4 mb-10`}>
        <StatCard
          label={isDoc ? 'Total Teams' : 'My Teams'}
          value={String(isDoc ? (teamCount ?? 0) : myTeams.length)}
          accent="green"
        />
        <StatCard
          label="Today&apos;s Sessions"
          value={String(todaySessions ?? 0)}
          accent="green"
        />
        {isDoc && (
          <StatCard
            label="Coverage Alerts"
            value={String(coverageAlerts ?? 0)}
            accent={(coverageAlerts ?? 0) > 0 ? 'green' : 'gray'}
          />
        )}
      </div>

      {/* My Teams (for coaches and parents) */}
      {!isDoc && myTeams.length > 0 && (
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
                  {ageGroupLabel(tm.teams.age_group) ?? 'Team'}
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
              const timeStr = `${formatTime(start, timezone)} - ${formatTime(end, timezone)}`
              const team = event.teams as unknown as { name: string; age_group: string } | null
              const isCancelled = event.status === 'cancelled'

              return (
                <Link
                  key={event.id}
                  href="/dashboard/schedule"
                  className={`bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-4 hover:border-green/20 transition-colors block ${isCancelled ? 'opacity-50' : ''}`}
                >
                  <div className="text-center shrink-0 w-14">
                    <p className="text-green font-bold text-sm">{formatTime(start, timezone)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-sm truncate ${isCancelled ? 'line-through' : ''}`}>{event.title}</p>
                      {isCancelled && <span className="text-xs text-red font-bold">Cancelled</span>}
                    </div>
                    <p className="text-gray text-xs mt-0.5">
                      {timeStr}
                      {team && <span> &middot; {teamLabel(team.name, team.age_group)}</span>}
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
    </>
  )
}

function DashboardBodySkeleton({ userRole }: { userRole: string }) {
  const isDoc = userRole === 'doc'
  return (
    <div className="animate-pulse">
      {/* attention panel placeholder */}
      <div className="bg-dark-secondary rounded-2xl border border-white/5 h-40 mb-10" />
      {/* stat cards */}
      <div className={`grid grid-cols-1 ${isDoc ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'} gap-3 sm:gap-4 mb-10`}>
        {(isDoc ? [1, 2, 3] : [1, 2]).map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-6 border border-white/5 h-32" />
        ))}
      </div>
      {/* schedule */}
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary rounded-xl border border-white/5 h-16" />
        ))}
      </div>
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
