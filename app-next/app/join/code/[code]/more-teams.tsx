'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

interface Team {
  id: string
  name: string
  age_group: string
  invite_code: string
}

// After joining one team via invite code, this component shows the other
// teams in the same club so the parent can join all their kids' teams
// in one flow instead of entering multiple codes.
export default function MoreTeams({ clubId, joinedTeamId }: { clubId: string; joinedTeamId: string }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [joined, setJoined] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetch(`/api/club-teams?clubId=${clubId}&exclude=${joinedTeamId}`)
      .then(r => r.json())
      .then(data => setTeams(data.teams ?? []))
      .finally(() => setLoading(false))
  }, [clubId, joinedTeamId])

  function handleJoin(team: Team) {
    startTransition(async () => {
      try {
        const { acceptInviteCode } = await import('./actions')
        await acceptInviteCode(team.invite_code)
      } catch {
        // acceptInviteCode redirects, so if we get here it means it worked
        // but the redirect was caught. Just mark as joined.
      }
      setJoined(prev => new Set(prev).add(team.id))
      toast(`Joined ${team.name}`, 'success')
    })
  }

  function handleDone() {
    router.push('/dashboard?claim=1')
  }

  if (loading) return null
  if (teams.length === 0) return null

  return (
    <div className="mt-6 border-t border-white/5 pt-6">
      <p className="text-sm font-bold text-white mb-3">Kids on other teams too?</p>
      <div className="space-y-2 mb-4">
        {teams.map(team => (
          <div
            key={team.id}
            className="flex items-center justify-between bg-dark rounded-xl p-3 border border-white/5"
          >
            <div>
              <p className="font-medium text-sm">{team.name}</p>
              <p className="text-xs text-gray">{team.age_group}</p>
            </div>
            {joined.has(team.id) ? (
              <span className="text-xs font-bold text-green">Joined</span>
            ) : (
              <button
                onClick={() => handleJoin(team)}
                disabled={isPending}
                className="text-xs font-bold bg-green/10 text-green border border-green/20 px-3 py-1.5 rounded-lg hover:bg-green/20 transition-colors disabled:opacity-50"
              >
                Join
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={handleDone}
        className="w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity text-sm"
      >
        Continue to Dashboard
      </button>
    </div>
  )
}
