'use client'

import { useTransition } from 'react'
import { acceptCoverage, declineCoverage } from '../coverage/actions'
import { useToast } from '@/components/toast'

interface CoverageActionsInlineProps {
  requestId: string
}

export default function CoverageActionsInline({ requestId }: CoverageActionsInlineProps) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleAccept() {
    startTransition(async () => {
      const r = await acceptCoverage(requestId)
      if (!r.ok) toast(r.error, 'error')
    })
  }

  function handleDecline() {
    startTransition(async () => {
      const r = await declineCoverage(requestId)
      if (!r.ok) toast(r.error, 'error')
    })
  }

  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="bg-green text-dark font-bold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity text-xs disabled:opacity-60"
      >
        {isPending ? '…' : 'Accept'}
      </button>
      <button
        onClick={handleDecline}
        disabled={isPending}
        className="bg-dark border border-white/10 text-gray font-medium px-3 py-1.5 rounded-lg hover:text-white transition-colors text-xs disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  )
}
