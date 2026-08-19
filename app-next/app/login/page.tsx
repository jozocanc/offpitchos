'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import PasswordInput from '@/components/password-input'
import Wordmark from '@/components/wordmark'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const supabase = createClient()

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(inviteToken ? `/join/${inviteToken}` : '/dashboard')
      router.refresh()
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Wordmark size="xl" className="mb-3" />
          <p className="text-gray">Sign in to your account</p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
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
          <div>
            <label htmlFor="password" className="block text-sm text-gray mb-1">Password</label>
            <PasswordInput
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-dark-secondary border border-gray/20 rounded-lg text-white placeholder-gray focus:outline-none focus:ring-2 focus:ring-green"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-red text-sm">{error}</p>
          )}

          <div className="flex justify-end">
            <a href="/forgot-password" className="text-xs text-gray hover:text-green transition-colors">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green text-dark font-bold py-3 px-4 rounded-lg uppercase tracking-wider hover:shadow-[0_0_20px_rgba(0,255,135,0.4)] transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-gray text-sm mt-6">
          Don&apos;t have an account?{' '}
          <a href={inviteToken ? `/signup?invite=${inviteToken}` : '/signup'} className="text-green hover:underline">Sign up</a>
        </p>

        <p className="text-center text-gray text-xs mt-6 flex justify-center gap-4">
          <a href="/privacy" className="hover:text-white">Privacy</a>
          <a href="/terms" className="hover:text-white">Terms</a>
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
