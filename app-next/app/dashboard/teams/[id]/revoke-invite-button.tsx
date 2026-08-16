'use client'

import { useTransition } from 'react'
import { revokeParentInvite } from './actions'
import { useToast } from '@/components/toast'

export default function RevokeInviteButton({ inviteId, teamId }: { inviteId: string; teamId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleRevoke() {
    if (!confirm('Revoke this invite link? It will stop working immediately.')) return
    startTransition(async () => {
      const r = await revokeParentInvite(inviteId, teamId)
      if (!r.ok) toast(r.error, 'error')
    })
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
