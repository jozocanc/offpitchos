'use client'

import { useTransition } from 'react'
import { revokeInvite } from './actions'

export default function RevokeButton({ inviteId }: { inviteId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleRevoke() {
    if (!confirm('Revoke this invite? The link will stop working.')) return
    startTransition(() => revokeInvite(inviteId))
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={isPending}
      className="text-xs font-medium text-red hover:opacity-80 transition-opacity disabled:opacity-50"
    >
      {isPending ? 'Revoking...' : 'Revoke'}
    </button>
  )
}
