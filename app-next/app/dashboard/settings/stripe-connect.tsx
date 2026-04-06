'use client'

import { useState, useEffect } from 'react'

export default function StripeConnect() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    fetch('/api/stripe/connect')
      .then(res => res.json())
      .then(data => setConnected(data.connected))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/stripe/connect', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setConnecting(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">Stripe Payments</h3>
          <p className="text-sm text-gray mt-1">
            {connected
              ? 'Your Stripe account is connected. Parents can pay for camps online.'
              : 'Connect your Stripe account to collect camp payments from parents.'}
          </p>
        </div>
        {connected ? (
          <span className="text-sm text-green font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green rounded-full" />
            Connected
          </span>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="bg-[#635BFF] text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect Stripe'}
          </button>
        )}
      </div>
    </div>
  )
}
