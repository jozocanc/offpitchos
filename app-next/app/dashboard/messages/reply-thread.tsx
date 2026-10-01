'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { getAnnouncementReplies, createReply, deleteReply } from './actions'
import { useToast, isPreviewBlocked, networkErrorMessage } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'
import { Skeleton } from '@/components/skeleton'

interface Reply {
  id: string
  body: string
  created_at: string
  author: { id: string; display_name: string | null }[] | null
}

// A reply the viewer just posted. It shows at once as "Sending…", then is
// replaced by the server copy on success or flagged "Not sent" with Retry.
interface LocalReply {
  tempId: string
  body: string
  createdAt: string
  status: 'sending' | 'failed'
  error?: string
}

interface ReplyThreadProps {
  announcementId: string
  userProfileId: string
  userRole: string
}

export default function ReplyThread({ announcementId, userProfileId, userRole }: ReplyThreadProps) {
  const [replies, setReplies] = useState<Reply[] | null>(null)
  const [local, setLocal] = useState<LocalReply[]>([])
  const [replyText, setReplyText] = useState('')
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const loadReplies = useCallback(async () => {
    const res = await getAnnouncementReplies(announcementId)
      .catch(() => ({ ok: false as const, error: networkErrorMessage() }))
    if (!res.ok) { toast(res.error, 'error'); setReplies(prev => prev ?? []); return }
    setReplies(res.data as Reply[])
  }, [announcementId, toast])

  useEffect(() => {
    loadReplies()
  }, [loadReplies])

  function send(body: string, tempId: string) {
    setLocal(prev => {
      const rest = prev.filter(r => r.tempId !== tempId)
      return [...rest, { tempId, body, createdAt: new Date().toISOString(), status: 'sending' }]
    })
    startTransition(async () => {
      const r = await createReply(announcementId, body)
        .catch(() => ({ ok: false as const, error: networkErrorMessage() }))
      if (!r.ok) {
        const error = r.error
        if (isPreviewBlocked(error)) {
          setLocal(prev => prev.filter(x => x.tempId !== tempId))
          toast(error, 'error')
          return
        }
        setLocal(prev => prev.map(x => x.tempId === tempId ? { ...x, status: 'failed', error } : x))
        return
      }
      await loadReplies()
      setLocal(prev => prev.filter(x => x.tempId !== tempId))
    })
  }

  function handleSubmitReply() {
    const body = replyText.trim()
    if (!body) return
    setReplyText('')
    send(body, `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  }

  async function handleDelete(replyId: string) {
    const ok = await confirm({
      title: 'Delete this reply?',
      message: 'It is removed for everyone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingIds(prev => new Set(prev).add(replyId))
    startTransition(async () => {
      const r = await deleteReply(replyId)
        .catch(() => ({ ok: false as const, error: networkErrorMessage() }))
      setDeletingIds(prev => { const n = new Set(prev); n.delete(replyId); return n })
      if (!r.ok) { toast(r.error, 'error'); return }
      setReplies(prev => (prev ?? []).filter(x => x.id !== replyId))
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
    const authorId = Array.isArray(reply.author) ? reply.author[0]?.id : (reply.author as { id?: string } | null)?.id
    return authorId === userProfileId || userRole === 'doc'
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      {replies === null ? (
        <div className="space-y-3 mb-4" aria-hidden="true">
          {[1, 2].map(i => (
            <div key={i}>
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-3/4 mt-2" />
            </div>
          ))}
        </div>
      ) : (replies.length > 0 || local.length > 0) && (
        <ul className="space-y-3 mb-4" aria-live="polite">
          {replies.filter(r => !deletingIds.has(r.id)).map(reply => {
            const author = Array.isArray(reply.author) ? reply.author[0] : reply.author
            return (
              <li key={reply.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {author?.display_name ?? 'Unknown'}
                    </span>
                    <span className="text-xs text-gray">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray mt-1 whitespace-pre-wrap break-words">{reply.body}</p>
                </div>
                {canDelete(reply) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(reply.id)}
                    className="text-xs text-gray hover:text-red transition-colors shrink-0 px-1 py-0.5 rounded"
                  >
                    Delete
                  </button>
                )}
              </li>
            )
          })}
          {local.map(r => (
            <li key={r.tempId} className={`flex items-start gap-3 ${r.status === 'sending' ? 'opacity-70' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">You</span>
                  {r.status === 'sending' ? (
                    <span className="text-xs text-gray">Sending…</span>
                  ) : (
                    <span className="text-xs font-semibold text-red">Not sent</span>
                  )}
                </div>
                <p className="text-sm text-gray mt-1 whitespace-pre-wrap break-words">{r.body}</p>
                {r.status === 'failed' && (
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    {r.error && <span className="text-red">{r.error}</span>}
                    <button type="button" onClick={() => send(r.body, r.tempId)} className="font-bold text-green hover:underline">
                      Retry
                    </button>
                    <button type="button" onClick={() => setLocal(prev => prev.filter(x => x.tempId !== r.tempId))} className="text-gray hover:text-white">
                      Discard
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); handleSubmitReply() }}
      >
        <label htmlFor={`reply-${announcementId}`} className="sr-only">Write a reply</label>
        <input
          id={`reply-${announcementId}`}
          type="text"
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          placeholder="Write a reply…"
          className="flex-1 bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-base sm:text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
        />
        <button
          type="submit"
          disabled={!replyText.trim()}
          className="bg-green text-dark font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Reply
        </button>
      </form>
      {confirmDialog}
    </div>
  )
}
