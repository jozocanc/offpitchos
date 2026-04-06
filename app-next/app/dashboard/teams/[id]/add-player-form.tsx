'use client'

import { useState, useTransition } from 'react'
import { addPlayer } from './player-actions'

export default function AddPlayerForm({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addPlayer(formData)
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-bold text-green hover:opacity-80 transition-opacity"
      >
        + Add Player
      </button>
    )
  }

  return (
    <form action={handleSubmit} className="bg-dark rounded-xl p-4 border border-green/20 space-y-3 toast-enter">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="grid grid-cols-2 gap-3">
        <input
          name="firstName"
          placeholder="First name"
          required
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
        <input
          name="lastName"
          placeholder="Last name"
          required
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="jerseyNumber"
          type="number"
          min="0"
          max="99"
          placeholder="Jersey #"
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
        <input
          name="position"
          placeholder="Position"
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray hover:text-white px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-bold bg-green text-dark px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Adding...' : 'Add Player'}
        </button>
      </div>
    </form>
  )
}
