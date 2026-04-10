import { createClient } from '@/lib/supabase/server'
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

interface ParentInvite {
  id: string
  token: string
  expires_at: string | null
  created_at: string
}

// Per-player roster signal, computed on the server so the list can show
// at-risk badges without the client having to refetch anything.
interface PlayerSignals {
  unlinked: boolean       // parent_id does not point to a parent team_member
  missingSizes: boolean   // jersey_size or shorts_size is null
  attendanceRate: number | null  // last 30 days; null when we have no data
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  const clubId = profile?.club_id ?? ''

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('id', id)
    .eq('club_id', clubId)
    .single()

  if (!team) notFound()

  // Fetch team members joined with profiles. team_members has profile_id
  // (not user_id), but we need the profile's user_id to match against
  // players.parent_id for the "linked" check.
  const { data: membersRaw } = await supabase
    .from('team_members')
    .select('profile_id, role, profiles(display_name, user_id)')
    .eq('team_id', id)

  const members = (membersRaw ?? []).map(m => ({
    ...m,
    user_id: (m.profiles as any)?.user_id ?? '',
  })) as unknown as Member[]

  // Fetch active parent invite links
  const { data: parentInvites } = await supabase
    .from('invites')
    .select('id, token, expires_at, created_at')
    .eq('team_id', id)
    .eq('role', 'parent')
    .eq('status', 'pending')
    .order('created_at', { ascending: false }) as { data: ParentInvite[] | null }

  // Fetch players on this team (including size fields so we can flag gear gaps inline).
  const { data: playersRaw } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, position, parent_id, jersey_size, shorts_size')
    .eq('team_id', id)
    .order('last_name', { ascending: true })

  const players = (playersRaw ?? []) as Player[]

  // Attendance: pull last-30-day scheduled events for this team, then pull the
  // attendance rows keyed by (event_id, player_id). We aggregate per player on
  // the server to avoid shipping raw rows to the client.
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = now.toISOString()

  const { data: recentEvents } = await supabase
    .from('events')
    .select('id')
    .eq('team_id', id)
    .eq('status', 'scheduled')
    .gte('start_time', thirtyDaysAgo)
    .lte('start_time', nowIso)

  const recentEventIds = (recentEvents ?? []).map(e => e.id)

  const perPlayerTotals: Record<string, { total: number; present: number }> = {}
  if (recentEventIds.length > 0) {
    const { data: attRows } = await supabase
      .from('attendance')
      .select('player_id, status')
      .in('event_id', recentEventIds)

    for (const row of attRows ?? []) {
      const t = perPlayerTotals[row.player_id] ?? { total: 0, present: 0 }
      t.total += 1
      if (row.status === 'present' || row.status === 'late') t.present += 1
      perPlayerTotals[row.player_id] = t
    }
  }

  // "Linked" parent user_ids = team_members with role='parent'. A player is
  // "unlinked" if its parent_id doesn't belong to that set (typically because
  // the DOC added the kid and no real parent has been associated yet).
  const linkedParentIds = new Set(members.filter(m => m.role === 'parent').map(m => m.user_id))

  const signals: Record<string, PlayerSignals> = {}
  let unlinkedCount = 0
  let missingSizeCount = 0
  let lowAttendanceCount = 0
  for (const p of players) {
    const t = perPlayerTotals[p.id]
    const rate = t && t.total > 0 ? Math.round((t.present / t.total) * 100) : null
    const unlinked = !linkedParentIds.has(p.parent_id)
    const missingSizes = !p.jersey_size || !p.shorts_size
    signals[p.id] = { unlinked, missingSizes, attendanceRate: rate }
    if (unlinked) unlinkedCount += 1
    if (missingSizes) missingSizeCount += 1
    if (rate !== null && rate < 60) lowAttendanceCount += 1
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const isDOC = profile?.role === 'doc'
  const isParent = profile?.role === 'parent'
  const coaches = members.filter(m => m.role === 'coach')
  const parents = members.filter(m => m.role === 'parent')

  // Build options for the "link parent" menu on unlinked players.
  const parentOptions = parents.map(p => ({
    userId: p.user_id,
    displayName: p.profiles?.display_name ?? 'Unknown parent',
  }))

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard/teams" className="text-gray text-sm hover:text-white transition-colors mb-4 inline-block">
          ← Back to Teams
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-black tracking-tight">{team.name}</h1>
          <span className="text-sm font-bold bg-green/10 text-green px-3 py-1 rounded-full">
            {team.age_group}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1">
          <p className="text-gray text-sm">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
          {isDOC && <TeamActions teamId={team.id} name={team.name} ageGroup={team.age_group} />}
        </div>
      </div>

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
                      <p className="text-gray text-xs">Coach</p>
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

            {/* Health summary — DOC only, parents don't need to see admin stats about other families' kids. */}
            {isDOC && players.length > 0 && (unlinkedCount > 0 || missingSizeCount > 0 || lowAttendanceCount > 0) && (
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                {unlinkedCount > 0 && (
                  <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-2 py-1 rounded-full font-bold">
                    {unlinkedCount} unlinked
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
                              Unlinked
                            </span>
                          )}
                          {isDOC && sig?.missingSizes && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-white/10 text-gray px-1.5 py-0.5 rounded">
                              No sizes
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
                          parentOptions={parentOptions}
                        />
                      )}
                      {canRemove && <RemovePlayerButton playerId={p.id} teamId={team.id} />}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Parents */}
          <section>
            <h2 className="text-lg font-bold mb-3">Parents</h2>
            {parents.length === 0 ? (
              <div className="bg-dark-secondary rounded-2xl p-6 text-center border border-white/5">
                <p className="text-gray text-sm">No parents joined yet. Share an invite link!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {parents.map(m => (
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
                      <p className="text-gray text-xs">Parent</p>
                    </div>
                    {isDOC && <RemoveMemberButton teamId={team.id} userId={m.user_id} />}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: Invite links — DOC only since coaches and parents
            shouldn't be generating/revoking join links. */}
        {isDOC && <div>
          <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Share Invite Link</h2>
              <GenerateInviteButton teamId={team.id} />
            </div>
            <p className="text-gray text-sm mb-5">
              Generate a link for parents to join this team. Anyone with the link can join as a parent.
            </p>

            {!parentInvites || parentInvites.length === 0 ? (
              <div className="bg-dark rounded-xl p-4 text-center border border-white/5">
                <p className="text-gray text-sm">No active invite links. Click &quot;Generate Invite Link&quot; to create one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {parentInvites.map(invite => (
                  <div key={invite.id} className="space-y-2">
                    <CopyLink url={`${baseUrl}/join/${invite.token}`} />
                    <div className="flex items-center justify-between pl-1">
                      {invite.expires_at && (
                        <p className="text-gray text-xs">
                          Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </p>
                      )}
                      <RevokeInviteButton inviteId={invite.id} teamId={team.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>}
      </div>
    </div>
  )
}
