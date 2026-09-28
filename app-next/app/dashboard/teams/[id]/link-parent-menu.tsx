'use client'

import { useState, useTransition } from 'react'
import { linkPlayerToParent, createPlayerScopedInvite } from './player-actions'
import { useToast } from '@/components/toast'

interface AccountOption {
  userId: string
  displayName: string
}

// Inline menu shown next to players who haven't claimed their profile yet.
// Two paths:
//   1) Generate a player-scoped invite URL and clipboard-copy it, so the DOC
//      can send it to the player. On accept, the join RPC sets
//      players.parent_id to the player's own account (claims the profile).
//   2) Link a player account that already joined the team (e.g. via the team
//      code) to this roster row, updating players.parent_id immediately.
//
// Both paths turn the "Not claimed" badge into an action rather than forcing
// the DOC to bounce out to the invites panel. Component/file names are kept
// for import compatibility.
export default function LinkParentMenu({
  playerId,
  teamId,
  playerName,
  parentOptions,
}: {
  playerId: string
  teamId: string
  playerName: string
  parentOptions: AccountOption[]
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [invitePending, setInvitePending] = useState(false)
  const { toast } = useToast()

  function handlePick(accountUserId: string, displayName: string) {
    startTransition(async () => {
      try {
        const r = await linkPlayerToParent(playerId, accountUserId, teamId)
        if (!r.ok) { toast(r.error, 'error'); return }
        toast(`${playerName} linked to ${displayName}`, 'success')
        setOpen(false)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to link account'
        toast(msg, 'error')
      }
    })
  }

  async function handleGenerateInvite() {
    if (invitePending) return
    setInvitePending(true)
    try {
      const scopedRes = await createPlayerScopedInvite(playerId, teamId)
      if (!scopedRes.ok) { toast(scopedRes.error, 'error'); return }
      const { url } = scopedRes.data
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
      toast(`Invite for ${playerName} copied. Send it to them to claim their profile`, 'success')
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
        Invite
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10 bg-dark border border-white/10 rounded-xl shadow-xl p-2 min-w-[220px]">
        <p className="text-[10px] text-gray uppercase tracking-wide px-2 pt-1 pb-2">
          {playerName} hasn&apos;t claimed their profile
        </p>

        {/* Invite path is always available. The player's account claims this
            roster row on accept, so the DOC never has to chase a second step. */}
        <button
          onClick={handleGenerateInvite}
          disabled={invitePending}
          className="block w-full text-left text-xs text-green hover:bg-green/5 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50 font-bold"
        >
          {invitePending ? 'Generating…' : '+ Copy claim link for player'}
        </button>

        {parentOptions.length > 0 && (
          <>
            <div className="border-t border-white/5 my-1" />
            <p className="text-[10px] text-gray uppercase tracking-wide px-2 pt-1 pb-1">
              Or link an account already on the team
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
