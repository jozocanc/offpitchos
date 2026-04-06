'use client'

import { useTransition } from 'react'
import { removeMember } from './actions'

export default function RemoveMemberButton({ teamId, userId }: { teamId: string; userId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    if (!confirm('Remove this member from the team?')) return
    startTransition(() => removeMember(teamId, userId))
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="text-xs text-red hover:opacity-80 transition-opacity disabled:opacity-50"
    >
      {isPending ? 'Removing...' : 'Remove'}
    </button>
  )
}
