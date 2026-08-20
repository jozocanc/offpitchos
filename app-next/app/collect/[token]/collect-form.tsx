'use client'

import { useState } from 'react'
import { saveCollectedDetails, type CollectPlayer } from './actions'

const JERSEY_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', 'AXXL']

const inputClass =
  'w-full px-4 py-3 bg-dark border border-gray/20 rounded-lg text-white placeholder-gray focus:outline-none focus:ring-2 focus:ring-green'

export default function CollectForm({
  token,
  player,
}: {
  token: string
  player: CollectPlayer
}) {
  const [jerseySize, setJerseySize] = useState(player.jerseySize ?? '')
  const [shortsSize, setShortsSize] = useState(player.shortsSize ?? '')
  const [address, setAddress] = useState(player.address ?? '')
  const [emergencyContactName, setEmergencyContactName] = useState(player.emergencyContactName ?? '')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(player.emergencyContactPhone ?? '')
  const [dietaryNotes, setDietaryNotes] = useState(player.dietaryNotes ?? '')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const res = await saveCollectedDetails(token, {
      jerseySize,
      shortsSize,
      address,
      emergencyContactName,
      emergencyContactPhone,
      dietaryNotes,
    })

    setSaving(false)
    if (res.ok) {
      setSaved(true)
    } else {
      setError(res.error)
    }
  }

  if (saved) {
    return (
      <div className="bg-dark-secondary rounded-2xl p-8 border border-green/20 text-center">
        <p className="text-green text-lg font-bold mb-2">Thanks, {player.firstName}.</p>
        <p className="text-gray text-sm">
          Your details are with the {player.clubName || 'coaching'} staff. You can close this page.
        </p>
        <button
          onClick={() => setSaved(false)}
          className="text-gray text-sm underline mt-4 hover:text-white transition-colors"
        >
          Change something
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-dark-secondary rounded-2xl p-8 border border-white/10 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="jersey" className="block text-sm text-gray mb-1">Jersey size</label>
          <select
            id="jersey"
            value={jerseySize}
            onChange={(e) => setJerseySize(e.target.value)}
            className={inputClass}
          >
            <option value="">Select</option>
            {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="shorts" className="block text-sm text-gray mb-1">Shorts size</label>
          <select
            id="shorts"
            value={shortsSize}
            onChange={(e) => setShortsSize(e.target.value)}
            className={inputClass}
          >
            <option value="">Select</option>
            {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="address" className="block text-sm text-gray mb-1">Home address</label>
        <textarea
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="Street, city, state, ZIP"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="ecname" className="block text-sm text-gray mb-1">Emergency contact</label>
          <input
            id="ecname"
            type="text"
            value={emergencyContactName}
            onChange={(e) => setEmergencyContactName(e.target.value)}
            className={inputClass}
            placeholder="Name"
          />
        </div>
        <div>
          <label htmlFor="ecphone" className="block text-sm text-gray mb-1">Their phone</label>
          <input
            id="ecphone"
            type="tel"
            value={emergencyContactPhone}
            onChange={(e) => setEmergencyContactPhone(e.target.value)}
            className={inputClass}
            placeholder="(555) 555-5555"
          />
        </div>
      </div>

      <div>
        <label htmlFor="dietary" className="block text-sm text-gray mb-1">
          Allergies or dietary needs <span className="text-gray/60">(optional)</span>
        </label>
        <input
          id="dietary"
          type="text"
          value={dietaryNotes}
          onChange={(e) => setDietaryNotes(e.target.value)}
          className={inputClass}
          placeholder="Leave blank if none"
        />
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-green text-dark font-bold py-3 px-4 rounded-xl uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Submit'}
      </button>

      <p className="text-gray text-xs text-center">
        Only your coaching staff sees this.
      </p>
    </form>
  )
}
