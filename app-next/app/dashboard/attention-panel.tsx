'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getAttentionList, type AttentionItem, type AttentionResult } from './attention-actions'

const URGENCY_STYLES: Record<AttentionItem['urgency'], { dot: string; label: string; labelColor: string; border: string }> = {
  critical: {
    dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    label: 'Critical',
    labelColor: 'text-red-400',
    border: 'border-red-500/20 hover:border-red-500/40',
  },
  important: {
    dot: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]',
    label: 'Important',
    labelColor: 'text-yellow-400',
    border: 'border-yellow-500/15 hover:border-yellow-500/30',
  },
  routine: {
    dot: 'bg-gray',
    label: 'FYI',
    labelColor: 'text-gray',
    border: 'border-white/5 hover:border-green/20',
  },
}

export default function AttentionPanel() {
  const [data, setData] = useState<AttentionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const result = await getAttentionList(timeZone)
      setData(result)
    } catch {
      setError('Could not load attention list.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green animate-pulse" />
          Needs your attention
          {data && data.items.length > 0 && (
            <span className="text-sm font-bold text-green">— {data.items.length}</span>
          )}
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-gray hover:text-white transition-colors disabled:opacity-50"
          aria-label="Refresh attention list"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-dark-secondary rounded-xl p-4 border border-white/5 animate-pulse">
              <div className="h-4 w-1/3 bg-white/10 rounded mb-2" />
              <div className="h-3 w-2/3 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-dark-secondary rounded-xl p-4 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && data && data.items.length === 0 && data.totalSignals === 0 && (
        <div className="bg-dark-secondary rounded-xl p-5 border border-white/5 text-center">
          <p className="text-gray text-sm">All clear. Nothing urgent right now.</p>
        </div>
      )}

      {!loading && data && data.items.length === 0 && data.totalSignals > 0 && (
        <div className="bg-dark-secondary rounded-xl p-5 border border-white/5 text-center">
          <p className="text-gray text-sm">Looks quiet. Check back soon.</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="space-y-2">
          {data.items.map(item => {
            const style = URGENCY_STYLES[item.urgency] ?? URGENCY_STYLES.routine
            return (
              <Link
                key={item.id}
                href={item.actionHref || '/dashboard'}
                className={`bg-dark-secondary rounded-xl p-4 border transition-all flex items-start gap-3 group ${style.border}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full mt-2 shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-bold text-sm text-white">{item.title}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${style.labelColor}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-gray text-sm">{item.description}</p>
                </div>
                <span className="text-xs font-bold text-green opacity-60 group-hover:opacity-100 transition-opacity shrink-0 self-center">
                  {item.actionLabel} →
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
