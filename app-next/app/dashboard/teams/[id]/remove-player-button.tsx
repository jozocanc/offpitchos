'use client'

import { useTransition } from 'react'
import { removePlayer } from './player-actions'
import { useToast } from '@/components/toast'

export default function RemovePlayerButton({ playerId, teamId }: { playerId: string; teamId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleRemove() {
    if (!confirm('Remove this player from the team?')) return
    startTransition(async () => {
      const r = await removePlayer(playerId, teamId)
      if (!r.ok) toast(r.error, 'error')
    })
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="text-xs text-red hover:opacity-80 transition-opacity disabled:opacity-50"
    >
      {isPending ? '...' : 'Remove'}
    </button>
  )
}
