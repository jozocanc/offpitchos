import type { Metadata } from 'next'
import { appUrl } from '@/lib/app-url'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import InviteCoachForm from './invite-form'

export const metadata: Metadata = { title: 'Staff' }
import CopyLink from '../teams/[id]/copy-link'
import RevokeButton from './revoke-button'
import TitleSelect from './title-select'
import { DEFAULT_STAFF_TITLE, isStaff } from '@/lib/constants'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { getAuthUserId, getCurrentProfile } from '@/lib/current-profile'
import { formatMonthDayYear } from '@/lib/format-datetime'

interface Coach {
  profile_id: string
  staff_title: string
  user_id: string
  display_name: string | null
  teams: string[]
  eventsCount: number
  attendanceRate: number
}

interface Invite {
  id: string
  email: string | null
  token: string
  expires_at: string | null
  team_id: string | null
  staff_title: string | null
  teams: { name: string } | null
}

export default async function CoachesPage() {
  // Request-memoized claims + profile (lib/current-profile): one local JWT
  // check and one profile query, shared with getClubTimezone() below and with
  // anything else in this render that asks.
  if (!(await getAuthUserId())) redirect('/login')
  const profile = await getCurrentProfile()

  // Effective role, so the head coach's "View as: Player" preview is bounced
  // the same way a real player is.
  if (!isStaff(await getEffectiveRole(profile?.role ?? 'player'))) redirect('/dashboard')

  const supabase = await createClient()
  const clubId = profile?.club_id ?? ''

  // Wave 1: coaches, pending invites and teams only need the club id.
  const [timezone, { data: coachesRaw }, { data: invitesRaw }, { data: teams }] = await Promise.all([
    getClubTimezone(),
    supabase
      .from('profiles')
      .select('id, user_id, display_name, staff_title')
      .eq('club_id', clubId)
      .eq('role', 'coach')
      .order('display_name'),
    // Pending coach invites
    supabase
      .from('invites')
      .select('id, email, token, expires_at, team_id, staff_title, teams(name)')
      .eq('club_id', clubId)
      .eq('role', 'coach')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    // Teams for the invite form
    supabase
      .from('teams')
      .select('id, name, age_group')
      .eq('club_id', clubId)
      .order('age_group', { ascending: true }),
  ])

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  // Wave 2: per-coach stats. Used to be three sequential queries PER coach;
  // now team assignments and recent events are one batched query each, and
  // the attendance rate is two head-only counts per coach, all fired at once.
  // Counting in the database (instead of pulling every attendance row the
  // coach ever marked) returns the same numbers without the row transfer.
  const coachRows = coachesRaw ?? []
  const coachProfileIds = coachRows.map(c => c.id)
  const coachUserIds = coachRows.map(c => c.user_id).filter(Boolean) as string[]

  const [membershipsRes, eventsRes, attendanceCounts] = coachRows.length > 0
    ? await Promise.all([
        supabase
          .from('team_members')
          .select('profile_id, teams(name)')
          .in('profile_id', coachProfileIds)
          .eq('role', 'coach'),
        // Events created by these coaches (last 30 days)
        coachUserIds.length > 0
          ? supabase
              .from('events')
              .select('created_by')
              .in('created_by', coachUserIds)
              .gte('start_time', thirtyDaysAgo)
              .lte('start_time', now)
          : Promise.resolve({ data: [] as { created_by: string }[] }),
        // Attendance marked by each coach: total and present/late
        Promise.all(
          coachRows.map(coach =>
            Promise.all([
              supabase
                .from('attendance')
                .select('id', { count: 'exact', head: true })
                .eq('marked_by', coach.user_id),
              supabase
                .from('attendance')
                .select('id', { count: 'exact', head: true })
                .eq('marked_by', coach.user_id)
                .in('status', ['present', 'late']),
            ]),
          ),
        ),
      ])
    : [{ data: [] }, { data: [] }, []] as const

  const teamNamesByProfile = new Map<string, string[]>()
  for (const tm of (membershipsRes.data ?? []) as any[]) {
    const t = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams
    if (!t?.name) continue
    const list = teamNamesByProfile.get(tm.profile_id) ?? []
    list.push(t.name)
    teamNamesByProfile.set(tm.profile_id, list)
  }

  const eventsByUser = new Map<string, number>()
  for (const e of (eventsRes.data ?? []) as { created_by: string | null }[]) {
    if (e.created_by) eventsByUser.set(e.created_by, (eventsByUser.get(e.created_by) ?? 0) + 1)
  }

  const coaches: Coach[] = coachRows.map((coach, i) => {
    const [totalRes, presentRes] = attendanceCounts[i] ?? [{ count: 0 }, { count: 0 }]
    const totalMarked = totalRes.count ?? 0
    const presentMarked = presentRes.count ?? 0
    const attendanceRate = totalMarked > 0 ? Math.round((presentMarked / totalMarked) * 100) : 0

    return {
      profile_id: coach.id,
      staff_title: coach.staff_title ?? DEFAULT_STAFF_TITLE,
      user_id: coach.user_id,
      display_name: coach.display_name,
      teams: teamNamesByProfile.get(coach.id) ?? [],
      eventsCount: eventsByUser.get(coach.user_id) ?? 0,
      attendanceRate,
    }
  })

  const invites = (invitesRaw ?? []) as unknown as Invite[]

  const baseUrl = appUrl()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Coaching staff</h1>
          <p className="text-gray text-sm mt-1">
            You are the head coach. Every coach gets the same staff access; only you manage the team.
          </p>
        </div>
        <InviteCoachForm teams={teams ?? []} />
      </div>

      {/* Head coach */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4">Head Coach</h2>
        {/* Same two-column grid as the staff cards below so the edges line up. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-dark-secondary rounded-2xl p-5 border border-green/20 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-green flex items-center justify-center shrink-0">
            <span className="text-dark font-bold">
              {(profile?.display_name ?? 'H').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{profile?.display_name ?? 'You'}</p>
            <p className="text-gray text-xs">Head Coach · full control</p>
          </div>
        </div>
        </div>
      </section>

      {/* Staff */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4">Staff</h2>
        {!coaches || coaches.length === 0 ? (
          <div className="bg-dark-secondary rounded-2xl p-8 text-center border border-white/5">
            <p className="text-gray">No staff yet. Invite your assistant or goalkeeping coach above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {coaches.map(coach => (
              <div
                key={coach.user_id}
                className="bg-dark-secondary rounded-2xl p-5 border border-white/5 hover:border-green/20 transition-colors"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-11 h-11 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                    <span className="text-green font-bold">
                      {(coach.display_name ?? 'C').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{coach.display_name ?? 'Unknown'}</p>
                    <TitleSelect profileId={coach.profile_id} title={coach.staff_title} />
                  </div>
                </div>

                {/* Teams */}
                {coach.teams.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {coach.teams.map(team => (
                      <span key={team} className="text-xs bg-green/10 text-green px-2 py-0.5 rounded-full">
                        {team}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray/50 mb-4">No teams assigned</p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                  <div>
                    <p className="text-lg font-bold text-white">{coach.eventsCount}</p>
                    <p className="text-[10px] text-gray uppercase tracking-wider">Events (30d)</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${coach.attendanceRate >= 80 ? 'text-green' : coach.attendanceRate >= 60 ? 'text-yellow-400' : 'text-white'}`}>
                      {coach.attendanceRate > 0 ? `${coach.attendanceRate}%` : 'n/a'}
                    </p>
                    <p className="text-[10px] text-gray uppercase tracking-wider">Attendance</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invites */}
      <section>
        <h2 className="text-lg font-bold mb-4">Pending invites</h2>
        {invites.length === 0 ? (
          <div className="bg-dark-secondary rounded-2xl p-8 text-center border border-white/5">
            <p className="text-gray">No pending invites.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invites.map(invite => (
              <div
                key={invite.id}
                className="bg-dark-secondary rounded-2xl p-5 border border-white/5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-semibold">{invite.email}</p>
                    <p className="text-gray text-xs mt-0.5">{invite.staff_title ?? DEFAULT_STAFF_TITLE}</p>
                    {invite.teams && (
                      <p className="text-gray text-xs mt-0.5">Team: {invite.teams.name}</p>
                    )}
                    {invite.expires_at && (
                      <p className="text-gray text-xs mt-0.5">
                        Expires: {formatMonthDayYear(invite.expires_at, timezone)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded-full">
                      Pending
                    </span>
                    <RevokeButton inviteId={invite.id} />
                  </div>
                </div>
                <CopyLink url={`${baseUrl}/join/${invite.token}`} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
