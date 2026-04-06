'use client'

import { useState, useEffect } from 'react'
import { getAiLog } from './actions'

interface LogEntry {
  id: string
  question: string
  answer: string
  created_at: string
  profiles: { display_name: string } | null
}

export default function AiLogClient() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (!showLog) return
    setLoading(true)
    getAiLog()
      .then(data => setEntries(data as LogEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [showLog])

  return (
    <div className="mb-6">
      <button
        onClick={() => setShowLog(!showLog)}
        className="text-sm text-gray hover:text-white transition-colors flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        {showLog ? 'Hide' : 'View'} AI Chat Log
      </button>

      {showLog && (
        <div className="mt-4 bg-white/5 border border-white/10 rounded-xl max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray text-sm">Loading log...</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-gray text-sm">No AI chats yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map(entry => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-green">{entry.profiles?.display_name ?? 'Unknown'}</span>
                    <span className="text-xs text-gray">
                      {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 mb-1">Q: {entry.question}</p>
                  <p className="text-sm text-gray">A: {entry.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
