'use client'

import { useState, useRef, useCallback } from 'react'
import { executeVoiceCommand } from './voice-actions'

type VoiceState = 'idle' | 'listening' | 'processing' | 'result'

export default function VoiceCommand() {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResult({ success: false, message: 'Speech recognition is not supported in this browser.' })
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
        const res = await executeVoiceCommand(finalTranscript)
        setResult(res)
        setState('result')
      } catch {
        setResult({ success: false, message: 'Something went wrong. Try again.' })
        setState('result')
      }
    }

    recognition.onerror = () => {
      setState('idle')
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

  const dismiss = useCallback(() => {
    setState('idle')
    setTranscript('')
    setResult(null)
  }, [])

  return (
    <div className="relative">
      {/* Mic button */}
      <button
        onClick={state === 'listening' ? stopListening : startListening}
        disabled={state === 'processing'}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
          ${state === 'listening'
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
            : 'bg-white/5 border border-white/10 text-gray hover:text-white hover:bg-white/10'
          }
          ${state === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        title="Voice command"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        {state === 'listening' ? 'Listening...' : state === 'processing' ? 'Processing...' : 'Voice'}
      </button>

      {/* Overlay for listening/processing/result */}
      {state !== 'idle' && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-secondary border border-white/10 rounded-xl shadow-2xl z-50 p-4">
          {/* Transcript */}
          {transcript && (
            <div className="mb-3">
              <p className="text-xs text-gray mb-1">You said:</p>
              <p className="text-sm text-white">&ldquo;{transcript}&rdquo;</p>
            </div>
          )}

          {/* Processing indicator */}
          {state === 'processing' && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
              Ref is processing your command...
            </div>
          )}

          {/* Listening indicator */}
          {state === 'listening' && !transcript && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              Listening — speak your command...
            </div>
          )}

          {/* Result */}
          {state === 'result' && result && (
            <div>
              <div className={`flex items-start gap-2 text-sm ${result.success ? 'text-green' : 'text-white/80'}`}>
                <span className="mt-0.5">{result.success ? '✓' : '!'}</span>
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
    </div>
  )
}
