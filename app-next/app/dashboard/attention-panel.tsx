'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getAttentionList, type AttentionItem, type AttentionResult } from './attention-actions'
import { requestMissingSizes } from './gear/actions'
import { resendInvite } from './coaches/actions'
import { useToast } from '@/components/toast'

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.round((now - then) / 1000))
  if (diffSec < 30) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

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
  const [pendingSignal, setPendingSignal] = useState<string | null>(null)
  const [completedSignals, setCompletedSignals] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const result = await getAttentionList(timeZone, forceRefresh)
      setData(result)
    } catch {
      setError('Could not load attention list.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleGearRequest = useCallback(async (signalId: string) => {
    if (pendingSignal) return
    setPendingSignal(signalId)
    try {
      const result = await requestMissingSizes()
      if (result.alreadyComplete) {
        toast('All sizes already submitted', 'success')
      } else if (result.parentsNotified === 0) {
        toast('No parents with notifications enabled', 'error')
      } else {
        toast(`Requested sizes from ${result.parentsNotified} ${result.parentsNotified === 1 ? 'parent' : 'parents'}`, 'success')
      }
      setCompletedSignals(prev => new Set(prev).add(signalId))
    } catch (err: any) {
      toast(err?.message ?? 'Failed to send request', 'error')
    } finally {
      setPendingSignal(null)
    }
  }, [pendingSignal, toast])

  const handleResendInvite = useCallback(async (signalId: string, inviteId: string) => {
    if (pendingSignal) return
    setPendingSignal(signalId)
    try {
      const result = await resendInvite(inviteId)
      if (result.emailSent) {
        toast('Invite email resent', 'success')
      } else {
        toast(
          `Invite refreshed — but the email didn't send. Copy the join link from Pending Invites below and share it directly.`,
          'error',
        )
      }
      setCompletedSignals(prev => new Set(prev).add(signalId))
      // Refresh after a short delay so the toast is visible
      setTimeout(() => load(true), 600)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to resend invite', 'error')
    } finally {
      setPendingSignal(null)
    }
  }, [pendingSignal, toast, load])

  useEffect(() => {
    load(false)
  }, [load])

  // Re-render once a minute so "Updated X ago" stays current without re-fetching
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

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
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-gray">
              Updated {formatRelative(data.generatedAt)}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="text-xs text-gray hover:text-white transition-colors disabled:opacity-50"
            aria-label="Refresh attention list"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
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
            const isCompleted = completedSignals.has(item.id)
            const isPending = pendingSignal === item.id

            // Determine quick action based on signal type
            const isGearMissing = item.id === 'gear-missing'
            const isInvite = item.id.startsWith('invite-')
            const hasQuickAction = isGearMissing || isInvite

            let quickActionHandler: (() => void) | null = null
            let quickActionLabel = ''
            if (isGearMissing) {
              quickActionHandler = () => handleGearRequest(item.id)
              quickActionLabel = isCompleted ? '✓ Sent' : isPending ? 'Sending…' : 'Send request'
            } else if (isInvite) {
              const inviteId = item.id.replace('invite-', '')
              quickActionHandler = () => handleResendInvite(item.id, inviteId)
              quickActionLabel = isCompleted ? '✓ Resent' : isPending ? 'Resending…' : 'Resend'
            }

            return (
              <Link
                key={item.id}
                href={item.actionHref || '/dashboard'}
                className={`bg-dark-secondary rounded-xl p-4 border transition-all flex items-start gap-3 group ${style.border} ${isCompleted ? 'opacity-60' : ''}`}
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
                <div className="flex items-center gap-2 shrink-0 self-center">
                  {hasQuickAction && quickActionHandler && (
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        quickActionHandler!()
                      }}
                      disabled={isPending || isCompleted}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:cursor-not-allowed ${
                        isCompleted
                          ? 'bg-green/15 text-green border border-green/30'
                          : 'bg-green text-dark hover:opacity-90 disabled:opacity-60'
                      }`}
                    >
                      {quickActionLabel}
                    </button>
                  )}
                  <span className="text-xs font-bold text-green opacity-60 group-hover:opacity-100 transition-opacity">
                    {item.actionLabel} →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
