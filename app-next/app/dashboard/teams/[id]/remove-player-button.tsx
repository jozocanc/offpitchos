'use client'

import { useTransition } from 'react'
import { removePlayer } from './player-actions'

export default function RemovePlayerButton({ playerId, teamId }: { playerId: string; teamId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    if (!confirm('Remove this player from the team?')) return
    startTransition(() => removePlayer(playerId, teamId))
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
