'use client'

import { useState, useEffect, useTransition } from 'react'
import { getAttendanceData, markAttendance, markBulkAttendance } from './attendance-actions'
import { addFeedback } from '../players/[id]/actions'
import { useToast } from '@/components/toast'

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
}

interface AttendanceModalProps {
  eventId: string
  teamId: string
  eventTitle: string
  onClose: () => void
}

type Status = 'present' | 'absent' | 'late' | 'excused'

const STATUS_COLORS: Record<Status, string> = {
  present: 'bg-green/20 text-green border-green/30',
  absent: 'bg-red/20 text-red border-red/30',
  late: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  excused: 'bg-gray/20 text-gray border-gray/30',
}

// Tracks per-player note UI state so we can show a collapsed "+ Note"
// button vs. an expanded editor vs. a saved confirmation without storing
// any of that in the main attendance map.
type NoteState =
  | { kind: 'idle' }
  | { kind: 'editing'; rating: number; notes: string }
  | { kind: 'saving' }
  | { kind: 'saved' }

export default function AttendanceModal({ eventId, teamId, eventTitle, onClose }: AttendanceModalProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  // Notes are a parallel map keyed by playerId so that toggling the editor
  // doesn't disturb the attendance marks the coach has already made.
  const [notes, setNotes] = useState<Record<string, NoteState>>({})
  const { toast } = useToast()

  useEffect(() => {
    getAttendanceData(eventId, teamId).then(data => {
      setPlayers(data.players)
      setAttendance(data.attendance)
      setLoading(false)
    })
  }, [eventId, teamId])

  function handleMark(playerId: string, status: Status) {
    setAttendance(prev => ({ ...prev, [playerId]: status }))
    startTransition(() => markAttendance(eventId, playerId, status))
  }

  function handleMarkAll(status: 'present' | 'absent') {
    const ids = players.map(p => p.id)
    const newAttendance: Record<string, string> = {}
    ids.forEach(id => { newAttendance[id] = status })
    setAttendance(prev => ({ ...prev, ...newAttendance }))
    startTransition(() => markBulkAttendance(eventId, ids, status))
  }

  function openNote(playerId: string) {
    setNotes(prev => ({
      ...prev,
      [playerId]: { kind: 'editing', rating: 3, notes: '' },
    }))
  }

  function cancelNote(playerId: string) {
    setNotes(prev => {
      const next = { ...prev }
      delete next[playerId]
      return next
    })
  }

  function updateNoteField(playerId: string, patch: { rating?: number; notes?: string }) {
    setNotes(prev => {
      const current = prev[playerId]
      if (!current || current.kind !== 'editing') return prev
      return {
        ...prev,
        [playerId]: {
          ...current,
          rating: patch.rating ?? current.rating,
          notes: patch.notes ?? current.notes,
        },
      }
    })
  }

  async function saveNote(playerId: string) {
    const current = notes[playerId]
    if (!current || current.kind !== 'editing') return
    if (!current.notes.trim()) {
      cancelNote(playerId)
      return
    }
    setNotes(prev => ({ ...prev, [playerId]: { kind: 'saving' } }))
    try {
      await addFeedback({
        playerId,
        eventId,
        category: 'general',
        rating: current.rating,
        notes: current.notes.trim(),
      })
      setNotes(prev => ({ ...prev, [playerId]: { kind: 'saved' } }))
      // Collapse the "Saved" confirmation after a moment so the coach can
      // add another note for the same player if they want.
      setTimeout(() => {
        setNotes(prev => {
          const next = { ...prev }
          if (next[playerId]?.kind === 'saved') delete next[playerId]
          return next
        })
      }, 2500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save note'
      toast(msg, 'error')
      // Restore the editing state so the coach can retry without retyping.
      setNotes(prev => ({ ...prev, [playerId]: current }))
    }
  }

  const presentCount = Object.values(attendance).filter(s => s === 'present' || s === 'late').length
  const totalPlayers = players.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-secondary rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col toast-enter">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Attendance</h2>
              <p className="text-gray text-xs mt-0.5">{eventTitle}</p>
            </div>
            <button onClick={onClose} className="text-gray hover:text-white transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {!loading && totalPlayers > 0 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-sm text-gray">
                {presentCount}/{totalPlayers} present
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleMarkAll('present')}
                  disabled={isPending}
                  className="text-xs font-medium text-green border border-green/20 px-3 py-1 rounded-lg hover:bg-green/10 transition-colors"
                >
                  All Present
                </button>
                <button
                  onClick={() => handleMarkAll('absent')}
                  disabled={isPending}
                  className="text-xs font-medium text-red border border-red/20 px-3 py-1 rounded-lg hover:bg-red/10 transition-colors"
                >
                  All Absent
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-dark rounded-xl" />
              ))}
            </div>
          ) : players.length === 0 ? (
            <p className="text-gray text-sm text-center py-8">
              No players registered on this team yet. Add players from the team page.
            </p>
          ) : (
            <div className="space-y-2">
              {players.map(player => {
                const currentStatus = (attendance[player.id] as Status) || null
                const noteState = notes[player.id]

                return (
                  <div key={player.id}>
                    <div className="flex items-center gap-3 py-2">
                      {player.jersey_number !== null ? (
                        <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                          <span className="text-green font-bold text-xs">{player.jersey_number}</span>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                          <span className="text-gray font-bold text-xs">{player.first_name.charAt(0)}</span>
                        </div>
                      )}
                      <a href={`/dashboard/players/${player.id}`} className="font-medium text-sm flex-1 hover:text-green transition-colors">{player.first_name} {player.last_name}</a>
                      <div className="flex gap-1">
                        {(['present', 'late', 'absent', 'excused'] as Status[]).map(status => (
                          <button
                            key={status}
                            onClick={() => handleMark(player.id, status)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all capitalize ${
                              currentStatus === status
                                ? STATUS_COLORS[status]
                                : 'border-white/5 text-gray/50 hover:border-white/20 hover:text-gray'
                            }`}
                          >
                            {status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'late' ? 'L' : 'E'}
                          </button>
                        ))}
                        {/* Add-note toggle. Rendering logic mirrors the attendance
                            pills so it stays visually aligned and one tap opens a
                            mini feedback editor scoped to this event. */}
                        {!noteState && (
                          <button
                            onClick={() => openNote(player.id)}
                            title="Add a quick note for this player on this event"
                            className="text-[10px] font-bold px-2 py-1 rounded-md border border-white/5 text-gray/50 hover:border-white/20 hover:text-gray transition-all"
                          >
                            +
                          </button>
                        )}
                        {noteState?.kind === 'saved' && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-md border border-green/30 bg-green/10 text-green">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {noteState?.kind === 'editing' && (
                      <div className="ml-11 mr-0 mb-2 bg-dark rounded-xl border border-green/20 p-3">
                        <div className="flex items-center gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => updateNoteField(player.id, { rating: n })}
                              className={`w-7 h-7 rounded-md text-xs font-bold transition-colors ${
                                n <= noteState.rating ? 'bg-green text-dark' : 'bg-white/5 text-gray hover:text-white'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={noteState.notes}
                          onChange={e => updateNoteField(player.id, { notes: e.target.value })}
                          placeholder="Quick note (e.g. great touches today)"
                          rows={2}
                          className="w-full bg-dark-secondary border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray focus:outline-none focus:border-green transition-colors resize-none mb-2"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => cancelNote(player.id)}
                            className="text-xs text-gray hover:text-white px-2 py-1"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveNote(player.id)}
                            disabled={!noteState.notes.trim()}
                            className="text-xs font-bold bg-green text-dark px-3 py-1 rounded-md hover:opacity-90 disabled:opacity-40"
                          >
                            Save note
                          </button>
                        </div>
                      </div>
                    )}

                    {noteState?.kind === 'saving' && (
                      <div className="ml-11 mb-2 text-xs text-gray italic">Saving…</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
