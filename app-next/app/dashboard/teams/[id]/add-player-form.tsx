'use client'

import { useState, useTransition } from 'react'
import { addPlayer, createParentInviteReturningUrl } from './player-actions'
import { useToast } from '@/components/toast'

// Tracks the last successfully-added player so we can show an inline
// "invite their parent" prompt. This collapses the two-step enroll flow
// (add player → separately generate invite link from the right column)
// into a single continuous action.
interface JustAdded {
  firstName: string
  lastName: string
}

export default function AddPlayerForm({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [justAdded, setJustAdded] = useState<JustAdded | null>(null)
  const [invitePending, setInvitePending] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const { toast } = useToast()

  function handleSubmit(formData: FormData) {
    const firstName = (formData.get('firstName') as string)?.trim() ?? ''
    const lastName = (formData.get('lastName') as string)?.trim() ?? ''
    startTransition(async () => {
      try {
        await addPlayer(formData)
        setJustAdded({ firstName, lastName })
        setOpen(false)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to add player'
        toast(msg, 'error')
      }
    })
  }

  async function handleInviteParent() {
    if (invitePending) return
    setInvitePending(true)
    try {
      const { url } = await createParentInviteReturningUrl(teamId)
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        // Fallback for browsers without clipboard API permission.
        const input = document.createElement('input')
        input.value = url
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      setCopiedUrl(url)
      toast('Invite link copied to clipboard', 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invite'
      toast(msg, 'error')
    } finally {
      setInvitePending(false)
    }
  }

  // Inline confirmation + invite prompt after a successful add.
  if (justAdded) {
    return (
      <div className="bg-dark rounded-xl p-4 border border-green/20 space-y-3 toast-enter">
        <p className="text-sm text-white">
          ✓ Added <span className="font-bold">{justAdded.firstName} {justAdded.lastName}</span>
        </p>
        {copiedUrl ? (
          <p className="text-xs text-gray">
            Invite link copied. Send it to the parent so they can join the team.
          </p>
        ) : (
          <p className="text-xs text-gray">
            Need to invite their parent? Generate a join link — we&apos;ll copy it to your clipboard.
          </p>
        )}
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setJustAdded(null)
              setCopiedUrl(null)
            }}
            className="text-xs text-gray hover:text-white px-3 py-1.5"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              setJustAdded(null)
              setCopiedUrl(null)
              setOpen(true)
            }}
            className="text-xs font-bold text-green hover:opacity-80 px-3 py-1.5"
          >
            Add another
          </button>
          {!copiedUrl && (
            <button
              type="button"
              onClick={handleInviteParent}
              disabled={invitePending}
              className="text-xs font-bold bg-green text-dark px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {invitePending ? 'Generating…' : 'Get parent invite link'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-bold text-green hover:opacity-80 transition-opacity"
      >
        + Add Player
      </button>
    )
  }

  return (
    <form action={handleSubmit} className="bg-dark rounded-xl p-4 border border-green/20 space-y-3 toast-enter">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="grid grid-cols-2 gap-3">
        <input
          name="firstName"
          placeholder="First name"
          required
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
        <input
          name="lastName"
          placeholder="Last name"
          required
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="jerseyNumber"
          type="number"
          min="0"
          max="99"
          placeholder="Jersey #"
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
        <input
          name="position"
          placeholder="Position"
          className="bg-dark-secondary rounded-lg px-3 py-2 text-sm border border-white/10 text-white placeholder-gray focus:outline-none focus:border-green"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray hover:text-white px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-bold bg-green text-dark px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Adding...' : 'Add Player'}
        </button>
      </div>
    </form>
  )
}
