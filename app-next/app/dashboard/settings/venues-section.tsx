'use client'

import { useState, useTransition, useEffect } from 'react'
import { getVenues, addVenue, updateVenue, deleteVenue } from './venue-actions'

interface Venue {
  id: string
  name: string
  address: string | null
}

export default function VenuesSection() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    loadVenues()
  }, [])

  async function loadVenues() {
    const data = await getVenues()
    setVenues(data)
  }

  function openAdd() {
    setEditingVenue(null)
    setName('')
    setAddress('')
    setError(null)
    setModalOpen(true)
  }

  function openEdit(venue: Venue) {
    setEditingVenue(venue)
    setName(venue.name)
    setAddress(venue.address ?? '')
    setError(null)
    setModalOpen(true)
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError('Venue name is required')
      return
    }
    setError(null)

    const formData = new FormData()
    formData.set('name', name)
    formData.set('address', address)
    if (editingVenue) formData.set('id', editingVenue.id)

    startTransition(async () => {
      try {
        if (editingVenue) {
          await updateVenue(formData)
        } else {
          await addVenue(formData)
        }
        setModalOpen(false)
        await loadVenues()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function handleDelete(venueId: string) {
    const formData = new FormData()
    formData.set('id', venueId)
    startTransition(async () => {
      try {
        await deleteVenue(formData)
        await loadVenues()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Venues</h2>
          {venues.length > 0 && (
            <span className="text-xs font-semibold bg-white/5 text-gray border border-white/10 rounded-full px-2 py-0.5">
              {venues.length}
            </span>
          )}
        </div>
        <button
          onClick={openAdd}
          className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          + Add Venue
        </button>
      </div>

      {venues.length === 0 ? (
        <div className="bg-dark rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <div className="text-3xl mb-2">📍</div>
          <p className="text-white text-sm font-medium">No venues saved yet</p>
          <p className="text-gray text-xs mt-1">Add your first venue to use when scheduling events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map(venue => (
            <div key={venue.id} className="flex items-center justify-between bg-dark rounded-xl px-4 py-3 border border-white/5">
              <div>
                <p className="font-medium">{venue.name}</p>
                {venue.address && <p className="text-gray text-sm">{venue.address}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(venue)}
                  className="text-gray hover:text-white text-sm transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(venue.id)}
                  disabled={isPending}
                  className="text-red hover:text-red/80 text-sm transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">
              {editingVenue ? 'Edit Venue' : 'Add a Venue'}
            </h2>

            <label className="block text-sm font-medium text-gray mb-2">Venue name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Riverside Field"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
              autoFocus
            />

            <label className="block text-sm font-medium text-gray mb-2">Address (optional)</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Springfield"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-2"
            />

            {error && <p className="text-red text-sm mt-2 mb-2">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setModalOpen(false); setError(null) }}
                className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? 'Saving…' : editingVenue ? 'Save Changes' : 'Add Venue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
