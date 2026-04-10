'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInviteCode } from './actions'
import MoreTeams from './more-teams'

export default function AcceptCodeButton({ code }: { code: string }) {
  const [isPending, startTransition] = useTransition()
  const [joinResult, setJoinResult] = useState<{ clubId: string; teamId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await acceptInviteCode(code)
        setJoinResult(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (joinResult) {
    return (
      <div>
        <div className="text-center mb-4">
          <span className="text-green font-bold text-lg">Joined!</span>
        </div>
        <MoreTeams clubId={joinResult.clubId} joinedTeamId={joinResult.teamId} />
        {/* Fallback if no more teams to show */}
        <button
          onClick={() => router.push('/dashboard?claim=1')}
          className="w-full mt-4 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div>
      {error && <p className="text-red text-sm mb-3">{error}</p>}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="block w-full text-center bg-green text-dark font-bold py-3 px-4 rounded-xl uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {isPending ? 'Joining...' : 'Join Team'}
      </button>
    </div>
  )
}
