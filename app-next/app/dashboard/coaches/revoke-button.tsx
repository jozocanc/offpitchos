'use client'

import { useTransition } from 'react'
import { revokeInvite } from './actions'
import { useToast } from '@/components/toast'

export default function RevokeButton({ inviteId }: { inviteId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleRevoke() {
    if (!confirm('Revoke this invite? The link will stop working.')) return
    // The result used to be discarded, so a failed revoke looked identical to
    // a successful one — the invite simply stayed live.
    startTransition(async () => {
      const res = await revokeInvite(inviteId)
      if (!res.ok) toast(res.error, 'error')
    })
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
