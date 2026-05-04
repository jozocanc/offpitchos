'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetForm({ email }: { email: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) {
        setError(updateErr.message)
        return
      }
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg">
        <h1 className="text-xl font-bold mb-2">Set your password</h1>
        <p className="text-gray text-sm mb-6">
          Welcome to OffPitchOS{email ? `, ${email}` : ''}. Pick a password and you&apos;re in.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-white mb-2">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm text-white mb-2">Confirm password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green transition-colors"
            />
          </div>
          {error && <p className="text-red text-sm">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
