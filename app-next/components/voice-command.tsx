'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  interpretVoiceCommand,
  executeVoicePlan,
  undoCancelEvent,
  type VoiceCommandResult,
  type VoicePlan,
  type PageContext,
} from '@/app/dashboard/voice-actions'
import { useVoiceFocus } from './voice-context'

type VoiceState = 'idle' | 'listening' | 'processing' | 'confirming' | 'executing' | 'result'

interface VoiceCommandProps {
  userRole: string
}

export default function VoiceCommand({ userRole }: VoiceCommandProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [plan, setPlan] = useState<VoicePlan | null>(null)
  const [result, setResult] = useState<VoiceCommandResult | null>(null)
  const [undoing, setUndoing] = useState(false)
  const recognitionRef = useRef<any>(null)
  // Accumulates the committed portion of speech across pauses; interim
  // results are appended for live display but only the final text is sent.
  const finalTranscriptRef = useRef('')
  // Flipped true when the user taps stop; lets us ignore onend events caused
  // by short silences so the recognition auto-restarts mid-thought.
  const userStoppedRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const focus = useVoiceFocus()

  const dismiss = useCallback(() => {
    setState('idle')
    setTranscript('')
    setPlan(null)
    setResult(null)
    setUndoing(false)
  }, [])

  const handleUndo = useCallback(async (eventId: string) => {
    setUndoing(true)
    try {
      const res = await undoCancelEvent(eventId)
      setResult(res)
      if (res.success) router.refresh()
    } catch {
      setResult({ success: false, message: 'Could not undo. Try again.' })
    } finally {
      setUndoing(false)
    }
  }, [router])

  const handleConfirm = useCallback(async () => {
    if (!plan || plan.kind !== 'action' || !plan.tool || !plan.input) return
    setState('executing')
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await executeVoicePlan(plan.tool, plan.input, timeZone)
      setResult(res)
      setState('result')
      if (res.success) router.refresh()
    } catch {
      setResult({ success: false, message: 'Something went wrong. Try again.' })
      setState('result')
    }
  }, [plan, router])

  const processTranscript = useCallback(async (text: string) => {
    setState('processing')
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const pageContext: PageContext = {
        pathname,
        focusedEventId: focus.eventId,
        focusedTeamId: focus.teamId,
        focusedWeekStart: focus.weekStart,
      }
      const p = await interpretVoiceCommand(text, timeZone, pageContext)
      setPlan(p)
      if (p.kind === 'action') {
        setState('confirming')
      } else {
        setResult({ success: false, message: p.message ?? 'Didn\u2019t understand.' })
        setState('result')
      }
    } catch {
      setResult({ success: false, message: 'Something went wrong. Try again.' })
      setState('result')
    }
  }, [pathname, focus.eventId, focus.teamId, focus.weekStart])

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResult({ success: false, message: 'Speech recognition is not supported in this browser. Try Chrome or Safari.' })
      setState('result')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    // continuous = keep listening across natural pauses. User controls when
    // to stop by tapping the mic a second time.
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) {
          finalTranscriptRef.current += res[0].transcript + ' '
        } else {
          interim += res[0].transcript
        }
      }
      setTranscript((finalTranscriptRef.current + interim).trim())
    }

    recognition.onend = async () => {
      // Ignore onend events caused by short silences — auto-restart so the
      // user can keep thinking mid-sentence.
      if (!userStoppedRef.current) {
        try {
          recognition.start()
          return
        } catch {
          // some browsers throw if start() is called too quickly; fall through
        }
      }
      const finalText = finalTranscriptRef.current.trim()
      if (!finalText) {
        setState('idle')
        return
      }
      setTranscript(finalText)
      await processTranscript(finalText)
    }

    recognition.onerror = (event: any) => {
      // 'no-speech' fires after long silences — just restart unless the
      // user stopped.
      if (event?.error === 'no-speech' && !userStoppedRef.current) {
        try {
          recognition.start()
          return
        } catch {
          // ignore
        }
      }
      if (userStoppedRef.current) return
      userStoppedRef.current = true
      setResult({ success: false, message: 'Could not hear you. Try again.' })
      setState('result')
    }

    setTranscript('')
    finalTranscriptRef.current = ''
    userStoppedRef.current = false
    setPlan(null)
    setResult(null)
    setState('listening')
    recognition.start()
  }, [processTranscript])

  const stopListening = useCallback(() => {
    userStoppedRef.current = true
    recognitionRef.current?.stop()
  }, [])

  // Auto-dismiss result after 6s (12s when there's an Undo button so the user has time)
  useEffect(() => {
    if (state !== 'result') return
    const delay = result?.undoEventId ? 12000 : 6000
    const t = setTimeout(dismiss, delay)
    return () => clearTimeout(t)
  }, [state, result, dismiss])

  // Gate to DOC + coach only — hooks must run before this early return.
  if (userRole === 'parent') return null
  if (pathname === '/dashboard/ask') return null

  const isListening = state === 'listening'
  const isProcessing = state === 'processing'
  const isConfirming = state === 'confirming'
  const isExecuting = state === 'executing'
  const showPanel = state !== 'idle'

  return (
    <>
      {showPanel && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-[min(420px,calc(100vw-2rem))] z-50 bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl p-4">
          {transcript && state !== 'executing' && state !== 'result' && (
            <div className="mb-3">
              <p className="text-xs text-gray mb-1">You said:</p>
              <p className="text-sm text-white">&ldquo;{transcript}&rdquo;</p>
            </div>
          )}

          {isListening && (
            <div className="flex items-center gap-2 text-xs text-gray mt-2">
              <span className="inline-block w-2 h-2 bg-red-400 rounded-full animate-pulse shrink-0" />
              <span>
                {transcript ? 'Still listening — take your time.' : 'Listening — take your time, speak naturally.'}
                {' '}
                <button onClick={stopListening} className="text-green font-semibold hover:underline">
                  Tap to finish
                </button>
              </span>
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
              Ref is thinking...
            </div>
          )}

          {isConfirming && plan?.kind === 'action' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray mb-2">
                Confirm
              </p>
              <p className="text-sm text-white mb-4 leading-relaxed">
                {plan.summary ?? 'Do this action?'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-green text-dark font-bold text-sm py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Yes, do it
                </button>
                <button
                  onClick={dismiss}
                  className="flex-1 bg-white/5 text-gray hover:text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isExecuting && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
              Working...
            </div>
          )}

          {state === 'result' && result && (
            <div>
              <div className={`flex items-start gap-2 text-sm ${result.success ? 'text-green' : 'text-white/80'}`}>
                <span className="mt-0.5 text-base">{result.success ? '✓' : '!'}</span>
                <p>{result.message}</p>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {result.undoEventId && (
                  <button
                    onClick={() => handleUndo(result.undoEventId!)}
                    disabled={undoing}
                    className="text-xs font-bold bg-green/15 text-green hover:bg-green/25 transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {undoing ? 'Undoing…' : 'Undo'}
                  </button>
                )}
                <button
                  onClick={dismiss}
                  className="text-xs text-gray hover:text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing || isExecuting || isConfirming}
        aria-label={isListening ? 'Stop listening' : 'Voice command'}
        title='Voice command — try: "Cancel U14 practice tonight"'
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all
          ${isListening
            ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-500/30 scale-110'
            : 'bg-green text-dark hover:scale-110 shadow-[0_0_40px_rgba(0,255,135,0.35)]'
          }
          ${(isProcessing || isExecuting || isConfirming) ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
    </>
  )
}
