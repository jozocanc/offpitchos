'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { executeVoiceCommand } from '@/app/dashboard/voice-actions'

type VoiceState = 'idle' | 'listening' | 'processing' | 'result'

interface VoiceCommandProps {
  userRole: string
}

export default function VoiceCommand({ userRole }: VoiceCommandProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')
  const router = useRouter()

  const dismiss = useCallback(() => {
    setState('idle')
    setTranscript('')
    setResult(null)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResult({ success: false, message: 'Speech recognition is not supported in this browser. Try Chrome or Safari.' })
      setState('result')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event: any) => {
      const current = event.results[event.results.length - 1]
      const text = current[0].transcript
      setTranscript(text)
      transcriptRef.current = text
    }

    recognition.onend = async () => {
      const finalTranscript = transcriptRef.current
      if (!finalTranscript.trim()) {
        setState('idle')
        return
      }
      setState('processing')
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const res = await executeVoiceCommand(finalTranscript, timeZone)
        setResult(res)
        setState('result')
        if (res.success) router.refresh()
      } catch {
        setResult({ success: false, message: 'Something went wrong. Try again.' })
        setState('result')
      }
    }

    recognition.onerror = () => {
      setResult({ success: false, message: 'Could not hear you. Try again.' })
      setState('result')
    }

    setTranscript('')
    transcriptRef.current = ''
    setResult(null)
    setState('listening')
    recognition.start()
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  // Auto-dismiss result after 6s
  useEffect(() => {
    if (state !== 'result') return
    const t = setTimeout(dismiss, 6000)
    return () => clearTimeout(t)
  }, [state, dismiss])

  // Gate to DOC + coach only — hooks must run before this early return
  if (userRole === 'parent') return null

  const isListening = state === 'listening'
  const isProcessing = state === 'processing'
  const showPanel = state !== 'idle'

  return (
    <>
      {/* Result / transcript panel — floats above the FAB */}
      {showPanel && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-[min(380px,calc(100vw-2rem))] z-50 bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl p-4">
          {transcript && (
            <div className="mb-3">
              <p className="text-xs text-gray mb-1">You said:</p>
              <p className="text-sm text-white">&ldquo;{transcript}&rdquo;</p>
            </div>
          )}
          {isListening && !transcript && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              Listening — speak your command...
            </div>
          )}
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
              Ref is processing your command...
            </div>
          )}
          {state === 'result' && result && (
            <div>
              <div className={`flex items-start gap-2 text-sm ${result.success ? 'text-green' : 'text-white/80'}`}>
                <span className="mt-0.5 text-base">{result.success ? '✓' : '!'}</span>
                <p>{result.message}</p>
              </div>
              <button
                onClick={dismiss}
                className="mt-3 text-xs text-gray hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating mic button */}
      <button
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing}
        aria-label={isListening ? 'Stop listening' : 'Voice command'}
        title="Voice command — try: &quot;Cancel U14 practice tonight&quot;"
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all
          ${isListening
            ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-500/30 scale-110'
            : 'bg-green text-dark hover:scale-110 shadow-[0_0_40px_rgba(0,255,135,0.35)]'
          }
          ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}
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
