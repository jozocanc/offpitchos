'use client'

/**
 * HistoryModal
 *
 * Displays the last ≤10 auto-saved snapshots for a drill.  Each row shows a
 * relative timestamp and a Restore button.  Clicking Restore calls back to the
 * parent (editor-client) which loads the snapshot into undo history and triggers
 * an auto-save.
 */

import React, { useEffect, useState, useCallback } from 'react'
import type { DrillVersion } from './actions'
import { listDrillVersions } from './actions'
import type { BoardObject, Field } from '@/lib/tactics/object-schema'
import { DrillDocSchema } from '@/lib/tactics/object-schema'

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Tiny thumbnail canvas ────────────────────────────────────────────────────

function VersionThumbnail({ field, objects }: { field: unknown; objects: unknown }) {
  // Parse and validate — fall back gracefully if corrupt
  const parsed = DrillDocSchema.safeParse({ field, objects })

  if (!parsed.success) {
    return (
      <div className="w-16 h-10 rounded bg-dark flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] text-gray/50">—</span>
      </div>
    )
  }

  const objCount = parsed.data.objects.length

  return (
    <div className="w-16 h-10 rounded bg-dark border border-white/10 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
      {/* Schematic mini-field representation */}
      <div className="absolute inset-0 bg-[#2d6e42]/60 rounded" />
      <div className="absolute inset-[3px] border border-white/20 rounded-sm" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
      <span className="relative text-[9px] text-white/70 font-medium tabular-nums">
        {objCount}
      </span>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HistoryModalProps {
  drillId: string
  onClose: () => void
  onRestore: (field: Field, objects: BoardObject[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistoryModal({ drillId, onClose, onRestore }: HistoryModalProps) {
  const [versions, setVersions] = useState<DrillVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listDrillVersions(drillId)
      .then(v => { setVersions(v); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [drillId])

  const handleRestore = useCallback(async (v: DrillVersion) => {
    const parsed = DrillDocSchema.safeParse({ field: v.field, objects: v.objects })
    if (!parsed.success) {
      setError('Snapshot data is invalid — cannot restore.')
      return
    }
    setRestoringId(v.id)
    try {
      onRestore(parsed.data.field, parsed.data.objects)
      onClose()
    } catch {
      setError('Restore failed.')
    } finally {
      setRestoringId(null)
    }
  }, [onRestore, onClose])

  // Close on backdrop click
  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-dark-secondary border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green">
              <circle cx="12" cy="12" r="9"/>
              <polyline points="12 7 12 12 15 15"/>
            </svg>
            <span className="text-sm font-semibold text-white">Version history</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray hover:text-white w-7 h-7 rounded flex items-center justify-center hover:bg-dark transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[420px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray text-sm">
              Loading…
            </div>
          )}

          {!loading && error && (
            <div className="text-red text-sm py-4 text-center">{error}</div>
          )}

          {!loading && !error && versions.length === 0 && (
            <div className="text-gray text-sm py-6 text-center">
              No saved versions yet. Auto-saves appear here after changes.
            </div>
          )}

          {!loading && !error && versions.length > 0 && (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-dark border border-white/5 hover:border-white/10 transition-colors"
                >
                  <VersionThumbnail field={v.field} objects={v.objects} />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">
                      {i === 0 ? 'Latest save' : `Version ${versions.length - i}`}
                    </div>
                    <div className="text-[11px] text-gray mt-0.5 tabular-nums">
                      {relativeTime(v.saved_at)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestore(v)}
                    disabled={restoringId === v.id}
                    className={[
                      'px-3 py-1.5 rounded text-xs font-medium border transition-colors flex-shrink-0',
                      restoringId === v.id
                        ? 'opacity-50 cursor-not-allowed border-white/10 text-gray'
                        : 'border-green/40 text-green hover:bg-green/10',
                    ].join(' ')}
                  >
                    {restoringId === v.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/5 text-[11px] text-gray">
          Up to 10 most recent auto-saves are retained. Older ones are removed automatically.
        </div>
      </div>
    </div>
  )
}
