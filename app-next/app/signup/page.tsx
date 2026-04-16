'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import PasswordInput from '@/components/password-input'

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

  const handleGoogleSignup = async () => {
    const next = inviteToken
      ? `/join/${inviteToken}`
      : inviteCode
      ? `/join/code/${inviteCode}`
      : '/dashboard'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
            OffPitch<span className="inline-block bg-green text-dark px-2 py-0.5 rounded-full text-[0.7em] font-black tracking-wide align-middle ml-1">OS</span>
          </h1>
          <p className="text-gray">Create your account</p>
        </div>

        <button
          onClick={handleGoogleSignup}
          className="w-full flex items-center justify-center gap-3 bg-white text-dark font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition mb-6"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-dark-secondary"></div>
          <span className="text-gray text-sm">or</span>
          <div className="flex-1 h-px bg-dark-secondary"></div>
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
