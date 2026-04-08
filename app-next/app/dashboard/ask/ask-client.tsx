'use client'

import { useState, useRef, useEffect } from 'react'
import { askQuestion } from './actions'

interface ChatMessage {
  id: string
  question: string
  answer: string
  created_at: string
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

export default function AskClient({ chatHistory, userRole }: { chatHistory: ChatMessage[]; userRole: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(chatHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function handleCopy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500)
    } catch {}
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setError(null)
    setLoading(true)

    // Optimistic: show the question immediately
    const tempId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: tempId, question, answer: '', created_at: new Date().toISOString() }])

    try {
      const { answer } = await askQuestion(question)
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, answer } : m)
      )
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-4">
        {messages.length === 0 && !loading && (
          <div className="text-center text-gray mt-20">
            <div className="text-4xl mb-4">⚽</div>
            <p className="text-lg font-medium text-white/80">Ask Ref anything about your club</p>
            <p className="text-sm mt-2">Schedule, teams, events, announcements — Ref has all the info.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                'What\'s the schedule this week?',
                'Who coaches U12?',
                'Any cancelled practices?',
                'When is the next game?',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="space-y-2">
            {/* User question */}
            <div className="flex flex-col items-end">
              <div className="bg-green/10 border border-green/20 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                <p className="text-white text-sm">{msg.question}</p>
              </div>
              <span className="text-[10px] text-gray mt-1 mr-1">{formatTimestamp(msg.created_at)}</span>
            </div>

            {/* AI answer */}
            {msg.answer ? (
              <div className="flex flex-col items-start group">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]">
                  <p className="text-white/90 text-sm whitespace-pre-wrap">{msg.answer}</p>
                </div>
                <button
                  onClick={() => handleCopy(msg.id, msg.answer)}
                  className="text-[10px] text-gray hover:text-white mt-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Copy answer"
                >
                  {copiedId === msg.id ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 max-w-[80%]">
                  <div className="flex items-center gap-2 text-sm text-gray">
                    <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="pt-4 border-t border-white/5">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about schedule, teams, events..."
            maxLength={500}
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray focus:outline-none focus:border-green/50 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-5 py-3 bg-green text-dark font-semibold rounded-xl text-sm hover:bg-green/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {loading ? '...' : 'Ask'}
          </button>
        </div>
        {input.length > 0 && (
          <div className="flex justify-end mt-1.5">
            <span className={`text-[10px] ${input.length > 450 ? 'text-yellow-400' : 'text-gray'}`}>
              {input.length} / 500
            </span>
          </div>
        )}
      </form>
    </div>
  )
}
