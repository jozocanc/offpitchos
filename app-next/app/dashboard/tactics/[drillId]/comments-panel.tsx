'use client'

/**
 * CommentsPanel
 *
 * Threaded comments section displayed below the properties panel in the editor
 * and below the field in the readonly view.  Authors and DOCs can delete their
 * own comments.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import type { DrillComment } from './actions'
import { listDrillComments, postDrillComment, deleteDrillComment } from './actions'

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  drillId: string
  /** Current user's profile id — used to determine whether to show the delete button */
  currentProfileId?: string
  /** Whether the current user is a DOC (can delete any comment) */
  isDoc?: boolean
  /** If true, hide the "Post" textarea and only show existing comments */
  readonly?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommentsPanel({
  drillId,
  currentProfileId,
  isDoc = false,
  readonly = false,
}: Props) {
  const [comments, setComments] = useState<DrillComment[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    listDrillComments(drillId)
      .then(c => { setComments(c); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [drillId])

  useEffect(() => { load() }, [load])

  const handlePost = useCallback(async () => {
    const trimmed = body.trim()
    if (!trimmed) return
    setPosting(true)
    setError(null)
    try {
      await postDrillComment(drillId, trimmed)
      setBody('')
      load()
      // Scroll to bottom after small delay
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (e) {
      setError('Failed to post comment.')
      console.error(e)
    } finally {
      setPosting(false)
    }
  }, [drillId, body, load])

  const handleDelete = useCallback(async (commentId: string) => {
    try {
      await deleteDrillComment(commentId)
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handlePost()
    }
  }, [handlePost])

  const canDelete = (comment: DrillComment) =>
    isDoc || (currentProfileId && comment.author_id === currentProfileId)

  return (
    <div className="flex flex-col gap-2">
      {/* Section header */}
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-gray/90">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green/70">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Comments</span>
        {comments.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/8 text-gray text-[9px] font-bold tabular-nums">
            {comments.length}
          </span>
        )}
        <span className="flex-1 h-px bg-white/10 ml-1" />
      </div>

      {/* Comment list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {loading && (
          <div className="text-gray text-xs py-2">Loading…</div>
        )}
        {!loading && comments.length === 0 && (
          <div className="text-gray/60 text-xs py-2 italic">No comments yet.</div>
        )}
        {comments.map(c => (
          <div key={c.id} className="group bg-dark rounded-lg px-3 py-2 border border-white/5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-white/90 truncate">
                {c.author_name}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] text-gray/60 tabular-nums">{relativeTime(c.created_at)}</span>
                {canDelete(c) && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    title="Delete comment"
                    className="w-5 h-5 rounded flex items-center justify-center text-gray/40 hover:text-red hover:bg-red/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray leading-relaxed whitespace-pre-wrap break-words">
              {c.body}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="text-red text-xs">{error}</div>
      )}

      {/* Post form */}
      {!readonly && (
        <div className="space-y-1.5">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment… (⌘↵ to post)"
            rows={2}
            maxLength={2000}
            className="w-full bg-dark border border-white/10 focus:border-green/50 outline-none rounded px-2.5 py-2 text-xs text-white resize-none placeholder:text-gray/40 transition-colors"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray/50 tabular-nums">
              {body.length}/2000
            </span>
            <button
              onClick={handlePost}
              disabled={posting || !body.trim()}
              className={[
                'px-3 py-1.5 rounded text-xs font-medium border transition-colors',
                posting || !body.trim()
                  ? 'border-white/10 text-gray/40 cursor-not-allowed'
                  : 'border-green/40 text-green hover:bg-green/10',
              ].join(' ')}
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
