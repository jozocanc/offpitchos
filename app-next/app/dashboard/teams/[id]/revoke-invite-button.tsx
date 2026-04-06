'use client'

import { useTransition } from 'react'
import { revokeParentInvite } from './actions'

export default function RevokeInviteButton({ inviteId, teamId }: { inviteId: string; teamId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleRevoke() {
    if (!confirm('Revoke this invite link? It will stop working immediately.')) return
    startTransition(() => revokeParentInvite(inviteId, teamId))
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={isPending}
      className="text-xs text-red hover:opacity-80 transition-opacity disabled:opacity-50"
    >
      {isPending ? 'Revoking...' : 'Revoke'}
    </button>
  )
}
