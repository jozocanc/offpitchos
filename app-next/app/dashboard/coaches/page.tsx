import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InviteCoachForm from './invite-form'

export const metadata: Metadata = { title: 'Coaches' }
import CopyLink from '../teams/[id]/copy-link'
import RevokeButton from './revoke-button'

interface Coach {
  user_id: string
  display_name: string | null
}

interface Invite {
  id: string
  email: string | null
  token: string
  expires_at: string | null
  team_id: string | null
  teams: { name: string } | null
}

export default async function CoachesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  const clubId = profile?.club_id ?? ''

  // Fetch current coaches
  const { data: coaches } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .eq('club_id', clubId)
    .eq('role', 'coach') as { data: Coach[] | null }

  // Fetch pending coach invites
  const { data: invitesRaw } = await supabase
    .from('invites')
    .select('id, email, token, expires_at, team_id, teams(name)')
    .eq('club_id', clubId)
    .eq('role', 'coach')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const invites = (invitesRaw ?? []) as unknown as Invite[]

  // Fetch teams for the invite form
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', clubId)
    .order('age_group', { ascending: true })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Coaches</h1>
          <p className="text-gray text-sm mt-1">
            Manage your coaching staff
          </p>
        </div>
        <InviteCoachForm teams={teams ?? []} />
      </div>

      {/* Active coaches */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4">Active Coaches</h2>
        {!coaches || coaches.length === 0 ? (
          <div className="bg-dark-secondary rounded-2xl p-8 text-center border border-white/5">
            <p className="text-gray">No coaches yet. Invite your first coach above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {coaches.map(coach => (
              <div
                key={coach.user_id}
                className="bg-dark-secondary rounded-2xl p-5 border border-white/5 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                  <span className="text-green font-bold text-sm">
                    {(coach.display_name ?? 'C').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold">{coach.display_name ?? 'Unknown'}</p>
                  <p className="text-gray text-xs">Coach</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invites */}
      <section>
        <h2 className="text-lg font-bold mb-4">Pending Invites</h2>
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
                    {invite.teams && (
                      <p className="text-gray text-xs mt-0.5">Team: {invite.teams.name}</p>
                    )}
                    {invite.expires_at && (
                      <p className="text-gray text-xs mt-0.5">
                        Expires: {new Date(invite.expires_at).toLocaleDateString()}
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
