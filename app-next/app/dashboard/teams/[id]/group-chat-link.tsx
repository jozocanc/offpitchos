'use client'

import { useState, useTransition } from 'react'
import { updateGroupChatLink } from './actions'
import { useToast } from '@/components/toast'

// DOC sees an editable field to paste the WhatsApp (or any) group invite URL.
// Parents + coaches see a "Join Parent Group Chat" button that opens the link.
export default function GroupChatLink({
  teamId,
  teamName,
  currentLink,
  isDOC,
}: {
  teamId: string
  teamName: string
  currentLink: string | null
  isDOC: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [link, setLink] = useState(currentLink ?? '')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleSave() {
    startTransition(async () => {
      try {
        await updateGroupChatLink(teamId, link)
        toast(link.trim() ? 'Group chat link saved' : 'Group chat link removed', 'success')
        setEditing(false)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save'
        toast(msg, 'error')
      }
    })
  }

  // DOC: edit the link
  if (isDOC) {
    if (!editing && !currentLink) {
      return (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-green hover:opacity-80 transition-opacity font-bold"
        >
          + Add group chat link
        </button>
      )
    }

    if (editing) {
      return (
        <div className="bg-dark rounded-xl border border-green/20 p-3 space-y-2">
          <p className="text-xs text-gray">Paste a WhatsApp, GroupMe, or Telegram invite link. Parents will see a button to join.</p>
          <input
            type="url"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
            className="w-full bg-dark-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setEditing(false); setLink(currentLink ?? '') }}
              className="text-xs text-gray hover:text-white px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="text-xs font-bold bg-green text-dark px-3 py-1 rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )
    }

    // DOC has a link set — show it with edit option
    return (
      <div className="flex items-center gap-2">
        <a
          href={currentLink!}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-green hover:opacity-80 transition-opacity truncate"
        >
          Group chat linked
        </a>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-gray hover:text-white transition-colors"
        >
          Edit
        </button>
      </div>
    )
  }

  // Parent / Coach: show join button if link exists
  if (!currentLink) return null

  return (
    <a
      href={currentLink}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-green/10 border border-green/20 text-green font-bold text-sm px-4 py-3 rounded-xl hover:bg-green/20 transition-colors w-full justify-center"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Join {teamName} Parent Group Chat
    </a>
  )
}
