'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markAttendance } from '../../attendance-actions'
import { addFeedback } from '../../../players/[id]/actions'
import EventPhotosModal from '../../event-photos-modal'
import { useToast } from '@/components/toast'

interface Player {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
}

type Tab = 'attendance' | 'feedback'
type AttStatus = 'present' | 'absent' | 'late' | 'excused'

interface Props {
  eventId: string
  eventTitle: string
  eventType: string
  startTime: string
  endTime: string
  teamId: string
  teamName: string
  ageGroup: string
  venueName: string | null
  venueAddress: string | null
  players: Player[]
  initialAttendance: Record<string, string>
  initialFeedback: Record<string, { id: string; rating: number | null; notes: string }>
}

export default function GameDayClient({
  eventId,
  eventTitle,
  eventType,
  startTime,
  endTime,
  teamName,
  ageGroup,
  venueName,
  venueAddress,
  players,
  initialAttendance,
  initialFeedback,
}: Props) {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('attendance')
  const [attendance, setAttendance] = useState<Record<string, string>>(initialAttendance)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [, startTransition] = useTransition()

  const start = new Date(startTime)
  const end = new Date(endTime)
  const present = Object.values(attendance).filter(s => s === 'present' || s === 'late').length
  const absent = Object.values(attendance).filter(s => s === 'absent' || s === 'excused').length
  const unmarked = players.length - present - absent

  function handleMark(playerId: string, status: AttStatus) {
    // Optimistic — flip immediately so taps feel instant on mobile.
    setAttendance(prev => ({ ...prev, [playerId]: status }))
    startTransition(async () => {
      try {
        await markAttendance(eventId, playerId, status)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save'
        toast(msg, 'error')
        setAttendance(prev => {
          const next = { ...prev }
          delete next[playerId]
          return next
        })
      }
    })
  }

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-dark border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/dashboard/schedule"
              className="text-gray text-sm hover:text-white transition-colors inline-flex items-center gap-1"
            >
              ← Back
            </Link>
            <span className="text-xs font-bold uppercase tracking-wide bg-green/10 text-green px-2 py-0.5 rounded-full">
              Game Day
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">{eventTitle}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray mt-1">
            <span>{teamName} · {ageGroup}</span>
            <span>·</span>
            <span>{start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span>·</span>
            <span>
              {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              {' – '}
              {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
            {venueName && (
              <>
                <span>·</span>
                <span>{venueName}</span>
              </>
            )}
            {venueAddress && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-green bg-green/10 hover:bg-green/20 border border-green/20 rounded-full px-2 py-0.5 transition-colors"
              >
                Map ↗
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button
              onClick={() => setTab('attendance')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                tab === 'attendance' ? 'bg-green text-dark' : 'bg-white/5 text-gray hover:text-white'
              }`}
            >
              Roll Call
            </button>
            <button
              onClick={() => setTab('feedback')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                tab === 'feedback' ? 'bg-green text-dark' : 'bg-white/5 text-gray hover:text-white'
              }`}
            >
              Quick Feedback
            </button>
            <button
              onClick={() => setPhotosOpen(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-gray hover:text-white transition-colors ml-auto"
            >
              Photos
            </button>
          </div>

          {tab === 'attendance' && (
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-green">
                <span className="w-2 h-2 rounded-full bg-green" /> {present} here
              </span>
              <span className="inline-flex items-center gap-1 text-red">
                <span className="w-2 h-2 rounded-full bg-red" /> {absent} out
              </span>
              <span className="inline-flex items-center gap-1 text-gray">
                <span className="w-2 h-2 rounded-full bg-gray" /> {unmarked} unmarked
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 pb-32">
        {tab === 'attendance' && (
          <RollCall players={players} attendance={attendance} onMark={handleMark} />
        )}
        {tab === 'feedback' && (
          <QuickFeedback
            eventId={eventId}
            eventType={eventType}
            players={players}
            initialFeedback={initialFeedback}
          />
        )}
      </div>

      {photosOpen && (
        <EventPhotosModal
          eventId={eventId}
          eventTitle={eventTitle}
          onClose={() => setPhotosOpen(false)}
        />
      )}
    </>
  )
}

// ===== Roll Call =====

function RollCall({
  players,
  attendance,
  onMark,
}: {
  players: Player[]
  attendance: Record<string, string>
  onMark: (playerId: string, status: AttStatus) => void
}) {
  if (players.length === 0) {
    return (
      <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
        <p className="text-gray text-lg">No players on this team yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {players.map(p => {
        const status = attendance[p.id] ?? null
        return (
          <div
            key={p.id}
            className="bg-dark-secondary border border-white/5 rounded-xl p-3 flex items-center gap-3"
          >
            {p.jersey_number !== null ? (
              <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                <span className="text-green font-bold text-sm">{p.jersey_number}</span>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                <span className="text-gray font-bold text-xs">{p.first_name.charAt(0)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{p.first_name} {p.last_name}</p>
              {p.position && <p className="text-gray text-xs">{p.position}</p>}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => onMark(p.id, 'present')}
                className={`text-xs font-bold w-12 h-9 rounded-lg transition-colors ${
                  status === 'present'
                    ? 'bg-green text-dark'
                    : 'bg-white/5 text-gray hover:text-green'
                }`}
                aria-label="Present"
              >
                Here
              </button>
              <button
                onClick={() => onMark(p.id, 'late')}
                className={`text-xs font-bold w-12 h-9 rounded-lg transition-colors ${
                  status === 'late'
                    ? 'bg-yellow-500 text-dark'
                    : 'bg-white/5 text-gray hover:text-yellow-400'
                }`}
                aria-label="Late"
              >
                Late
              </button>
              <button
                onClick={() => onMark(p.id, 'absent')}
                className={`text-xs font-bold w-12 h-9 rounded-lg transition-colors ${
                  status === 'absent'
                    ? 'bg-red text-white'
                    : 'bg-white/5 text-gray hover:text-red'
                }`}
                aria-label="Absent"
              >
                Out
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ===== Quick Feedback =====

function QuickFeedback({
  eventId,
  eventType,
  players,
  initialFeedback,
}: {
  eventId: string
  eventType: string
  players: Player[]
  initialFeedback: Record<string, { id: string; rating: number | null; notes: string }>
}) {
  // Default category — for games we focus on "general" performance,
  // for practices "tactical". Coach can change later from the player
  // profile if they want a categorized note.
  const defaultCategory = eventType === 'game' ? 'general' : 'tactical'

  return (
    <div className="space-y-2">
      {players.length === 0 && (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
          <p className="text-gray text-lg">No players to rate.</p>
        </div>
      )}
      {players.map(p => (
        <FeedbackRow
          key={p.id}
          player={p}
          eventId={eventId}
          defaultCategory={defaultCategory}
          existing={initialFeedback[p.id] ?? null}
        />
      ))}
    </div>
  )
}

function FeedbackRow({
  player,
  eventId,
  defaultCategory,
  existing,
}: {
  player: Player
  eventId: string
  defaultCategory: string
  existing: { id: string; rating: number | null; notes: string } | null
}) {
  const { toast } = useToast()
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saved, setSaved] = useState(Boolean(existing))
  const [isPending, startTransition] = useTransition()

  function save() {
    if (rating == null) {
      toast('Pick a rating first', 'error')
      return
    }
    if (!notes.trim()) {
      toast('Add a quick note', 'error')
      return
    }
    startTransition(async () => {
      try {
        await addFeedback({
          playerId: player.id,
          eventId,
          category: defaultCategory,
          rating,
          notes: notes.trim(),
        })
        setSaved(true)
        toast(`Saved feedback for ${player.first_name}`, 'success')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save'
        toast(msg, 'error')
      }
    })
  }

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-3">
      <div className="flex items-center gap-3 mb-2">
        {player.jersey_number !== null ? (
          <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center shrink-0">
            <span className="text-green font-bold text-xs">{player.jersey_number}</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            <span className="text-gray font-bold text-xs">{player.first_name.charAt(0)}</span>
          </div>
        )}
        <p className="font-medium text-sm flex-1 truncate">{player.first_name} {player.last_name}</p>
        {saved && (
          <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
            Saved
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => { setRating(n); setSaved(false) }}
            className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
              rating === n
                ? 'bg-green text-dark'
                : 'bg-white/5 text-gray hover:text-white'
            }`}
            aria-label={`Rate ${n} out of 5`}
          >
            {n}
          </button>
        ))}
        <span className="text-xs text-gray ml-2">/ 5</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={notes}
          onChange={e => { setNotes(e.target.value); setSaved(false) }}
          placeholder="One-line note (e.g. great pressing, scored 2 goals)"
          maxLength={200}
          className="flex-1 bg-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
        />
        <button
          onClick={save}
          disabled={isPending || saved || rating == null || !notes.trim()}
          className="bg-green text-dark font-bold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isPending ? '…' : saved ? '✓' : 'Save'}
        </button>
      </div>
    </div>
  )
}
