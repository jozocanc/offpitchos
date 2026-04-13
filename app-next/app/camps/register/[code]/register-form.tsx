'use client'

import { useState, useTransition } from 'react'
import { registerGuest } from './actions'

interface Kid {
  name: string
  age: string
}

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
  const [kids, setKids] = useState<Kid[]>([{ name: '', age: '' }])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [registeredCount, setRegisteredCount] = useState(0)
  const [isPending, startTransition] = useTransition()

  function addKid() {
    setKids(prev => [...prev, { name: '', age: '' }])
  }

  function removeKid(index: number) {
    if (kids.length <= 1) return
    setKids(prev => prev.filter((_, i) => i !== index))
  }

  function updateKid(index: number, field: keyof Kid, value: string) {
    setKids(prev => prev.map((k, i) => i === index ? { ...k, [field]: value } : k))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validKids = kids.filter(k => k.name.trim() && k.age.trim())
    if (validKids.length === 0) {
      setError('Add at least one child')
      return
    }

    startTransition(async () => {
      let succeeded = 0
      let lastError = ''

      for (const kid of validKids) {
        try {
          const result = await registerGuest({
            campDetailId,
            parentName,
            parentEmail,
            parentPhone,
            kidName: kid.name,
            kidAge: kid.age,
          })
          if (result.success) {
            succeeded++
          } else {
            lastError = result.message
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Something went wrong'
        }
      }

      if (succeeded > 0) {
        setRegisteredCount(succeeded)
        setSuccess(true)
      } else {
        setError(lastError)
      }
    })
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">✓</div>
        <p className="text-[#00FF87] font-bold text-xl mb-2">Registered!</p>
        <p className="text-[#94A3B8] text-sm">
          {registeredCount} {registeredCount === 1 ? 'child' : 'children'} signed up. The club will reach out with details before the camp.
        </p>
        {feeCents > 0 && (
          <p className="text-yellow-400 text-xs mt-4">
            Payment of ${((feeCents * registeredCount) / 100).toFixed(2)} total will be collected by the club.
          </p>
        )}
      </div>
    )
  }

  const totalFee = feeCents * kids.length

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

      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[#94A3B8] uppercase tracking-wide font-bold">Children</p>
          <button
            type="button"
            onClick={addKid}
            className="text-xs font-bold text-[#00FF87] hover:opacity-80 transition-opacity"
          >
            + Add another child
          </button>
        </div>
      </div>

      {kids.map((kid, index) => (
        <div key={index} className="bg-[#0A1628]/50 rounded-xl p-3 border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#94A3B8] font-bold">Child {index + 1}</p>
            {kids.length > 1 && (
              <button
                type="button"
                onClick={() => removeKid(index)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <input
                required
                value={kid.name}
                onChange={e => updateKid(index, 'name', e.target.value)}
                placeholder="Child's full name"
                className="w-full bg-[#0A1628] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
              />
            </div>
            <div>
              <input
                required
                value={kid.age}
                onChange={e => updateKid(index, 'age', e.target.value)}
                placeholder="Age"
                className="w-full bg-[#0A1628] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#00FF87] transition-colors"
              />
            </div>
          </div>
        </div>
      ))}

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#00FF87] text-[#0A1628] font-bold py-3 px-4 rounded-xl text-sm uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60 mt-2"
      >
        {isPending
          ? 'Registering...'
          : totalFee > 0
            ? `Register ${kids.length} ${kids.length === 1 ? 'child' : 'children'} — $${(totalFee / 100).toFixed(2)}`
            : `Register ${kids.length} ${kids.length === 1 ? 'child' : 'children'} — Free`}
      </button>
    </form>
  )
}
