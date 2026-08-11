'use client'

import { useState, useTransition } from 'react'
import { acceptInvite } from './actions'

export default function AcceptButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAccept() {
    setError(null)
    const formData = new FormData()
    formData.set('token', token)
    startTransition(async () => {
      // On success the action redirects and never returns. A returned value
      // always means failure — surface it, or the button just stops looking
      // busy and the user is left guessing. Now that migration 033 makes the
      // "already used or revoked" guard actually fire, this is a path real
      // users will hit.
      const res = await acceptInvite(formData)
      if (res && !res.ok) setError(res.error)
    })
  }

  return (
    <div>
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="w-full bg-green text-dark font-bold py-3 px-4 rounded-xl uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Joining…' : 'Accept & Join'}
      </button>

      {error && (
        <p role="alert" className="text-red text-sm mt-3 text-center">
          {error}
        </p>
      )}
    </div>
  )
}
