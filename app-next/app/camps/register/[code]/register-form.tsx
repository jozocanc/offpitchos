'use client'

import { useState, useTransition } from 'react'
import { registerGuest } from './actions'

export default function RegisterForm({
  campDetailId,
  feeCents,
}: {
  campDetailId: string
  feeCents: number
}) {
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [kidName, setKidName] = useState('')
  const [kidAge, setKidAge] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const result = await registerGuest({
          campDetailId,
          parentName,
          parentEmail,
          parentPhone,
          kidName,
          kidAge,
        })
        if (result.success) {
          setSuccess(true)
        } else {
          setError(result.message)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">✓</div>
        <p className="text-[#00FF87] font-bold text-xl mb-2">Registered!</p>
        <p className="text-[#94A3B8] text-sm">
          {kidName} is signed up. The club will reach out with any details before the camp.
        </p>
        {feeCents > 0 && (
          <p className="text-yellow-400 text-xs mt-4">
            Payment of ${(feeCents / 100).toFixed(2)} will be collected by the club.
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border-t border-white/5 pt-4 mb-2">
        <p className="text-xs text-[#94A3B8] uppercase tracking-wide font-bold mb-4">Parent / Guardian</p>
      </div>

      <div>
        <label className="block text-sm text-[#94A3B8] mb-1">Full Name</label>
        <input
          required
          value={parentName}
          onChange={e => setParentName(e.target.value)}
          placeholder="John Smith"
          className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-[#94A3B8] mb-1">Email</label>
        <input
          required
          type="email"
          value={parentEmail}
          onChange={e => setParentEmail(e.target.value)}
          placeholder="john@email.com"
          className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-[#94A3B8] mb-1">Phone (optional)</label>
        <input
          type="tel"
          value={parentPhone}
          onChange={e => setParentPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
        />
      </div>

      <div className="border-t border-white/5 pt-4 mb-2">
        <p className="text-xs text-[#94A3B8] uppercase tracking-wide font-bold mb-4">Child</p>
      </div>

      <div>
        <label className="block text-sm text-[#94A3B8] mb-1">Child's Full Name</label>
        <input
          required
          value={kidName}
          onChange={e => setKidName(e.target.value)}
          placeholder="Billy Smith"
          className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-[#94A3B8] mb-1">Child's Age</label>
        <input
          required
          value={kidAge}
          onChange={e => setKidAge(e.target.value)}
          placeholder="10"
          className="w-full bg-[#0A1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#00FF87] text-[#0A1628] font-bold py-3 px-4 rounded-xl text-sm uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60 mt-2"
      >
        {isPending ? 'Registering...' : feeCents > 0 ? `Register — $${(feeCents / 100).toFixed(2)}` : 'Register — Free'}
      </button>
    </form>
  )
}
