'use client'

import { useState, useEffect } from 'react'
import { registerForCamp, getParentPlayers } from './actions'

interface Camp {
  eventId: string
  title: string
  feeCents: number
  capacity: number | null
  registeredCount: number
}

interface Player {
  id: string
  first_name: string
  last_name: string
  teams: { name: string } | null
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function RegisterModal({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getParentPlayers()
      .then(data => {
        setPlayers(data as unknown as Player[])
        if (data.length > 0) setSelectedPlayerId(data[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRegister() {
    if (!selectedPlayerId) return
    setSubmitting(true)
    setError(null)
    try {
      if (camp.feeCents > 0) {
        // Paid camp — redirect to Stripe Checkout
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: camp.eventId, playerId: selectedPlayerId }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        if (data.url) {
          window.location.href = data.url
          return
        }
      }
      // Free camp — register directly
      await registerForCamp(camp.eventId, selectedPlayerId)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const spotsLeft = camp.capacity ? camp.capacity - camp.registeredCount : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-2">Register for {camp.title}</h2>
        {camp.feeCents > 0 && <p className="text-sm text-gray mb-1">Fee: {formatCurrency(camp.feeCents)}</p>}
        {spotsLeft !== null && <p className="text-sm text-gray mb-4">{spotsLeft} spots remaining</p>}

        {success ? (
          <div className="text-center py-6">
            <p className="text-green font-semibold mb-2">Registered!</p>
            <p className="text-sm text-gray">Your child has been registered for this camp.</p>
            <button onClick={onClose} className="mt-4 text-sm text-gray hover:text-white transition-colors">Close</button>
          </div>
        ) : loading ? (
          <p className="text-sm text-gray">Loading your players...</p>
        ) : players.length === 0 ? (
          <p className="text-sm text-gray">No players found. Add a player first in your profile.</p>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Select player</label>
            <select
              value={selectedPlayerId}
              onChange={e => setSelectedPlayerId(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
            >
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({(p.teams as any)?.name ?? 'No team'})
                </option>
              ))}
            </select>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={submitting || !selectedPlayerId}
                className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {submitting ? 'Processing...' : camp.feeCents > 0 ? 'Register & Pay' : 'Register'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
