'use client'

import { useTransition } from 'react'
import { removeMember } from './actions'
import { useToast } from '@/components/toast'

export default function RemoveMemberButton({ teamId, userId }: { teamId: string; userId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleRemove() {
    if (!confirm('Remove this member from the team?')) return
    // The result used to be discarded, so a blocked removal looked the same
    // as a successful one.
    startTransition(async () => {
      const r = await removeMember(teamId, userId)
      if (!r.ok) toast(r.error, 'error')
    })
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
