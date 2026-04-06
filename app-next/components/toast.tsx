'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error') => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
              t.type === 'success'
                ? 'bg-dark-secondary border-green/20 text-green'
                : 'bg-dark-secondary border-red/20 text-red'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
