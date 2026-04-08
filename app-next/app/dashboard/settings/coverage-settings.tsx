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

  const presets = [
    { label: '30m', value: 30 },
    { label: '1h', value: 60 },
    { label: '2h', value: 120 },
    { label: '4h', value: 240 },
    { label: '1d', value: 1440 },
  ]

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <h2 className="text-lg font-bold mb-4">Coverage</h2>
      <div>
        <label className="block text-sm font-medium text-gray mb-2">Escalation timeout (minutes)</label>
        <p className="text-gray text-xs mb-3">How long to wait for a coach to accept before notifying you.</p>
        <div className="flex gap-3 items-center mb-3">
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
        <div className="flex gap-2 flex-wrap">
          {presets.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setMinutes(p.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                minutes === p.value
                  ? 'bg-green/15 border-green/30 text-green font-semibold'
                  : 'bg-white/5 border-white/10 text-gray hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {error && <p className="text-red text-sm mt-2">{error}</p>}
      </div>
    </section>
  )
}
