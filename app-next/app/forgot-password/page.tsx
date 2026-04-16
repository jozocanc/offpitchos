'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
            OffPitch<span className="inline-block bg-green text-dark px-2 py-0.5 rounded-full text-[0.7em] font-black tracking-wide align-middle ml-1">OS</span>
          </h1>
          <p className="text-gray">Reset your password</p>
        </div>

        {sent ? (
          <div className="bg-dark-secondary rounded-2xl p-8 border border-green/20 text-center">
            <p className="text-green font-bold mb-2">Check your email</p>
            <p className="text-gray text-sm">
              We sent a password reset link to <span className="text-white">{email}</span>. Click the link to reset your password.
            </p>
            <a href="/login" className="inline-block mt-6 text-sm font-bold text-green hover:underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <>
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-gray mb-1">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-secondary border border-gray/20 rounded-lg text-white placeholder-gray focus:outline-none focus:ring-2 focus:ring-green"
                  placeholder="you@example.com"
                  required
                />
              </div>

              {error && (
                <p className="text-red text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green text-dark font-bold py-3 px-4 rounded-lg uppercase tracking-wider hover:shadow-[0_0_20px_rgba(0,255,135,0.4)] transition disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p className="text-center text-gray text-sm mt-6">
              Remember your password?{' '}
              <a href="/login" className="text-green hover:underline">Sign in</a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
