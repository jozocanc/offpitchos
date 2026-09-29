'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTeamInviteCode } from './actions'
import { useToast } from '@/components/toast'

export default function CreateCodeButton({ teamId }: { teamId: string }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const router = useRouter()

  return (
    <div className="mb-4 bg-dark-secondary border border-dashed border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Team invite code</p>
        <p className="text-xs text-gray mt-0.5">One code for the whole squad. Players open the link, sign up and land on this team.</p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await createTeamInviteCode(teamId)
            if (!res.ok) { toast(res.error, 'error'); return }
            toast(`Team code ${res.data.code} is ready`, 'success')
            router.refresh()
          })
        }
        className="shrink-0 bg-green text-dark font-bold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {isPending ? 'Creating…' : 'Create code'}
      </button>
    </div>
  )
}
