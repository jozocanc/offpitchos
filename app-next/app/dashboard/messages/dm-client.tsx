'use client'
import { dayKey, formatMonthDay, formatTime } from '@/lib/format-datetime'
import { useClubTimezone } from '@/components/club-timezone'

import { useEffect, useState, useRef } from 'react'
import { useToast, isPreviewBlocked, networkErrorMessage } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'
import Modal from '@/components/modal'
import { Skeleton } from '@/components/skeleton'
import EmptyState from '@/components/empty-state'
import {
  getDMThreads,
  getThreadMessages,
  sendDM,
  markThreadRead,
  getDMableUsers,
  unsendDM,
  type DMThread,
  type DMMessage,
  type DMableUser,
} from './dm-actions'

export default function DMClient({ initialOpenUserId }: { initialOpenUserId?: string }) {
  const timezone = useClubTimezone()
  const [threads, setThreads] = useState<DMThread[] | null>(null)
  const [openUserId, setOpenUserId] = useState<string | null>(initialOpenUserId ?? null)
  const [openUserName, setOpenUserName] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => { loadThreads() }, [])

  async function loadThreads() {
    const data = await getDMThreads().catch(() => null)
    if (!data) { setThreads(prev => prev ?? []); return }
    setThreads(data)
    // If we were deep-linked to a user that has no messages yet, we still
    // want to open the thread view.
    if (openUserId && !data.find(t => t.otherUserId === openUserId)) {
      // Need the name from the DMable-users list.
      const users = await getDMableUsers()
      const u = users.find(u => u.userId === openUserId)
      if (u) setOpenUserName(u.name)
    } else if (openUserId) {
      const t = data.find(t => t.otherUserId === openUserId)
      if (t) setOpenUserName(t.otherName)
    }
  }

  function openThread(userId: string, name: string) {
    setOpenUserId(userId)
    setOpenUserName(name)
  }

  if (openUserId) {
    return (
      <ThreadView
        otherUserId={openUserId}
        otherName={openUserName}
        onBack={() => {
          setOpenUserId(null)
          loadThreads()
        }}
      />
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray text-sm">
          {threads === null ? 'Loading…' : `${threads.length} conversation${threads.length === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          + New message
        </button>
      </div>

      {threads === null ? (
        <div className="space-y-2" role="status" aria-label="Loading conversations">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-3.5 w-3/4 mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          title="No direct messages yet"
          body="Message a coach or teammate one to one. Phone numbers stay private."
          action={{ label: '+ New message', onClick: () => setPickerOpen(true) }}
        />
      ) : (
        <div className="space-y-2">
          {threads.map(t => (
            <button
              key={t.otherUserId}
              type="button"
              onClick={() => openThread(t.otherUserId, t.otherName)}
              className="w-full text-left bg-dark-secondary rounded-xl p-4 border border-white/5 hover:border-green/40 transition-colors flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-green/10 text-green font-bold flex items-center justify-center shrink-0">
                {t.otherName.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white truncate">{t.otherName}</span>
                  <span className="text-xs text-gray shrink-0">{formatTimeShort(t.lastMessageAt, timezone)}</span>
                </div>
                <p className={`text-sm truncate mt-0.5 ${t.unreadCount > 0 && !t.lastFromMe ? 'text-white font-semibold' : 'text-gray'}`}>
                  {t.lastFromMe && <span className="text-gray">You: </span>}
                  {t.lastMessage}
                </p>
              </div>
              {t.unreadCount > 0 && !t.lastFromMe && (
                <span className="bg-green text-dark text-xs font-bold rounded-full px-2 py-0.5 shrink-0 self-center">
                  {t.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {pickerOpen && (
        <NewMessagePicker
          onClose={() => setPickerOpen(false)}
          onPick={(u) => {
            setPickerOpen(false)
            openThread(u.userId, u.name)
          }}
        />
      )}
    </>
  )
}

// A message the viewer just sent: shows instantly as "Sending…", is replaced
// by the server copy once it lands, or stays as "Not sent" with Retry.
interface PendingDM {
  tempId: string
  content: string
  createdAt: string
  status: 'sending' | 'failed'
  error?: string
}

function ThreadView({
  otherUserId,
  otherName,
  onBack,
}: {
  otherUserId: string
  otherName: string
  onBack: () => void
}) {
  const timezone = useClubTimezone()
  const [messages, setMessages] = useState<DMMessage[] | null>(null)
  const [pending, setPending] = useState<PendingDM[]>([])
  const [unsending, setUnsending] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    loadAndMarkRead()
    const interval = setInterval(loadAndMarkRead, 8000) // Lightweight polling.
    return () => clearInterval(interval)
  }, [otherUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAndMarkRead() {
    // Polling: a dropped request just waits for the next tick.
    const data = await getThreadMessages(otherUserId).catch(() => null)
    if (!data) { setMessages(prev => prev ?? []); return }
    setMessages(data)
    await markThreadRead(otherUserId).catch(() => {})
  }

  useEffect(() => {
    // Scroll to newest message on update.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, pending])

  async function deliver(content: string, tempId: string) {
    setPending(prev => [
      ...prev.filter(p => p.tempId !== tempId),
      { tempId, content, createdAt: new Date().toISOString(), status: 'sending' },
    ])
    let error: string | undefined
    try {
      error = (await sendDM(otherUserId, content)).error
    } catch {
      error = networkErrorMessage()
    }
    if (error) {
      if (isPreviewBlocked(error)) {
        setPending(prev => prev.filter(p => p.tempId !== tempId))
        setText(t => t || content)
        toast(error, 'error')
        return
      }
      setPending(prev => prev.map(p => p.tempId === tempId ? { ...p, status: 'failed', error } : p))
      return
    }
    await loadAndMarkRead()
    setPending(prev => prev.filter(p => p.tempId !== tempId))
  }

  function handleSend() {
    const content = text.trim()
    if (!content) return
    setText('')
    void deliver(content, `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  }

  async function handleUnsend(id: string) {
    const ok = await confirm({
      title: 'Unsend this message?',
      message: `It disappears for ${otherName} too.`,
      confirmLabel: 'Unsend',
      destructive: true,
    })
    if (!ok) return
    setUnsending(prev => new Set(prev).add(id))
    let error: string | undefined
    try {
      error = (await unsendDM(id)).error
    } catch {
      error = networkErrorMessage()
    }
    if (error) toast(error, 'error')
    await loadAndMarkRead()
    setUnsending(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-14rem)] md:h-[calc(100vh-12rem)] max-h-[700px]">
      <div className="flex items-center gap-3 pb-4 border-b border-white/5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="text-gray hover:text-white text-sm px-2 py-1 -ml-2 rounded-lg"
        >← Back</button>
        <div className="w-10 h-10 rounded-full bg-green/10 text-green font-bold flex items-center justify-center" aria-hidden="true">
          {otherName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2 className="font-bold text-white">{otherName}</h2>
          <p className="text-xs text-gray">Private. Phone numbers stay hidden.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-2" aria-live="polite">
        {messages === null ? (
          <div className="space-y-3" role="status" aria-label="Loading messages">
            <div className="flex justify-start"><Skeleton className="h-10 w-48 rounded-2xl" /></div>
            <div className="flex justify-end"><Skeleton className="h-10 w-40 rounded-2xl" /></div>
            <div className="flex justify-start"><Skeleton className="h-14 w-56 rounded-2xl" /></div>
          </div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <div className="text-center text-gray text-sm py-12">
            No messages yet. Say hi.
          </div>
        ) : (
          <>
            {messages.filter(m => !unsending.has(m.id)).map(m => (
              <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm group relative ${
                    m.isMine
                      ? 'bg-green text-dark rounded-br-sm'
                      : 'bg-dark-secondary text-white rounded-bl-sm border border-white/5'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <div className={`flex items-center gap-2 mt-1 text-[10px] ${m.isMine ? 'text-dark/60' : 'text-gray'}`}>
                    <span>{formatTimeShort(m.createdAt, timezone)}</span>
                    {m.isMine && (
                      <button
                        type="button"
                        onClick={() => handleUnsend(m.id)}
                        className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:underline"
                      >
                        unsend
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {pending.map(p => (
              <div key={p.tempId} className="flex flex-col items-end">
                <div
                  className={`max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2 text-sm ${
                    p.status === 'failed'
                      ? 'bg-red/10 text-white border border-red/30'
                      : 'bg-green text-dark opacity-70'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{p.content}</p>
                  <p className={`mt-1 text-[10px] ${p.status === 'failed' ? 'text-red' : 'text-dark/60'}`}>
                    {p.status === 'sending' ? 'Sending…' : 'Not sent'}
                  </p>
                </div>
                {p.status === 'failed' && (
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    {p.error && <span className="text-red">{p.error}</span>}
                    <button type="button" onClick={() => void deliver(p.content, p.tempId)} className="font-bold text-green hover:underline">
                      Retry
                    </button>
                    <button type="button" onClick={() => setPending(prev => prev.filter(x => x.tempId !== p.tempId))} className="text-gray hover:text-white">
                      Discard
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t border-white/5 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <label htmlFor="dm-input" className="sr-only">Message {otherName}</label>
        <textarea
          id="dm-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type a message…"
          rows={1}
          maxLength={2000}
          className="flex-1 bg-dark-secondary border border-white/10 rounded-xl px-4 py-2.5 text-base sm:text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors resize-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim()}
          className="bg-green text-dark font-bold px-5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
      {confirmDialog}
    </div>
  )
}

function NewMessagePicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (u: DMableUser) => void
}) {
  const [users, setUsers] = useState<DMableUser[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getDMableUsers().then(setUsers).catch(() => setUsers([]))
  }, [])

  const filtered = (users ?? []).filter(u =>
    !query || u.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <Modal title="New message" onClose={onClose} bodyClassName="p-5 pb-2">
      <div className="sticky top-0 z-10 bg-dark-secondary -mx-5 px-5 pb-4 border-b border-white/5">
        <label htmlFor="dm-search" className="sr-only">Search by name</label>
        <input
          id="dm-search"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-base sm:text-sm text-white placeholder-gray focus:outline-none focus:border-green"
        />
      </div>
      <div className="-mx-5">
        {users === null ? (
          <div className="p-4 space-y-3" role="status" aria-label="Loading people">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24 mt-1.5" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-gray text-sm p-6 text-center">
            {users.length === 0 ? 'No one to message yet. Once coaches and players join your team, they show up here.' : 'No one matches that name.'}
          </div>
        ) : (
          filtered.map(u => (
            <button
              key={u.userId}
              type="button"
              onClick={() => onPick(u)}
              className="w-full text-left px-5 py-4 border-b border-white/5 hover:bg-white/5 transition-colors flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-green/10 text-green font-bold flex items-center justify-center shrink-0" aria-hidden="true">
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{u.name}</p>
                <p className="text-gray text-xs truncate">
                  {u.role}{u.teams.length > 0 ? ` · ${u.teams.join(', ')}` : ''}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}

function formatTimeShort(iso: string, timeZone: string): string {
  const d = new Date(iso)
  // "Same day" is judged in the club's zone too — toDateString() would compare
  // against the runtime's day boundary, which is a different instant on the
  // server than in the browser.
  const sameDay = dayKey(d, timeZone) === dayKey(new Date(), timeZone)
  if (sameDay) return formatTime(d, timeZone)
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short', timeZone })
  return formatMonthDay(d, timeZone)
}
