'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { togglePin, deleteAnnouncement, markAnnouncementRead, respondToPoll } from './actions'
import ReplyThread from './reply-thread'
import { useToast } from '@/components/toast'

interface PollKid {
  playerId: string
  firstName: string
  lastName: string
  response: 'yes' | 'no' | 'maybe' | null
}

interface AnnouncementCardProps {
  announcement: {
    id: string
    team_id: string | null
    title: string
    body: string
    pinned: boolean
    created_at: string
    author: any
    teams: any
    announcement_replies: any[]
    read_count?: number
    total_recipients?: number
    own_read?: boolean
    poll_enabled?: boolean
    poll_tally?: { yes: number; no: number; maybe: number; totalKids: number } | null
    my_kids?: PollKid[]
  }
  userProfileId: string
  userRole: string
}

export default function AnnouncementCard({ announcement, userProfileId, userRole }: AnnouncementCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [locallyRead, setLocallyRead] = useState(announcement.own_read ?? true)
  const [isPending, startTransition] = useTransition()
  const [kids, setKids] = useState<PollKid[]>(announcement.my_kids ?? [])
  const [respondingKidId, setRespondingKidId] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  function handleExpand() {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    // On first open of an unread card, mark read on the server
    if (nextExpanded && !locallyRead) {
      setLocallyRead(true)
      // Fire and forget — the user's local state already shows as read
      markAnnouncementRead(announcement.id).catch(() => {
        // Silent — if this fails, the next page load will reflect actual state
      })
    }
  }

  const author = Array.isArray(announcement.author) ? announcement.author[0] : announcement.author
  const team = Array.isArray(announcement.teams) ? announcement.teams[0] : announcement.teams
  const replyCount = announcement.announcement_replies?.length ?? 0
  const isDoc = userRole === 'doc'
  const isAuthor = author?.id === userProfileId
  const isParent = userRole === 'parent'
  const readCount = announcement.read_count ?? 0
  const totalRecipients = announcement.total_recipients ?? 0
  const showReadReceipt = isAuthor && totalRecipients > 0
  const pollEnabled = announcement.poll_enabled ?? false
  const tally = announcement.poll_tally
  const unanswered = tally ? Math.max(0, tally.totalKids - tally.yes - tally.no - tally.maybe) : 0

  function handlePollResponse(playerId: string, response: 'yes' | 'no' | 'maybe') {
    setRespondingKidId(playerId)
    // Optimistic local update
    setKids(prev => prev.map(k => k.playerId === playerId ? { ...k, response } : k))
    startTransition(async () => {
      const result = await respondToPoll(announcement.id, playerId, response)
      setRespondingKidId(null)
      if (result.error) {
        toast(result.error, 'error')
        // Revert
        setKids(announcement.my_kids ?? [])
        return
      }
      router.refresh()
    })
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  function handlePin() {
    startTransition(async () => {
      await togglePin(announcement.id)
    })
  }

  function handleDelete() {
    if (!confirm('Delete this announcement and all its replies?')) return
    startTransition(async () => {
      await deleteAnnouncement(announcement.id)
    })
  }

  const preview = announcement.body.length > 150
    ? announcement.body.slice(0, 150) + '...'
    : announcement.body

  const fullDate = new Date(announcement.created_at).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  return (
    <div className={`bg-dark-secondary rounded-xl p-4 border ${announcement.pinned ? 'border-green/20' : 'border-white/5'} hover:border-green/10 transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 cursor-pointer select-none" onClick={handleExpand}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Real unread dot — only shows for non-authors who haven't opened this */}
            {!locallyRead && !isAuthor && (
              <span className="w-2 h-2 rounded-full bg-green shrink-0" title="Unread" />
            )}
            {team ? (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                {team.age_group ?? team.name}
              </span>
            ) : (
              <span className="text-xs font-bold bg-white/10 text-white px-2 py-0.5 rounded-full">
                All Teams
              </span>
            )}
            {announcement.pinned && (
              <span className="text-xs text-green" title="Pinned">Pinned</span>
            )}
            <span className="text-xs text-gray" title={fullDate}>{timeAgo(announcement.created_at)}</span>
          </div>
          <p className="font-bold text-white">{announcement.title}</p>
          <p className="text-gray text-sm mt-1">
            {expanded ? announcement.body : preview}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <p className="text-xs text-gray">
              {author?.display_name ?? 'Unknown'} &middot; {replyCount} repl{replyCount !== 1 ? 'ies' : 'y'}
            </p>
            {showReadReceipt && (
              <>
                <span className="text-xs text-gray">·</span>
                <p
                  className={`text-xs font-semibold ${
                    readCount === totalRecipients ? 'text-green' : 'text-gray'
                  }`}
                  title={`${readCount} of ${totalRecipients} recipients have opened this announcement`}
                >
                  {readCount === totalRecipients && readCount > 0 ? '✓ ' : ''}
                  {readCount} of {totalRecipients} seen
                </p>
              </>
            )}
            <span className={`text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {isDoc && (
            <button
              onClick={handlePin}
              disabled={isPending}
              className="text-gray hover:text-green text-sm transition-colors"
              title={announcement.pinned ? 'Unpin' : 'Pin'}
            >
              {announcement.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {(isDoc || isAuthor) && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-gray hover:text-red text-sm transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {pollEnabled && (
        <div className="mt-4 pt-4 border-t border-white/5">
          {/* Author/DOC see the tally */}
          {(isAuthor || isDoc) && tally && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray mb-2">Responses</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-green/15 text-green px-2.5 py-1 rounded-full font-semibold">
                  {tally.yes} Yes
                </span>
                <span className="bg-red/15 text-red px-2.5 py-1 rounded-full font-semibold">
                  {tally.no} No
                </span>
                <span className="bg-yellow-500/15 text-yellow-400 px-2.5 py-1 rounded-full font-semibold">
                  {tally.maybe} Maybe
                </span>
                <span className="bg-white/5 text-gray px-2.5 py-1 rounded-full">
                  {unanswered} not answered
                </span>
                <span className="text-gray py-1 ml-auto">
                  {tally.yes + tally.no + tally.maybe} of {tally.totalKids} kids
                </span>
              </div>
            </div>
          )}

          {/* Parents see per-kid buttons */}
          {isParent && kids.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray">Your response</p>
              {kids.map(kid => (
                <div key={kid.playerId} className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm text-white font-medium min-w-[120px]">
                    {kid.firstName} {kid.lastName}
                  </p>
                  <div className="flex gap-1.5 flex-1">
                    {(['yes', 'no', 'maybe'] as const).map(opt => {
                      const selected = kid.response === opt
                      const styles =
                        opt === 'yes'
                          ? selected ? 'bg-green text-dark' : 'bg-white/5 text-gray hover:text-green'
                          : opt === 'no'
                            ? selected ? 'bg-red text-dark' : 'bg-white/5 text-gray hover:text-red'
                            : selected ? 'bg-yellow-500 text-dark' : 'bg-white/5 text-gray hover:text-yellow-400'
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={respondingKidId === kid.playerId}
                          onClick={() => handlePollResponse(kid.playerId, opt)}
                          className={`flex-1 text-xs font-semibold py-2 rounded-lg capitalize transition-colors disabled:opacity-50 ${styles}`}
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Parents with no kids on this team (e.g., club-wide announcement, wrong team) */}
          {isParent && kids.length === 0 && (
            <p className="text-xs text-gray italic">
              No kids linked for this announcement.
            </p>
          )}
        </div>
      )}

      {expanded && (
        <ReplyThread
          announcementId={announcement.id}
          userProfileId={userProfileId}
          userRole={userRole}
        />
      )}
    </div>
  )
}
