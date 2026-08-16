'use client'

import { useTransition } from 'react'
import { generateParentInvite } from './actions'
import { useToast } from '@/components/toast'

export default function GenerateInviteButton({ teamId }: { teamId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleClick() {
    const formData = new FormData()
    formData.set('teamId', teamId)
    startTransition(async () => {
      const r = await generateParentInvite(formData)
      if (!r.ok) toast(r.error, 'error')
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isPending ? 'Generating…' : 'Generate Invite Link'}
    </button>
  )
}
