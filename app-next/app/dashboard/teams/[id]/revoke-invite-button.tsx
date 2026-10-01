'use client'

import { useTransition } from 'react'
import { revokeParentInvite } from './actions'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'

export default function RevokeInviteButton({ inviteId, teamId }: { inviteId: string; teamId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()

  async function handleRevoke() {
    if (!(await confirm({
      title: 'Revoke this invite link?',
      message: 'It will stop working immediately.',
      confirmLabel: 'Revoke',
      destructive: true,
    }))) return
    startTransition(async () => {
      const r = await revokeParentInvite(inviteId, teamId)
      if (!r.ok) toast(r.error, 'error')
    })
  }

  return (
    <>
    <button
      onClick={handleRevoke}
      disabled={isPending}
      className="text-xs text-red hover:opacity-80 transition-opacity disabled:opacity-50"
    >
      {isPending ? 'Revoking...' : 'Revoke'}
    </button>
    {dialog}
    </>
  )
}
