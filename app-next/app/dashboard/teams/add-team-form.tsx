'use client'

import { useState, useTransition } from 'react'
import { AGE_GROUPS } from '@/lib/constants'
import { addTeam } from './actions'
import { useToast } from '@/components/toast'

export default function AddTeamForm() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState<string>(AGE_GROUPS[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!teamName.trim()) {
      setError('Team name is required')
      return
    }
    setError(null)

    const formData = new FormData()
    formData.set('teamName', teamName)
    formData.set('ageGroup', ageGroup)

    const addedName = teamName.trim()
    startTransition(async () => {
      try {
        await addTeam(formData)
        setTeamName('')
        setAgeGroup(String(AGE_GROUPS[0]))
        setOpen(false)
        toast(`${addedName} added`, 'success')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
      >
        + Add Team
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">Add a team</h2>

            <label className="block text-sm font-medium text-gray mb-2" htmlFor="at-name">
              Team name
            </label>
            <input
              id="at-name"
              type="text"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="e.g. U14 Girls Gold"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
              autoFocus
            />

            <label className="block text-sm font-medium text-gray mb-2" htmlFor="at-age">
              Age group
            </label>
            <select
              id="at-age"
              value={ageGroup}
              onChange={e => setAgeGroup(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
            >
              {AGE_GROUPS.map(ag => (
                <option key={ag} value={ag}>{ag}</option>
              ))}
            </select>

            {error && <p className="text-red text-sm mt-2 mb-2">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setOpen(false); setError(null) }}
                className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? 'Adding…' : 'Add Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
