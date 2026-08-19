'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import PasswordInput from '@/components/password-input'
import Wordmark from '@/components/wordmark'

function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const inviteCode = searchParams.get('code')
  const supabase = createClient()

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const dest = inviteToken
        ? `/join/${inviteToken}`
        : inviteCode
        ? `/join/code/${inviteCode}`
        : '/dashboard'
      router.push(dest)
      router.refresh()
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Wordmark size="xl" className="mb-3" />
          <p className="text-gray">Create your account</p>
        </div>

        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm text-gray mb-1">Full Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-dark-secondary border border-gray/20 rounded-lg text-white placeholder-gray focus:outline-none focus:ring-2 focus:ring-green"
              placeholder="John Smith"
              required
            />
          </div>
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
              placeholder="Min 6 characters"
              minLength={6}
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
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-gray text-sm mt-6">
          Already have an account?{' '}
          <a href={inviteToken ? `/login?invite=${inviteToken}` : inviteCode ? `/login?code=${inviteCode}` : '/login'} className="text-green hover:underline">Sign in</a>
        </p>

        <p className="text-center text-gray text-xs mt-6 leading-relaxed">
          By creating an account you agree to our{' '}
          <a href="/terms" className="text-green hover:underline">Terms</a>{' '}
          and{' '}
          <a href="/privacy" className="text-green hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
