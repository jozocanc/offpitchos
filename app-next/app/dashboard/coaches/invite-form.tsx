'use client'

import { useState, useTransition } from 'react'
import { inviteCoach } from './actions'
import { useToast } from '@/components/toast'

interface Team {
  id: string
  name: string
  age_group: string
}

export default function InviteCoachForm({ teams }: { teams: Team[] }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [teamId, setTeamId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setError(null)

    const formData = new FormData()
    formData.set('email', email)
    if (teamId) formData.set('teamId', teamId)

    const invitedEmail = email.trim()
    startTransition(async () => {
      try {
        const result = await inviteCoach(formData)
        setEmail('')
        setTeamId('')
        setOpen(false)
        if (result.emailSent) {
          toast(`Invite sent to ${invitedEmail}`, 'success')
        } else {
          toast(
            `Invite created — but the email didn't send. Copy the join link from Pending Invites below and share it directly.`,
            'error',
          )
        }
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
        + Invite Coach
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">Invite a Coach</h2>

            <label className="block text-sm font-medium text-gray mb-2" htmlFor="ic-email">
              Email address
            </label>
            <input
              id="ic-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="coach@example.com"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
              autoFocus
            />

            <label className="block text-sm font-medium text-gray mb-2" htmlFor="ic-team">
              Assign to team <span className="text-gray/50">(optional)</span>
            </label>
            <select
              id="ic-team"
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
            >
              <option value="">No specific team</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.age_group})
                </option>
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
                {isPending ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
