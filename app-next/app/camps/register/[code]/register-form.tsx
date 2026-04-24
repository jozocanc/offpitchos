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
        <div className="text-4xl mb-4 text-[#1F4E3D]">✓</div>
        <p className="text-[#1F4E3D] font-semibold text-xl mb-2 tracking-[-0.02em]">Registered!</p>
        <p className="text-[#5C6660] text-sm">
          {registeredCount} {registeredCount === 1 ? 'child' : 'children'} signed up. The club will reach out with details before the camp.
        </p>
        {feeCents > 0 && (
          <p className="text-[#5C6660] text-xs mt-4">
            Payment of ${((feeCents * registeredCount) / 100).toFixed(2)} total will be collected by the club.
          </p>
        )}
      </div>
    )
  }

  const totalFee = feeCents * kids.length

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border-t border-[#E8E3DC] pt-4 mb-2">
        <p className="text-xs text-[#5C6660] uppercase tracking-[0.14em] font-semibold mb-4">Parent / Guardian</p>
      </div>

      <div>
        <label className="block text-sm text-[#5C6660] mb-1">Full Name</label>
        <input
          required
          value={parentName}
          onChange={e => setParentName(e.target.value)}
          placeholder="John Smith"
          className="w-full bg-[#FAF7F2] border border-[#E8E3DC] rounded-xl px-4 py-3 text-sm text-[#0F1510] placeholder-[#5C6660]/60 focus:outline-none focus:border-[#1F4E3D] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-[#5C6660] mb-1">Email</label>
        <input
          required
          type="email"
          value={parentEmail}
          onChange={e => setParentEmail(e.target.value)}
          placeholder="john@email.com"
          className="w-full bg-[#FAF7F2] border border-[#E8E3DC] rounded-xl px-4 py-3 text-sm text-[#0F1510] placeholder-[#5C6660]/60 focus:outline-none focus:border-[#1F4E3D] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-[#5C6660] mb-1">Phone (optional)</label>
        <input
          type="tel"
          value={parentPhone}
          onChange={e => setParentPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full bg-[#FAF7F2] border border-[#E8E3DC] rounded-xl px-4 py-3 text-sm text-[#0F1510] placeholder-[#5C6660]/60 focus:outline-none focus:border-[#1F4E3D] transition-colors"
        />
      </div>

      <div className="border-t border-[#E8E3DC] pt-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[#5C6660] uppercase tracking-[0.14em] font-semibold">Children</p>
          <button
            type="button"
            onClick={addKid}
            className="text-xs font-semibold text-[#1F4E3D] hover:text-[#2D6B56] transition-colors"
          >
            + Add another child
          </button>
        </div>
      </div>

      {kids.map((kid, index) => (
        <div key={index} className="bg-[#FAF7F2] rounded-xl p-3 border border-[#E8E3DC]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#5C6660] font-semibold">Child {index + 1}</p>
            {kids.length > 1 && (
              <button
                type="button"
                onClick={() => removeKid(index)}
                className="text-xs text-red-600 hover:text-red-700 transition-colors"
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
                className="w-full bg-[#FFFFFF] border border-[#E8E3DC] rounded-lg px-3 py-2.5 text-sm text-[#0F1510] placeholder-[#5C6660]/60 focus:outline-none focus:border-[#1F4E3D] transition-colors"
              />
            </div>
            <div>
              <input
                required
                value={kid.age}
                onChange={e => updateKid(index, 'age', e.target.value)}
                placeholder="Age"
                className="w-full bg-[#FFFFFF] border border-[#E8E3DC] rounded-lg px-3 py-2.5 text-sm text-[#0F1510] placeholder-[#5C6660]/60 focus:outline-none focus:border-[#1F4E3D] transition-colors"
              />
            </div>
          </div>
        </div>
      ))}

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#1F4E3D] text-[#FAF7F2] font-semibold py-3 px-4 rounded-full text-sm uppercase tracking-[0.14em] hover:bg-[#2D6B56] transition-colors disabled:opacity-60 mt-2"
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
