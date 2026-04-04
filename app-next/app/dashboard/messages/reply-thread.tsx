'use client'

import { useState, useTransition, useEffect } from 'react'
import { getAnnouncementReplies, createReply, deleteReply } from './actions'

interface Reply {
  id: string
  body: string
  created_at: string
  author: { id: string; display_name: string | null }[] | null
}

interface ReplyThreadProps {
  announcementId: string
  userProfileId: string
  userRole: string
}

export default function ReplyThread({ announcementId, userProfileId, userRole }: ReplyThreadProps) {
  const [replies, setReplies] = useState<Reply[]>([])
  const [replyText, setReplyText] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    loadReplies()
  }, [announcementId])

  async function loadReplies() {
    const data = await getAnnouncementReplies(announcementId)
    setReplies(data)
  }

  function handleSubmitReply() {
    if (!replyText.trim()) return
    startTransition(async () => {
      await createReply(announcementId, replyText)
      setReplyText('')
      await loadReplies()
    })
  }

  function handleDelete(replyId: string) {
    startTransition(async () => {
      await deleteReply(replyId)
      await loadReplies()
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

  function canDelete(reply: Reply): boolean {
    const authorId = Array.isArray(reply.author) ? reply.author[0]?.id : (reply.author as any)?.id
    return authorId === userProfileId || userRole === 'doc'
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      {replies.length > 0 && (
        <div className="space-y-3 mb-4">
          {replies.map(reply => {
            const author = Array.isArray(reply.author) ? reply.author[0] : reply.author
            return (
              <div key={reply.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {author?.display_name ?? 'Unknown'}
                    </span>
                    <span className="text-xs text-gray">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray mt-1">{reply.body}</p>
                </div>
                {canDelete(reply) && (
                  <button
                    onClick={() => handleDelete(reply.id)}
                    disabled={isPending}
                    className="text-xs text-gray hover:text-red transition-colors shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitReply() } }}
          placeholder="Write a reply..."
          className="flex-1 bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
        />
        <button
          onClick={handleSubmitReply}
          disabled={isPending || !replyText.trim()}
          className="bg-green text-dark font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? '...' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
