'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
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
  const [threads, setThreads] = useState<DMThread[] | null>(null)
  const [openUserId, setOpenUserId] = useState<string | null>(initialOpenUserId ?? null)
  const [openUserName, setOpenUserName] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => { loadThreads() }, [])

  async function loadThreads() {
    const data = await getDMThreads()
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
          onClick={() => setPickerOpen(true)}
          className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          + New message
        </button>
      </div>

      {threads === null ? (
        <div className="text-gray text-sm">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
          <p className="text-gray text-lg">No direct messages yet.</p>
          <p className="text-gray text-sm mt-1">
            Start a conversation — phone numbers stay private.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map(t => (
            <button
              key={t.otherUserId}
              onClick={() => openThread(t.otherUserId, t.otherName)}
              className="w-full text-left bg-dark-secondary rounded-xl p-4 border border-white/5 hover:border-green/40 transition-colors flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-green/10 text-green font-bold flex items-center justify-center shrink-0">
                {t.otherName.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white truncate">{t.otherName}</span>
                  <span className="text-xs text-gray shrink-0">{formatTimeShort(t.lastMessageAt)}</span>
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

function ThreadView({
  otherUserId,
  otherName,
  onBack,
}: {
  otherUserId: string
  otherName: string
  onBack: () => void
}) {
  const [messages, setMessages] = useState<DMMessage[] | null>(null)
  const [text, setText] = useState('')
  const [isSending, startSend] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAndMarkRead()
    const interval = setInterval(loadAndMarkRead, 8000) // Lightweight polling.
    return () => clearInterval(interval)
  }, [otherUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAndMarkRead() {
    const data = await getThreadMessages(otherUserId)
    setMessages(data)
    await markThreadRead(otherUserId)
  }

  useEffect(() => {
    // Scroll to newest message on update.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function handleSend() {
    const content = text.trim()
    if (!content) return
    setError(null)
    startSend(async () => {
      const result = await sendDM(otherUserId, content)
      if (result.error) {
        setError(result.error)
        return
      }
      setText('')
      await loadAndMarkRead()
    })
  }

  function handleUnsend(id: string) {
    if (!confirm('Unsend this message?')) return
    startSend(async () => {
      const result = await unsendDM(id)
      if (result.error) alert(result.error)
      await loadAndMarkRead()
    })
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100vh-10rem)]">
      <div className="flex items-center gap-3 pb-4 border-b border-white/5 shrink-0">
        <button
          onClick={onBack}
          className="text-gray hover:text-white text-sm"
        >← Back</button>
        <div className="w-10 h-10 rounded-full bg-green/10 text-green font-bold flex items-center justify-center">
          {otherName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2 className="font-bold text-white">{otherName}</h2>
          <p className="text-xs text-gray">Private — phone numbers stay hidden</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-2">
        {messages === null ? (
          <div className="text-gray text-sm">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray text-sm py-12">
            No messages yet. Say hi.
          </div>
        ) : (
          messages.map(m => (
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
                  <span>{formatTimeShort(m.createdAt)}</span>
                  {m.isMine && (
                    <button
                      onClick={() => handleUnsend(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                    >
                      unsend
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="text-red text-sm mb-2 shrink-0">{error}</p>}

      <div className="flex gap-2 pt-3 border-t border-white/5 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <textarea
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
          className="flex-1 bg-dark-secondary border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors resize-none"
        />
        <button
          onClick={handleSend}
          disabled={isSending || !text.trim()}
          className="bg-green text-dark font-bold px-5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
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
    getDMableUsers().then(setUsers)
  }, [])

  const filtered = (users ?? []).filter(u =>
    !query || u.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark border border-white/10 rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h2 className="font-bold text-white">New message</h2>
          <button onClick={onClose} className="text-gray hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 border-b border-white/5">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-dark-secondary border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {users === null ? (
            <div className="text-gray text-sm p-6">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-gray text-sm p-6 text-center">
              {users.length === 0 ? 'No one to message yet.' : 'No matches.'}
            </div>
          ) : (
            filtered.map(u => (
              <button
                key={u.userId}
                onClick={() => onPick(u)}
                className="w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-green/10 text-green font-bold flex items-center justify-center shrink-0">
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
      </div>
    </div>
  )
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
