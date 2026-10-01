'use client'

import { useState, useTransition } from 'react'
import { createAnnouncement } from './actions'
import { useToast, networkErrorMessage } from '@/components/toast'
import Modal from '@/components/modal'
import { formatRecipientToast } from '../notification-toast'
import { isStaff } from '@/lib/constants'
import { teamLabel } from '@/lib/team-label'

interface Team {
  id: string
  name: string
  age_group: string
}

interface AudienceCounts {
  players: number
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
  if (counts.players > 0) parts.push(`${counts.players} ${counts.players === 1 ? 'player' : 'players'}`)
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
  const [pollEnabled, setPollEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const isDoc = userRole === 'doc'
  // Non-staff (players) get the "Message Coach" framing.
  const isPlayer = !isStaff(userRole)

  // Live audience preview based on selection
  const selectedAudience: AudienceCounts = teamId
    ? audienceByTeam[teamId] ?? { players: 0, coaches: 0 }
    : clubWideAudience
  const audienceTotal = selectedAudience.players + selectedAudience.coaches

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
        const annRes = await createAnnouncement({
          teamId: teamId || null,
          title: title.trim(),
          body: body.trim(),
          pollEnabled: pollEnabled && !isPlayer,
        })
        if (!annRes.ok) { setError(annRes.error); toast(annRes.error, 'error'); return }
        const result = annRes.data
        toast(
          formatRecipientToast({
            action: 'announcement_posted',
            parents: result.parentCount,
            coaches: result.coachCount,
            emailFailed: result.emailFailed,
          }),
          result.totalRecipients === 0 || result.emailFailed > 0 ? 'error' : 'success',
        )
        onClose()
      } catch {
        setError(networkErrorMessage())
      }
    })
  }

  return (
    <Modal title={isPlayer ? 'Message the staff' : 'New announcement'} onClose={onClose} size="lg" dismissible={!isPending}>
      <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
        <label htmlFor="ann-team" className="block text-sm font-medium text-gray mb-2">
          {isPlayer ? 'Which team?' : 'Audience'}
        </label>
        <select
          id="ann-team"
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
        >
          {isDoc && <option value="">All teams</option>}
          {teams.map(t => (
            <option key={t.id} value={t.id}>{teamLabel(t.name, t.age_group)}</option>
          ))}
        </select>

        {/* Audience preview */}
        <div className={`text-xs mb-4 flex items-center gap-2 ${
          audienceTotal === 0 ? 'text-yellow-400' : 'text-gray'
        }`}>
          <span>
            {audienceTotal === 0
              ? isPlayer ? 'No coaches on this team yet.' : 'Nobody is on this team yet, so nobody will receive the announcement.'
              : isPlayer
                ? `Your message will reach ${selectedAudience.coaches} coach${selectedAudience.coaches === 1 ? '' : 'es'} on this team.`
                : `This will reach ${formatAudience(selectedAudience)}.`}
          </span>
        </div>

        <label htmlFor="ann-title" className="block text-sm font-medium text-gray mb-2">
          {isPlayer ? 'Subject' : 'Title'}
        </label>
        <input
          id="ann-title"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isPlayer ? 'e.g. Question about Saturday\'s game' : 'e.g. Practice location change'}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
          autoFocus
        />

        <label htmlFor="ann-body" className="block text-sm font-medium text-gray mb-2">Message</label>
        <textarea
          id="ann-body"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={isPlayer ? 'Write your message to the staff…' : 'Write your announcement…'}
          rows={4}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-2 resize-none"
        />

        {!isPlayer && (
          <label className="flex items-start gap-3 mt-4 p-3 rounded-xl border border-white/10 hover:border-green/30 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={pollEnabled}
              onChange={e => setPollEnabled(e.target.checked)}
              className="mt-1 accent-green"
            />
            <span className="text-sm">
              <span className="font-medium text-white">Ask for a response</span>
              <span className="block text-xs text-gray mt-0.5">
                Yes / No / Maybe buttons appear for each player. You see the tally.
              </span>
            </span>
          </label>
        )}

        {error && <p role="alert" className="text-red text-sm mt-2 mb-2">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (isPlayer ? 'Sending…' : 'Posting…') : isPlayer ? 'Send message' : 'Post announcement'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
