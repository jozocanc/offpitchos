'use client'

import { useTransition } from 'react'
import { acceptInviteCode } from './actions'

export default function AcceptCodeButton({ code }: { code: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await acceptInviteCode(code)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="block w-full text-center bg-green text-dark font-bold py-3 px-4 rounded-xl uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {isPending ? 'Joining...' : 'Join Team'}
    </button>
  )
}
