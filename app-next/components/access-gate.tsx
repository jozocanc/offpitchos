'use client'

import { useState, useEffect } from 'react'

const ACCESS_CODE = 'offpitch2026'

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('offpitchos_access')
    if (stored === ACCESS_CODE) {
      setAuthorized(true)
    }
    setChecking(false)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code === ACCESS_CODE) {
      localStorage.setItem('offpitchos_access', code)
      setAuthorized(true)
    } else {
      setError(true)
    }
  }

  if (checking) return null

  if (authorized) return <>{children}</>

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black uppercase tracking-tight">
            OffPitch<span className="text-green">OS</span>
          </h1>
          <p className="text-sm text-gray mt-2">Enter access code to continue</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={code}
            onChange={e => { setCode(e.target.value); setError(false) }}
            placeholder="Access code"
            autoFocus
            className="w-full bg-dark-secondary border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-3"
          />
          {error && <p className="text-red-400 text-sm mb-3">Invalid code</p>}
          <button
            type="submit"
            className="w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}
