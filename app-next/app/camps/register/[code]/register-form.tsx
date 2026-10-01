'use client'

import { useState, useTransition } from 'react'
import { registerGuest } from './actions'

const INPUT_CLASS =
  'w-full bg-[#FAF7F2] border border-[#E8E3DC] rounded-xl px-4 py-3 text-sm text-[#0F1510] placeholder-[#5C6660]/60 focus:outline-none focus:border-[#1F4E3D] transition-colors'

// Public ID camp / prospect camp registration. The registrant is the
// athlete. A guardian contact is optional and only asked for when the
// athlete is under 18.
export default function RegisterForm({
  campDetailId,
  feeCents,
}: {
  campDetailId: string
  feeCents: number
}) {
  const [athleteName, setAthleteName] = useState('')
  const [athleteAge, setAthleteAge] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [guardianContact, setGuardianContact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const regRes = await registerGuest({
          campDetailId,
          athleteName,
          athleteAge,
          email,
          phone,
          guardianContact,
        })
        if (!regRes.ok) { setError(regRes.error); return }
        const result = regRes.data
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
        <div className="text-4xl mb-4 text-[#1F4E3D]">✓</div>
        <p className="text-[#1F4E3D] font-semibold text-xl mb-2 tracking-[-0.02em]">Registered!</p>
        <p className="text-[#5C6660] text-sm">
          You&apos;re signed up. The coaching staff will reach out with details before the camp.
        </p>
        {feeCents > 0 && (
          <p className="text-[#5C6660] text-xs mt-4">
            The ${(feeCents / 100).toFixed(2)} camp fee will be collected by the program.
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border-t border-[#E8E3DC] pt-4 mb-2">
        <p className="text-xs text-[#5C6660] uppercase tracking-[0.14em] font-semibold mb-4">Athlete</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-sm text-[#5C6660] mb-1">Full Name</label>
          <input
            required
            value={athleteName}
            onChange={e => setAthleteName(e.target.value)}
            placeholder="Alex Martinez"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm text-[#5C6660] mb-1">Age</label>
          <input
            required
            value={athleteAge}
            onChange={e => setAthleteAge(e.target.value)}
            placeholder="17"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-[#5C6660] mb-1">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="alex@email.com"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm text-[#5C6660] mb-1">Phone (optional)</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className={INPUT_CLASS}
        />
      </div>

      <div className="border-t border-[#E8E3DC] pt-4">
        <label className="block text-sm text-[#5C6660] mb-1">Guardian contact (if under 18)</label>
        <input
          value={guardianContact}
          onChange={e => setGuardianContact(e.target.value)}
          placeholder="Name and phone or email"
          className={INPUT_CLASS}
        />
      </div>

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#1F4E3D] text-[#FAF7F2] font-semibold py-3 px-4 rounded-full text-sm uppercase tracking-[0.14em] hover:bg-[#2D6B56] transition-colors disabled:opacity-60 mt-2"
      >
        {isPending
          ? 'Registering…'
          : feeCents > 0
            ? `Register · $${(feeCents / 100).toFixed(2)}`
            : 'Register · Free'}
      </button>
    </form>
  )
}
