'use client'

import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'

// Lightweight shared state used only to hint the voice command about what
// the user is currently looking at. Pages call setFocus() from their UI
// (e.g. when a user clicks an event on the schedule) and the floating mic
// reads it when building the prompt to Claude.
export interface VoiceFocus {
  eventId: string | null
  teamId: string | null
  weekStart: string | null // ISO date (YYYY-MM-DD)
}

interface VoiceFocusContextValue extends VoiceFocus {
  setFocus: (next: Partial<VoiceFocus>) => void
  clearFocus: () => void
}

const EMPTY: VoiceFocus = { eventId: null, teamId: null, weekStart: null }

const VoiceFocusContext = createContext<VoiceFocusContextValue>({
  ...EMPTY,
  setFocus: () => {},
  clearFocus: () => {},
})

export function VoiceFocusProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocusState] = useState<VoiceFocus>(EMPTY)

  const setFocus = useCallback((next: Partial<VoiceFocus>) => {
    setFocusState(prev => ({ ...prev, ...next }))
  }, [])

  const clearFocus = useCallback(() => {
    setFocusState(EMPTY)
  }, [])

  const value = useMemo(
    () => ({ ...focus, setFocus, clearFocus }),
    [focus, setFocus, clearFocus]
  )

  return <VoiceFocusContext value={value}>{children}</VoiceFocusContext>
}

export function useVoiceFocus(): VoiceFocusContextValue {
  return useContext(VoiceFocusContext)
}

// Convenience hook for pages that want to declare their focus for the
// duration they are mounted. Auto-clears on unmount so switching pages
// doesn't leak stale hints.
export function useDeclareVoiceFocus(focus: Partial<VoiceFocus>) {
  const { setFocus, clearFocus } = useVoiceFocus()

  useEffect(() => {
    setFocus(focus)
    return () => clearFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.eventId, focus.teamId, focus.weekStart])
}
