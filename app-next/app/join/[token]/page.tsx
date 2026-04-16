import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AcceptButton from './accept-button'
import Wordmark from '@/components/wordmark'

interface InviteData {
  id: string
  club_id: string
  team_id: string | null
  role: string
  status: string
  expires_at: string | null
  clubs: { name: string } | null
  teams: { name: string; age_group: string } | null
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const supabase = await createClient()

  // Look up invite via secure RPC
  const { data: inviteRaw } = await supabase
    .rpc('get_invite_by_token', { invite_token: token })
    .single()

  const invite = inviteRaw as InviteData | null

  // Check for invalid / expired / revoked states
  const isExpired = invite?.expires_at
    ? new Date(invite.expires_at) < new Date()
    : false

  const isInvalid =
    !invite ||
    invite.status === 'revoked' ||
    invite.status === 'accepted' ||
    invite.status === 'expired' ||
    isExpired

  // Check if the user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  if (isInvalid) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-dark px-4">
        <div className="w-full max-w-md text-center">
          <Wordmark size="xl" className="mb-2" />
          <div className="bg-dark-secondary rounded-2xl p-8 mt-8 border border-red/20">
            <p className="text-red text-lg font-bold mb-2">Invite Not Valid</p>
            <p className="text-gray text-sm">
              {!invite
                ? 'This invite link does not exist.'
                : invite.status === 'accepted'
                ? 'This invite has already been used.'
                : invite.status === 'revoked'
                ? 'This invite has been revoked.'
                : 'This invite has expired.'}
            </p>
            <p className="text-gray text-sm mt-4">
              Please ask your club administrator for a new invite link.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const roleName = invite.role === 'coach' ? 'Coach' : 'Parent'

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Wordmark size="xl" className="mb-2" />
          <p className="text-gray">You&apos;ve been invited</p>
        </div>

        <div className="bg-dark-secondary rounded-2xl p-8 border border-white/10 shadow-2xl">
          {/* Invite details */}
          <div className="mb-6 space-y-3">
            {invite.clubs && (
              <div className="flex items-center justify-between">
                <span className="text-gray text-sm">Club</span>
                <span className="font-semibold">{invite.clubs.name}</span>
              </div>
            )}
            {invite.teams && (
              <div className="flex items-center justify-between">
                <span className="text-gray text-sm">Team</span>
                <span className="font-semibold">
                  {invite.teams.name}
                  <span className="text-gray text-xs ml-1">({invite.teams.age_group})</span>
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray text-sm">Role</span>
              <span className="font-semibold text-green">{roleName}</span>
            </div>
            {invite.expires_at && (
              <div className="flex items-center justify-between">
                <span className="text-gray text-sm">Expires</span>
                <span className="text-gray text-sm">
                  {new Date(invite.expires_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 pt-6">
            {user ? (
              <div className="space-y-3">
                <p className="text-gray text-sm text-center mb-4">
                  Signed in as <span className="text-white">{user.email}</span>
                </p>
                <AcceptButton token={token} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray text-sm text-center mb-4">
                  Sign in or create an account to accept this invite.
                </p>
                <Link
                  href={`/signup?invite=${token}`}
                  className="block w-full text-center bg-green text-dark font-bold py-3 px-4 rounded-xl uppercase tracking-wider hover:opacity-90 transition-opacity"
                >
                  Sign Up to Join
                </Link>
                <Link
                  href={`/login?invite=${token}`}
                  className="block w-full text-center bg-dark border border-white/10 text-gray font-medium py-3 px-4 rounded-xl hover:text-white transition-colors"
                >
                  I already have an account
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
