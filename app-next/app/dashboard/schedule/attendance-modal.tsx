'use client'

import { useState, useEffect, useTransition } from 'react'
import { getAttendanceData, markAttendance, markBulkAttendance } from './attendance-actions'

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

export default function AttendanceModal({ eventId, teamId, eventTitle, onClose }: AttendanceModalProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

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

  const presentCount = Object.values(attendance).filter(s => s === 'present' || s === 'late').length
  const totalPlayers = players.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-dark-secondary rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col toast-enter">
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

                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 py-2"
                  >
                    {player.jersey_number !== null ? (
                      <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                        <span className="text-green font-bold text-xs">{player.jersey_number}</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className="text-gray font-bold text-xs">{player.first_name.charAt(0)}</span>
                      </div>
                    )}
                    <p className="font-medium text-sm flex-1">{player.first_name} {player.last_name}</p>
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
                    </div>
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
