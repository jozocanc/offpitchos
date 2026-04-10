'use client'

import { useState, useTransition } from 'react'
import { linkPlayerToParent, createPlayerScopedInvite } from './player-actions'
import { useToast } from '@/components/toast'

interface ParentOption {
  userId: string
  displayName: string
}

// Inline menu shown next to "Unlinked" players. Two paths:
//   1) Link an already-joined parent team_member to this player (updates
//      players.parent_id to the target user immediately).
//   2) Generate a player-scoped invite URL and clipboard-copy it, so the DOC
//      can send it to a parent who hasn't joined yet — on accept, acceptInvite
//      auto-claims this specific player for the arriving user.
//
// Both paths turn the "Unlinked" warning into an action rather than forcing
// the DOC to bounce out to the invites panel.
export default function LinkParentMenu({
  playerId,
  teamId,
  playerName,
  parentOptions,
}: {
  playerId: string
  teamId: string
  playerName: string
  parentOptions: ParentOption[]
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [invitePending, setInvitePending] = useState(false)
  const { toast } = useToast()

  function handlePick(parentUserId: string, displayName: string) {
    startTransition(async () => {
      try {
        await linkPlayerToParent(playerId, parentUserId, teamId)
        toast(`${playerName} linked to ${displayName}`, 'success')
        setOpen(false)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to link parent'
        toast(msg, 'error')
      }
    })
  }

  async function handleGenerateInvite() {
    if (invitePending) return
    setInvitePending(true)
    try {
      const { url } = await createPlayerScopedInvite(playerId, teamId)
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        // Clipboard permission denied — fall back to a throwaway input.
        const input = document.createElement('input')
        input.value = url
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      toast(`Invite for ${playerName} copied — send it to the parent`, 'success')
      setOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invite'
      toast(msg, 'error')
    } finally {
      setInvitePending(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] font-bold text-green hover:opacity-80 transition-opacity uppercase tracking-wide"
      >
        Link
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10 bg-dark border border-white/10 rounded-xl shadow-xl p-2 min-w-[220px]">
        <p className="text-[10px] text-gray uppercase tracking-wide px-2 pt-1 pb-2">
          Link {playerName} to:
        </p>

        {/* Invite-new path is always available. Auto-claims the player when
            the parent accepts, so the DOC never has to chase a second step. */}
        <button
          onClick={handleGenerateInvite}
          disabled={invitePending}
          className="block w-full text-left text-xs text-green hover:bg-green/5 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50 font-bold"
        >
          {invitePending ? 'Generating…' : `+ Invite a new parent`}
        </button>

        {parentOptions.length > 0 && (
          <>
            <div className="border-t border-white/5 my-1" />
            <p className="text-[10px] text-gray uppercase tracking-wide px-2 pt-1 pb-1">
              Already on team
            </p>
            {parentOptions.map(opt => (
              <button
                key={opt.userId}
                onClick={() => handlePick(opt.userId, opt.displayName)}
                disabled={isPending}
                className="block w-full text-left text-xs text-white hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50"
              >
                {opt.displayName}
              </button>
            ))}
          </>
        )}

        <button
          onClick={() => setOpen(false)}
          className="block w-full text-left text-[10px] text-gray hover:text-white px-2 py-1 mt-1 border-t border-white/5 pt-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
