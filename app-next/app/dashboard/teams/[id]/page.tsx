import { createClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/app-url'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import GenerateInviteButton from './generate-invite-button'
import CopyLink from './copy-link'
import TeamActions from './team-actions'
import RemoveMemberButton from './remove-member-button'
import RevokeInviteButton from './revoke-invite-button'
import AddPlayerForm from './add-player-form'
import RemovePlayerButton from './remove-player-button'
import LinkParentMenu from './link-parent-menu'
import GroupChatLink from './group-chat-link'
import InviteCodeCard from './invite-code-card'
import CreateCodeButton from './create-code-button'
import PublicShareCard from './public-share-card'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { formatMonthDayYear } from '@/lib/format-datetime'
import { ageGroupLabel } from '@/lib/team-label'
import { isMember, roleLabel } from '@/lib/constants'
import { getEffectiveRole } from '@/lib/admin-role'
import { getAuthUserId, getCurrentProfile } from '@/lib/current-profile'

interface Member {
  profile_id: string
  user_id: string
  role: string
  profiles: {
    display_name: string | null
    user_id: string | null
  } | null
}

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
  parent_id: string
  jersey_size: string | null
  shorts_size: string | null
}

interface TeamInvite {
  id: string
  token: string
  expires_at: string | null
  created_at: string
}

// Per-player roster signal, computed on the server so the list can show
// at-risk badges without the client having to refetch anything.
interface PlayerSignals {
  unlinked: boolean       // parent_id is not a player account on this team (profile not claimed)
  missingSizes: boolean   // jersey_size or shorts_size is null
  attendanceRate: number | null  // last 30 days; null when we have no data
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Request-memoized claims + profile (lib/current-profile): one local JWT
  // check and one profile query, shared with getClubTimezone().
  if (!(await getAuthUserId())) redirect('/login')
  const profile = await getCurrentProfile()

  const supabase = await createClient()
  const clubId = profile?.club_id ?? ''
  const isStaffViewer = profile?.role === 'doc' || profile?.role === 'coach'

  // Attendance window: last-30-day scheduled events for this team. The rows
  // are aggregated per player on the server to avoid shipping them to the
  // client.
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = now.toISOString()

  // Everything below only needs the team id and the viewer's profile, so it
  // fires in one parallel wave instead of eight sequential round-trips. The
  // team-not-found check still runs before anything is rendered.
  const [
    timezone,
    { data: team },
    { data: membersRaw },
    { data: playerInvites },
    { data: playersRaw },
    rosterRes,
    { data: attRows },
    { data: statRows },
  ] = await Promise.all([
    getClubTimezone(),
    supabase
      .from('teams')
      .select('id, name, age_group, group_chat_link, invite_code, public_enabled, public_share_token')
      .eq('id', id)
      .eq('club_id', clubId)
      .single(),
    // Team members joined with profiles. team_members has profile_id (not
    // user_id), but we need the profile's user_id to match against
    // players.parent_id for the "linked" check.
    supabase
      .from('team_members')
      .select('profile_id, role, profiles(display_name, user_id, staff_title)')
      .eq('team_id', id),
    // Active player invite links. Legacy 'parent' invites are included so
    // any still-pending ones stay visible and revocable.
    supabase
      .from('invites')
      .select('id, token, expires_at, created_at')
      .eq('team_id', id)
      .in('role', ['player', 'parent'])
      .eq('status', 'pending')
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: TeamInvite[] | null }>,
    // Players on this team (including size fields so we can flag gear gaps inline).
    supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, position, parent_id, jersey_size, shorts_size')
      .eq('team_id', id)
      .order('jersey_number', { ascending: true, nullsFirst: false })
      .order('last_name', { ascending: true }),
    // A player's RLS only returns their own row (migration 053). Show them the
    // squad through get_team_roster: name, number and position, nothing private.
    !isStaffViewer
      ? supabase.rpc('get_team_roster', { p_team_id: id })
      : Promise.resolve({ data: null }),
    // Attendance rows for those events, filtered through the event join in a
    // single query (same rows as listing the event ids first).
    supabase
      .from('attendance')
      .select('player_id, status, events!inner(team_id, status, start_time)')
      .eq('events.team_id', id)
      .eq('events.status', 'scheduled')
      .gte('events.start_time', thirtyDaysAgo)
      .lte('events.start_time', nowIso),
    // Confirmed game stats (057) for the small season G/A/min line. Staff only.
    isStaffViewer
      ? supabase
          .from('player_game_stats')
          .select('player_id, goals, assists, minutes')
          .eq('team_id', id)
      : Promise.resolve({ data: null }),
  ])

  if (!team) notFound()

  const members = (membersRaw ?? []).map(m => ({
    ...m,
    user_id: (m.profiles as any)?.user_id ?? '',
  })) as unknown as Member[]

  let players = (playersRaw ?? []) as Player[]

  if (!isStaffViewer) {
    const roster = rosterRes.data as Pick<Player, 'id' | 'first_name' | 'last_name' | 'jersey_number' | 'position'>[] | null
    if (roster && roster.length > 0) {
      const own = new Map(players.map(p => [p.id, p]))
      players = roster.map(r => own.get(r.id) ?? {
        ...r,
        parent_id: '',
        jersey_size: null,
        shorts_size: null,
      })
    }
  }

  const seasonStats: Record<string, { goals: number; assists: number; minutes: number }> = {}
  for (const r of (statRows ?? []) as { player_id: string; goals: number; assists: number; minutes: number | null }[]) {
    const t = seasonStats[r.player_id] ?? { goals: 0, assists: 0, minutes: 0 }
    t.goals += r.goals ?? 0
    t.assists += r.assists ?? 0
    t.minutes += r.minutes ?? 0
    seasonStats[r.player_id] = t
  }

  const perPlayerTotals: Record<string, { total: number; present: number }> = {}
  for (const row of attRows ?? []) {
    const t = perPlayerTotals[row.player_id] ?? { total: 0, present: 0 }
    t.total += 1
    if (row.status === 'present' || row.status === 'late') t.present += 1
    perPlayerTotals[row.player_id] = t
  }

  // players.parent_id is the account linked to the roster row (the player's
  // own login). A player is "unclaimed" if that id isn't a member account on
  // this team, typically because the DOC added the row and the player hasn't
  // accepted an invite yet. isMember() also accepts legacy 'parent' rows.
  const linkedAccountIds = new Set(members.filter(m => isMember(m.role)).map(m => m.user_id))

  const signals: Record<string, PlayerSignals> = {}
  let unlinkedCount = 0
  let missingSizeCount = 0
  let lowAttendanceCount = 0
  for (const p of players) {
    const t = perPlayerTotals[p.id]
    const rate = t && t.total > 0 ? Math.round((t.present / t.total) * 100) : null
    const unlinked = !linkedAccountIds.has(p.parent_id)
    const missingSizes = !p.jersey_size || !p.shorts_size
    signals[p.id] = { unlinked, missingSizes, attendanceRate: rate }
    if (unlinked) unlinkedCount += 1
    if (missingSizes) missingSizeCount += 1
    if (rate !== null && rate < 60) lowAttendanceCount += 1
  }

  const baseUrl = appUrl()

  // Respect "View as → Player" so the head coach sees the player's team page,
  // not the admin controls, when previewing.
  const viewRole = profile?.role ? await getEffectiveRole(profile.role) : profile?.role
  const isDOC = viewRole === 'doc'
  const isSquadMember = isMember(viewRole)
  const coaches = members.filter(m => m.role === 'coach')
  const playerAccounts = members.filter(m => isMember(m.role))

  // Options for the claim menu on unclaimed players: joined player accounts
  // that aren't already linked to a roster row on this team.
  const claimedIds = new Set(players.map(p => p.parent_id))
  const accountOptions = playerAccounts
    .filter(m => !claimedIds.has(m.user_id))
    .map(m => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Unknown player',
    }))

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        {/* ?all=1: the list redirects straight back here when the program has
            a single team, so the link must opt out of that. */}
        <Link href="/dashboard/teams?all=1" className="text-gray text-sm hover:text-white transition-colors mb-4 inline-block">
          ← All teams
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-black tracking-tight">{team.name}</h1>
          {ageGroupLabel(team.age_group) && (
            <span className="text-sm font-bold bg-green/10 text-green px-3 py-1 rounded-full">
              {ageGroupLabel(team.age_group)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1">
          <p className="text-gray text-sm">
            {`${players.length} player${players.length !== 1 ? 's' : ''} · ${coaches.length} coach${coaches.length !== 1 ? 'es' : ''}`}
          </p>
          {isDOC && <TeamActions teamId={team.id} name={team.name} ageGroup={team.age_group} />}
        </div>
      </div>

      {/* Invite code: DOC shares this code or link with players */}
      {isDOC && (team as any).invite_code && (
        <InviteCodeCard code={(team as any).invite_code} />
      )}
      {isDOC && !(team as any).invite_code && <CreateCodeButton teamId={team.id} />}

      {/* Group chat link: prominent for players, compact for DOC */}
      {(isSquadMember || isDOC) && (
        <div className="mb-6">
          <GroupChatLink
            teamId={team.id}
            teamName={team.name}
            currentLink={(team as any).group_chat_link ?? null}
            isDOC={isDOC}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Members */}
        <div className="space-y-6">
          {/* Coaches */}
          <section>
            <h2 className="text-lg font-bold mb-3">Coaches</h2>
            {coaches.length === 0 ? (
              <div className="bg-dark-secondary rounded-2xl p-6 text-center border border-white/5">
                <p className="text-gray text-sm">No coaches assigned yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {coaches.map(m => (
                  <div
                    key={m.user_id}
                    className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                      <span className="text-green font-bold text-xs">
                        {(m.profiles?.display_name ?? 'C').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{m.profiles?.display_name ?? 'Unknown'}</p>
                      <p className="text-gray text-xs">{roleLabel('coach', (m.profiles as { staff_title?: string | null } | null)?.staff_title)}</p>
                    </div>
                    {isDOC && <RemoveMemberButton teamId={team.id} userId={m.user_id} />}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Players */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">
                Players
                <span className="text-gray font-normal text-sm ml-2">· {players.length}</span>
              </h2>
              {isDOC && <AddPlayerForm teamId={team.id} />}
            </div>

            {/* Health summary: DOC only, players don't need admin stats about teammates. */}
            {isDOC && players.length > 0 && (unlinkedCount > 0 || missingSizeCount > 0 || lowAttendanceCount > 0) && (
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                {unlinkedCount > 0 && (
                  <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-2 py-1 rounded-full font-bold">
                    {unlinkedCount} not claimed
                  </span>
                )}
                {missingSizeCount > 0 && (
                  <span className="bg-white/5 text-gray border border-white/10 px-2 py-1 rounded-full font-bold">
                    {missingSizeCount} missing sizes
                  </span>
                )}
                {lowAttendanceCount > 0 && (
                  <span className="bg-red-400/10 text-red-400 border border-red-400/20 px-2 py-1 rounded-full font-bold">
                    {lowAttendanceCount} low attendance
                  </span>
                )}
              </div>
            )}

            {players.length === 0 ? (
              <div className="bg-dark-secondary rounded-2xl p-6 text-center border border-white/5">
                <p className="text-gray text-sm">No players registered yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {players.map(p => {
                  const sig = signals[p.id]
                  const canRemove = isDOC
                  return (
                    <div
                      key={p.id}
                      className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3 hover:border-green/20 transition-colors group"
                    >
                      {p.jersey_number !== null ? (
                        <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                          <span className="text-green font-bold text-xs">{p.jersey_number}</span>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                          <span className="text-gray font-bold text-xs">{p.first_name.charAt(0)}</span>
                        </div>
                      )}
                      <Link
                        href={`/dashboard/players/${p.id}`}
                        className="flex-1 min-w-0"
                      >
                        <p className="font-medium text-sm group-hover:text-green transition-colors truncate">
                          {p.first_name} {p.last_name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                          {p.position && <p className="text-gray text-xs">{p.position}</p>}
                          {isDOC && sig?.unlinked && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-yellow-400/10 text-yellow-400 px-1.5 py-0.5 rounded">
                              Not claimed
                            </span>
                          )}
                          {isDOC && sig?.missingSizes && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-white/10 text-gray px-1.5 py-0.5 rounded">
                              No sizes
                            </span>
                          )}
                          {isStaffViewer && !isSquadMember && seasonStats[p.id] && (
                            <span
                              title="Season goals, assists and minutes"
                              className="text-[10px] font-semibold text-gray tabular-nums"
                            >
                              {`${seasonStats[p.id].goals}G ${seasonStats[p.id].assists}A · ${seasonStats[p.id].minutes} min`}
                            </span>
                          )}
                          {sig?.attendanceRate !== null && sig?.attendanceRate !== undefined && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                sig.attendanceRate < 60
                                  ? 'bg-red-400/10 text-red-400'
                                  : sig.attendanceRate < 80
                                  ? 'bg-yellow-400/10 text-yellow-400'
                                  : 'bg-green/10 text-green'
                              }`}
                            >
                              {sig.attendanceRate}%
                            </span>
                          )}
                        </div>
                      </Link>
                      {isDOC && sig?.unlinked && (
                        <LinkParentMenu
                          playerId={p.id}
                          teamId={team.id}
                          playerName={`${p.first_name} ${p.last_name}`}
                          parentOptions={accountOptions}
                        />
                      )}
                      {canRemove && <RemovePlayerButton playerId={p.id} teamId={team.id} />}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Player accounts: players who have joined the app */}
          <section>
            <h2 className="text-lg font-bold mb-3">Player accounts</h2>
            {playerAccounts.length === 0 ? (
              <div className="bg-dark-secondary rounded-2xl p-6 text-center border border-white/5">
                <p className="text-gray text-sm">No players have joined the app yet. Share an invite link!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {playerAccounts.map(m => (
                  <div
                    key={m.user_id}
                    className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray/20 flex items-center justify-center shrink-0">
                      <span className="text-gray font-bold text-xs">
                        {(m.profiles?.display_name ?? 'P').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{m.profiles?.display_name ?? 'Unknown'}</p>
                      <p className="text-gray text-xs">Player</p>
                    </div>
                    {isDOC && <RemoveMemberButton teamId={team.id} userId={m.user_id} />}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: Invite links + public share. DOC only since
            coaches and players shouldn't be generating/revoking join
            links or publishing the team. */}
        {isDOC && <div>
          <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Share invite link</h2>
              <GenerateInviteButton teamId={team.id} />
            </div>
            <p className="text-gray text-sm mb-5">
              Generate a link for your players to join this team. Anyone with the link can join as a player.
            </p>

            {!playerInvites || playerInvites.length === 0 ? (
              <div className="bg-dark rounded-xl p-4 text-center border border-white/5">
                <p className="text-gray text-sm">No active invite links. Click &quot;Generate invite link&quot; to create one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {playerInvites.map(invite => (
                  <div key={invite.id} className="space-y-2">
                    <CopyLink url={`${baseUrl}/join/${invite.token}`} />
                    <div className="flex items-center justify-between pl-1">
                      {invite.expires_at && (
                        <p className="text-gray text-xs">
                          Expires {formatMonthDayYear(invite.expires_at, timezone)}
                        </p>
                      )}
                      <RevokeInviteButton inviteId={invite.id} teamId={team.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <PublicShareCard
            teamId={team.id}
            initialEnabled={(team as any).public_enabled ?? false}
            initialToken={(team as any).public_share_token ?? null}
            baseUrl={baseUrl}
          />
        </div>}
      </div>
    </div>
  )
}
