import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AttentionPanel from './attention-panel'
import { getAttentionList, getAttentionSignals } from './attention-actions'
import { getOnboardingState } from './onboarding-checklist-actions'
import { getMyCheckinState } from './check-in/actions'
import ParentAttentionPanel from './parent-attention-panel'
import CheckinCard from './check-in/checkin-card'
import OnboardingChecklist from './onboarding-checklist'
import DemoSeedButton from './demo-seed-button'
import { getDemoSeedState } from './demo-seed-actions'
import InstallPrompt from '@/components/install-prompt'
import SharedDashboardBodySkeleton from './dashboard-skeleton'
import { getEffectiveRole, getViewerIdentity } from '@/lib/admin-role'
import { getAuthClaims, getCurrentProfile } from '@/lib/current-profile'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { formatTime, formatShortDate } from '@/lib/format-datetime'
import { isMember, isStaff } from '@/lib/constants'
import { teamLabel, ageGroupLabel } from '@/lib/team-label'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  // Request-memoized: the layout, getClubTimezone() and getViewerIdentity()
  // share this one JWT check (local, no auth-server round-trip) and one
  // profile query instead of each issuing their own.
  const claims = await getAuthClaims()

  if (!claims) redirect('/login')

  const profile = await getCurrentProfile()

  // Respect the "preview as" switcher (same helper as the layout).
  // "View as → Player" renders the club's sample player's dashboard: their
  // name in the greeting, their team memberships below. Both only need the
  // cached profile, so they resolve together.
  const [userRole, viewer] = await Promise.all([
    getEffectiveRole(profile?.role ?? 'player'),
    getViewerIdentity(),
  ])
  const preview = viewer.isPreview ? viewer.previewPlayer : null
  const viewerProfileId = preview ? viewer.profileId : (profile?.id ?? null)

  // Staff are "Coach" in the greeting, the way players address them.
  const displayName = preview?.firstName
    ?? (isStaff(userRole) ? 'Coach' : null)
    ?? profile?.display_name
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
        <p className="text-gray mt-1 text-sm">Here&apos;s what&apos;s happening with your team today.</p>
      </div>

      {/* PWA install CTA — self-contained, hides itself if already installed,
          dismissed, or running on a browser that can't install. */}
      <InstallPrompt />

      <Suspense fallback={<DashboardBodySkeleton userRole={userRole} />}>
        <DashboardBody
          userRole={userRole}
          clubId={profile?.club_id ?? null}
          profileId={viewerProfileId}
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
  // Every coach gets the head coach's dashboard. Setup tools (demo seed,
  // onboarding checklist) stay with the head coach who created the program.
  const isDoc = userRole === 'doc' || userRole === 'coach'
  const isHeadCoach = userRole === 'doc'

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  // Head coach's attention panel: kick both calls off now so they overlap
  // with the queries below, and stream the promises to the client panel.
  // The fast one (database only) paints first; the AI-ranked one replaces
  // it when it lands. They share one signal gather (see attention-actions).
  // Never reject: a null tells the panel to fall back to its own fetch.
  const attentionSignals = isDoc ? getAttentionSignals().catch(() => null) : undefined
  const attentionRanked = isDoc ? getAttentionList().catch(() => null) : undefined

  // The setup checklist and the morning check-in card load their own data;
  // start it now so it overlaps the wave below instead of following it. The
  // no-op catch only marks the promise handled while it waits: the component
  // awaiting it still sees any rejection, exactly as before.
  const onboardingState = isHeadCoach ? getOnboardingState() : undefined
  onboardingState?.catch(() => {})
  const checkinState = isMember(userRole) ? getMyCheckinState() : undefined
  checkinState?.catch(() => {})

  // One wave: every query only needs club_id / profile_id, so they all fire
  // concurrently. Today's events used to wait for the viewer's team ids so it
  // could add `.in('team_id', ...)`; it now fetches the club's (one day,
  // already RLS-scoped) list here and narrows in memory below, which returns
  // the same rows without the second round-trip.
  const [timezone, teamCountRes, todaySessionsRes, coverageRes, myTeamsRes, demoState, todayEventsRes] =
    await Promise.all([
      getClubTimezone(),
      isDoc && clubId
        ? supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId)
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
            .from('events')
            .select('start_time, title')
            .eq('club_id', clubId)
            .eq('status', 'scheduled')
            .in('type', ['game', 'tournament'])
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
        : Promise.resolve({ data: null }),
      profileId
        ? supabase
            .from('team_members')
            .select('team_id, role, teams(name, age_group)')
            .eq('profile_id', profileId)
        : Promise.resolve({ data: null }),
      isHeadCoach ? getDemoSeedState() : Promise.resolve(null),
      clubId
        ? supabase
            .from('events')
            .select('id, title, start_time, end_time, type, status, team_id, teams(name, age_group)')
            .eq('club_id', clubId)
            .gte('start_time', todayStart.toISOString())
            .lte('start_time', todayEnd.toISOString())
            .order('start_time', { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ])

  const playerCount = teamCountRes.count
  const todaySessions = todaySessionsRes.count
  const nextGame = ((coverageRes as unknown as { data: { start_time: string; title: string }[] | null }).data ?? [])[0] ?? null
  const myTeams = (myTeamsRes.data ?? []) as unknown as { team_id: string; role: string; teams: { name: string; age_group: string } }[]
  const myTeamIds = myTeams.map(tm => tm.team_id)

  // Today's events, scoped to the viewer's teams for coach/player so they
  // don't see other teams' events, capped at 10 as before.
  const todayEventsError = todayEventsRes.error
  const myTeamIdSet = new Set(myTeamIds)
  const todayEvents = todayEventsRes.data
    ? (!isDoc && myTeamIds.length > 0
        ? todayEventsRes.data.filter(e => myTeamIdSet.has(e.team_id as string))
        : todayEventsRes.data
      ).slice(0, 10)
    : null

  if (todayEventsError) console.error('todayEvents error:', todayEventsError)

  return (
    <>
      {/* Demo seed button (DOC only, gated by NEXT_PUBLIC_ALLOW_DEMO_SEED). */}
      {isHeadCoach && demoState && <DemoSeedButton state={demoState} />}

      {/* Post-wizard setup checklist (DOC only, self-hides when dismissed). */}
      {isHeadCoach && <OnboardingChecklist statePromise={onboardingState} />}

      {/* AI-prioritized attention list (all coaching staff). Key flips on seed/clear so
          React remounts the client component and re-runs its load effect. */}
      {isDoc && (
        <AttentionPanel
          key={`demo-${demoState?.loaded ? 'on' : 'off'}`}
          initialSignals={attentionSignals}
          initialRanked={attentionRanked}
        />
      )}

      {/* Player-scoped attention panel. */}
      {/* Daily check-in first: it is the one thing players do every morning. */}
      {isMember(userRole) && <CheckinCard statePromise={checkinState} />}
      {isMember(userRole) && <ParentAttentionPanel />}

      {/* Stat cards. */}
      <div className={`grid grid-cols-2 ${isDoc ? 'lg:grid-cols-3' : ''} gap-3 sm:gap-4 mb-10`}>
        <StatCard
          label={isDoc ? 'Players' : 'My teams'}
          value={String(isDoc ? (playerCount ?? 0) : myTeams.length)}
          accent="green"
        />
        <StatCard
          label="Today&apos;s Sessions"
          value={String(todaySessions ?? 0)}
          accent="green"
        />
        {isDoc && (
          <StatCard
            label="Next game"
            value={nextGame ? formatShortDate(nextGame.start_time, timezone) : 'None'}
            accent={nextGame ? 'green' : 'gray'}
            note={nextGame?.title}
            className="col-span-2 lg:col-span-1"
          />
        )}
      </div>

      {/* My Teams (for coaches and players) */}
      {!isDoc && myTeams.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-4">My teams</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myTeams.map(tm => (
              <Link
                key={tm.team_id}
                href={`/dashboard/teams/${tm.team_id}`}
                className="bg-dark-secondary rounded-xl p-4 border border-white/5 hover:border-green/20 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{tm.teams.name}</p>
                  <p className="text-gray text-xs mt-0.5 capitalize">{tm.role === 'parent' ? 'player' : tm.role}</p>
                </div>
                {ageGroupLabel(tm.teams.age_group) && (
                  <span className="text-xs font-bold bg-green/10 text-green px-2 py-1 rounded-full">
                    {ageGroupLabel(tm.teams.age_group)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Today's schedule */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Today&apos;s Schedule</h2>
          <Link href="/dashboard/schedule" className="text-xs font-bold text-green hover:opacity-80 transition-opacity py-2 -my-2">
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
              const timeStr = `${formatTime(start, timezone)} – ${formatTime(end, timezone)}`
              const team = event.teams as unknown as { name: string; age_group: string } | null
              const isCancelled = event.status === 'cancelled'

              return (
                <Link
                  key={event.id}
                  href="/dashboard/schedule"
                  className={`bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-4 hover:border-green/20 transition-colors block ${isCancelled ? 'opacity-50' : ''}`}
                >
                  <div className="text-center shrink-0 w-[4.5rem]">
                    <p className="text-green font-bold text-sm whitespace-nowrap">{formatTime(start, timezone)}</p>
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
  return <SharedDashboardBodySkeleton userRole={userRole} />
}

function StatCard({
  label,
  value,
  accent,
  note,
  className = '',
}: {
  label: string
  value: string
  accent: 'green' | 'gray'
  note?: string
  className?: string
}) {
  // Responsive sizing: smaller padding + font on narrow screens so labels
  // like "Today's Sessions" don't squeeze a big number off the card. The
  // min-w-0 lets the grid cell shrink below its content's intrinsic width
  // and truncate covers numeric overflow as a safety net.
  return (
    <div className={`bg-dark-secondary rounded-2xl p-4 sm:p-6 border border-white/5 hover:border-green/10 transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,255,135,0.05)] min-w-0 ${className}`}>
      <p className="text-gray text-xs sm:text-sm mb-2 leading-tight line-clamp-2">{label}</p>
      <p className={`text-2xl sm:text-3xl lg:text-4xl font-black truncate tabular-nums ${accent === 'green' ? 'text-green' : 'text-white'}`}>
        {value}
      </p>
      {note && <p className="text-gray text-xs mt-2 truncate">{note}</p>}
    </div>
  )
}
