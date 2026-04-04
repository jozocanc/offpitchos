'use client'

import { useState, useTransition } from 'react'
import { createAnnouncement } from './actions'

interface Team {
  id: string
  name: string
  age_group: string
}

interface NewAnnouncementModalProps {
  teams: Team[]
  userRole: string
  onClose: () => void
}

export default function NewAnnouncementModal({ teams, userRole, onClose }: NewAnnouncementModalProps) {
  const [teamId, setTeamId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isDoc = userRole === 'doc'

  function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      setError('Title and message are required')
      return
    }
    if (!isDoc && !teamId) {
      setError('Select a team')
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        await createAnnouncement({
          teamId: teamId || null,
          title: title.trim(),
          body: body.trim(),
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-6">New Announcement</h2>

        <label className="block text-sm font-medium text-gray mb-2">Audience</label>
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
        >
          {isDoc && <option value="">All Teams</option>}
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Practice location change"
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
          autoFocus
        />

        <label className="block text-sm font-medium text-gray mb-2">Message</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your announcement..."
          rows={4}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-2 resize-none"
        />

        {error && <p className="text-red text-sm mt-2 mb-2">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Posting...' : 'Post Announcement'}
          </button>
        </div>
      </div>
    </div>
  )
}
