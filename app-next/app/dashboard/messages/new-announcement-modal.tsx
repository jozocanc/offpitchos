'use client'

import { useState, useTransition } from 'react'
import { createAnnouncement } from './actions'
import { useToast } from '@/components/toast'

interface Team {
  id: string
  name: string
  age_group: string
}

interface AudienceCounts {
  parents: number
  coaches: number
}

interface NewAnnouncementModalProps {
  teams: Team[]
  userRole: string
  audienceByTeam: Record<string, AudienceCounts>
  clubWideAudience: AudienceCounts
  onClose: () => void
}

function formatAudience(counts: AudienceCounts): string {
  const parts: string[] = []
  if (counts.parents > 0) parts.push(`${counts.parents} ${counts.parents === 1 ? 'parent' : 'parents'}`)
  if (counts.coaches > 0) parts.push(`${counts.coaches} ${counts.coaches === 1 ? 'coach' : 'coaches'}`)
  if (parts.length === 0) return 'nobody yet'
  return parts.join(' and ')
}

export default function NewAnnouncementModal({
  teams,
  userRole,
  audienceByTeam,
  clubWideAudience,
  onClose,
}: NewAnnouncementModalProps) {
  const [teamId, setTeamId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const isDoc = userRole === 'doc'
  const isParent = userRole === 'parent'

  // Live audience preview based on selection
  const selectedAudience: AudienceCounts = teamId
    ? audienceByTeam[teamId] ?? { parents: 0, coaches: 0 }
    : clubWideAudience
  const audienceTotal = selectedAudience.parents + selectedAudience.coaches

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
        const result = await createAnnouncement({
          teamId: teamId || null,
          title: title.trim(),
          body: body.trim(),
        })
        if (result.totalRecipients === 0) {
          toast('Posted — but nobody is on this audience yet', 'error')
        } else {
          toast(`Posted · Sent to ${formatAudience({ parents: result.parentCount, coaches: result.coachCount })}`, 'success')
        }
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
        <h2 className="text-xl font-bold mb-6">{isParent ? 'Message Coach' : 'New Announcement'}</h2>

        <label className="block text-sm font-medium text-gray mb-2">
          {isParent ? 'Which team?' : 'Audience'}
        </label>
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
        >
          {isDoc && <option value="">All Teams</option>}
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
          ))}
        </select>

        {/* Audience preview */}
        <div className={`text-xs mb-4 flex items-center gap-2 ${
          audienceTotal === 0 ? 'text-yellow-400' : 'text-gray'
        }`}>
          <span>{isParent ? '💬' : '📣'}</span>
          <span>
            {audienceTotal === 0
              ? isParent ? 'No coaches on this team yet.' : 'This audience has no members yet — nobody will receive the announcement.'
              : isParent
                ? `Your message will reach ${selectedAudience.coaches} coach${selectedAudience.coaches === 1 ? '' : 'es'} on this team.`
                : `This will reach ${formatAudience(selectedAudience)}.`}
          </span>
        </div>

        <label className="block text-sm font-medium text-gray mb-2">
          {isParent ? 'Subject' : 'Title'}
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isParent ? 'e.g. Question about Saturday game' : 'e.g. Practice location change'}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
          autoFocus
        />

        <label className="block text-sm font-medium text-gray mb-2">Message</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={isParent ? 'Write your message to the coach...' : 'Write your announcement...'}
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
            {isPending ? 'Sending...' : isParent ? 'Send Message' : 'Post Announcement'}
          </button>
        </div>
      </div>
    </div>
  )
}
