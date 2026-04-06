'use client'

import { useState, useRef } from 'react'
import { addFeedback } from './actions'

const CATEGORIES = [
  { value: 'technical', label: 'Technical', emoji: '⚽' },
  { value: 'tactical', label: 'Tactical', emoji: '🧠' },
  { value: 'physical', label: 'Physical', emoji: '💪' },
  { value: 'attitude', label: 'Attitude', emoji: '🌟' },
  { value: 'general', label: 'General', emoji: '📝' },
]

interface RecentEvent {
  id: string
  title: string
  type: string
  start_time: string
}

export default function FeedbackForm({ playerId, recentEvents }: { playerId: string; recentEvents: RecentEvent[] }) {
  const [category, setCategory] = useState('general')
  const [rating, setRating] = useState(3)
  const [notes, setNotes] = useState('')
  const [eventId, setEventId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  function startVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setNotes(transcript)
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    setListening(true)
    recognition.start()
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  async function handleSubmit() {
    if (!notes.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await addFeedback({
        playerId,
        eventId: eventId || null,
        category,
        rating,
        notes,
      })
      setSuccess(true)
      setNotes('')
      setRating(3)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
      <h3 className="font-bold text-white mb-4">Add Feedback</h3>

      {/* Category */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              category === c.value
                ? 'bg-green text-dark'
                : 'bg-white/5 border border-white/10 text-gray hover:text-white'
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Rating */}
      <div className="mb-4">
        <label className="block text-sm text-gray mb-2">Rating</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                n <= rating ? 'bg-green text-dark' : 'bg-white/5 text-gray hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Event link */}
      {recentEvents.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm text-gray mb-2">Link to event (optional)</label>
          <select
            value={eventId}
            onChange={e => setEventId(e.target.value)}
            className="w-full bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
          >
            <option value="">No event</option>
            {recentEvents.map(e => (
              <option key={e.id} value={e.id}>
                {e.title} — {new Date(e.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes with voice */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray">Notes</label>
          <button
            onClick={listening ? stopVoice : startVoice}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
              listening
                ? 'bg-red-500/20 text-red-400 animate-pulse'
                : 'bg-white/5 text-gray hover:text-white'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {listening ? 'Stop' : 'Voice'}
          </button>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How did the player perform? What should they work on?"
          rows={3}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {success && <p className="text-green text-sm mb-3">Feedback saved!</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || !notes.trim()}
        className="w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {submitting ? 'Saving...' : 'Save Feedback'}
      </button>
    </div>
  )
}
