import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import GenerateInviteButton from './generate-invite-button'
import CopyLink from './copy-link'
import TeamActions from './team-actions'
import RemoveMemberButton from './remove-member-button'

interface Member {
  user_id: string
  role: string
  profiles: {
    display_name: string | null
  } | null
}

interface ParentInvite {
  id: string
  token: string
  expires_at: string | null
  created_at: string
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

  // Fetch team members joined with profiles
  const { data: membersRaw } = await supabase
    .from('team_members')
    .select('user_id, role, profiles(display_name)')
    .eq('team_id', id)

  const members = (membersRaw ?? []) as unknown as Member[]

  // Fetch active parent invite links
  const { data: parentInvites } = await supabase
    .from('invites')
    .select('id, token, expires_at, created_at')
    .eq('team_id', id)
    .eq('role', 'parent')
    .eq('status', 'pending')
    .order('created_at', { ascending: false }) as { data: ParentInvite[] | null }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const isDOC = profile?.role === 'doc'
  const coaches = members.filter(m => m.role === 'coach')
  const parents = members.filter(m => m.role === 'parent')

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

        {/* Right column: Invite links */}
        <div>
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
                    {invite.expires_at && (
                      <p className="text-gray text-xs pl-1">
                        Expires {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
