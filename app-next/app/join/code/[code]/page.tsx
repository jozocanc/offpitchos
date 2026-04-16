import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import AcceptCodeButton from './accept-button'

export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  let team: { teamId: string; teamName: string; ageGroup: string; clubId: string; clubName: string } | null = null
  let user: { id: string; email?: string | null } | null = null

  try {
    // Use service client to bypass RLS — the user might not be logged in yet.
    const service = createServiceClient()
    const { data: teamRaw } = await service
      .from('teams')
      .select('id, name, age_group, club_id, clubs(name)')
      .eq('invite_code', code.toUpperCase())
      .single()

    if (teamRaw) {
      const club = Array.isArray(teamRaw.clubs) ? teamRaw.clubs[0] : teamRaw.clubs
      team = {
        teamId: teamRaw.id,
        teamName: teamRaw.name,
        ageGroup: teamRaw.age_group,
        clubId: teamRaw.club_id,
        clubName: (club as { name?: string } | null)?.name ?? 'Club',
      }
    }
  } catch {
    // Service client query failed — team stays null, show invalid code page
  }

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Not signed in — user stays null
  }

  if (!team) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-dark px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
            OffPitch<span className="inline-block bg-green text-dark px-2 py-0.5 rounded-full text-[0.7em] font-black tracking-wide align-middle ml-1">OS</span>
          </h1>
          <div className="bg-dark-secondary rounded-2xl p-8 mt-8 border border-red/20">
            <p className="text-red text-lg font-bold mb-2">Invalid Code</p>
            <p className="text-gray text-sm">
              The invite code &quot;{code.toUpperCase()}&quot; doesn&apos;t match any team.
              Check with your coach or director for the correct code.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
            OffPitch<span className="inline-block bg-green text-dark px-2 py-0.5 rounded-full text-[0.7em] font-black tracking-wide align-middle ml-1">OS</span>
          </h1>
          <p className="text-gray">You&apos;ve been invited to join</p>
        </div>

        <div className="bg-dark-secondary rounded-2xl p-8 border border-white/10 shadow-2xl">
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray text-sm">Club</span>
              <span className="font-semibold">{team.clubName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray text-sm">Team</span>
              <span className="font-semibold">
                {team.teamName}
                <span className="text-gray text-xs ml-1">({team.ageGroup})</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray text-sm">Role</span>
              <span className="font-semibold text-green">Parent</span>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6">
            {user ? (
              <div className="space-y-3">
                <p className="text-gray text-sm text-center mb-4">
                  Signed in as <span className="text-white">{user.email}</span>
                </p>
                <AcceptCodeButton code={code.toUpperCase()} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray text-sm text-center mb-4">
                  Sign in or create an account to join this team.
                </p>
                <Link
                  href={`/signup?code=${code.toUpperCase()}`}
                  className="block w-full text-center bg-green text-dark font-bold py-3 px-4 rounded-xl uppercase tracking-wider hover:opacity-90 transition-opacity"
                >
                  Sign Up to Join
                </Link>
                <Link
                  href={`/login?code=${code.toUpperCase()}`}
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
