'use client'

import { useTransition } from 'react'
import { removePlayer } from './player-actions'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'

export default function RemovePlayerButton({ playerId, teamId }: { playerId: string; teamId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()

  async function handleRemove() {
    if (!(await confirm({
      title: 'Remove this player from the team?',
      confirmLabel: 'Remove',
      destructive: true,
    }))) return
    startTransition(async () => {
      const r = await removePlayer(playerId, teamId)
      if (!r.ok) toast(r.error, 'error')
    })
  }

  return (
    <>
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="text-xs text-red hover:opacity-80 transition-opacity disabled:opacity-50 py-2 -my-2"
    >
      {isPending ? '...' : 'Remove'}
    </button>
    {dialog}
    </>
  )
}
