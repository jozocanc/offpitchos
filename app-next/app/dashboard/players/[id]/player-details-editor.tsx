'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePlayerDetails } from './actions'

const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

/** Staff-only inline editor for name, jersey number and position. */
export default function PlayerDetailsEditor({ playerId, firstName, lastName, jerseyNumber, position }: {
  playerId: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
  position: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState(firstName)
  const [last, setLast] = useState(lastName)
  const [jersey, setJersey] = useState(jerseyNumber != null ? String(jerseyNumber) : '')
  const [pos, setPos] = useState(position ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-gray hover:text-white border border-white/10 rounded-xl px-3 py-2 transition-colors"
      >
        Edit
      </button>
    )
  }

  const input = 'w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green'
  const positions = pos && !POSITIONS.includes(pos) ? [pos, ...POSITIONS] : POSITIONS

  return (
    <div className="w-full mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <label className="text-xs text-gray">First name<input value={first} onChange={e => setFirst(e.target.value)} className={`${input} mt-1`} /></label>
      <label className="text-xs text-gray">Last name<input value={last} onChange={e => setLast(e.target.value)} className={`${input} mt-1`} /></label>
      <label className="text-xs text-gray">Jersey #<input value={jersey} onChange={e => setJersey(e.target.value)} inputMode="numeric" className={`${input} mt-1`} /></label>
      <label className="text-xs text-gray">Position
        <select value={pos} onChange={e => setPos(e.target.value)} className={`${input} mt-1`}>
          <option value="">Not set</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      {error && <p className="col-span-full text-red text-sm">{error}</p>}
      <div className="col-span-full flex gap-3">
        <button type="button" onClick={() => { setOpen(false); setError(null) }} className="text-gray text-sm hover:text-white">Cancel</button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const res = await updatePlayerDetails(playerId, { firstName: first, lastName: last, jerseyNumber: jersey, position: pos })
            if (!res.ok) { setError(res.error); return }
            setOpen(false)
            router.refresh()
          })}
          className="bg-green text-dark font-bold px-5 py-2 rounded-xl hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
