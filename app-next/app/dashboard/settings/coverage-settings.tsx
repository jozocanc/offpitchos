'use client'

import { useState, useTransition, useEffect } from 'react'
import { getCoverageTimeout, updateCoverageTimeout } from '../coverage/actions'

export default function CoverageSettings() {
  const [minutes, setMinutes] = useState(120)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getCoverageTimeout().then(setMinutes)
  }, [])

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateCoverageTimeout(minutes)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <h2 className="text-lg font-bold mb-4">Coverage</h2>
      <div>
        <label className="block text-sm font-medium text-gray mb-2">Escalation timeout (minutes)</label>
        <p className="text-gray text-xs mb-3">How long to wait for a coach to accept before notifying you.</p>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            min={15}
            max={1440}
            className="w-24 bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
          />
          <span className="text-gray text-sm">minutes</span>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60"
          >
            {isPending ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {error && <p className="text-red text-sm mt-2">{error}</p>}
      </div>
    </section>
  )
}
