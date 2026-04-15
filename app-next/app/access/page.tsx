import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'
import Link from 'next/link'
import PasswordInput from '@/components/password-input'

const ACCESS_COOKIE = 'offpitchos_access'
const cream = '#FAF7F2'
const card = '#FFFFFF'
const ink = '#0F1510'
const subtext = '#5C6660'
const forest = '#1F4E3D'
const border = '#E8E3DC'

function sign(value: string): string {
  const secret = process.env.ACCESS_SECRET || 'dev-secret-change-me'
  return createHmac('sha256', secret).update(value).digest('hex')
}

async function submitCode(formData: FormData) {
  'use server'
  const submitted = String(formData.get('code') ?? '').trim()
  const next = String(formData.get('next') ?? '/login')
  const expected = (process.env.ACCESS_CODE ?? '').trim()

  if (!expected) redirect('/access?error=missing-env')
  if (submitted.toLowerCase() !== expected.toLowerCase()) {
    redirect('/access?error=invalid' + (next ? `&next=${encodeURIComponent(next)}` : ''))
  }

  const cookieStore = await cookies()
  const value = `v1:${Date.now()}`
  cookieStore.set(ACCESS_COOKIE, `${value}:${sign(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  redirect(next && next.startsWith('/') ? next : '/login')
}

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const nextUrl = params.next && params.next.startsWith('/') ? params.next : '/login'
  const error = params.error === 'invalid'
    ? 'That access code is not recognized.'
    : params.error === 'missing-env'
      ? 'Access is temporarily unavailable. Please contact the team.'
      : null

  return (
    <main
      style={{ backgroundColor: cream, color: ink }}
      className="min-h-screen flex items-center justify-center px-6 antialiased"
    >
      <div
        style={{ backgroundColor: card, borderColor: border }}
        className="w-full max-w-md rounded-3xl border p-8 shadow-[0_8px_32px_rgba(15,21,16,0.06)]"
      >
        <Link href="/" className="text-sm hover:underline" style={{ color: subtext }}>
          ← Back
        </Link>

        <div className="text-center mt-6 mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: forest }}>
            Early access
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] mt-3" style={{ color: ink }}>
            OffPitch<span style={{ color: forest }}>OS</span>
          </h1>
          <p className="mt-3 text-sm" style={{ color: subtext }}>
            Enter your access code to continue to sign in or create an account.
          </p>
        </div>

        <form action={submitCode} className="space-y-4">
          <input type="hidden" name="next" value={nextUrl} />
          <PasswordInput
            name="code"
            autoFocus
            autoComplete="off"
            placeholder="Access code"
            inputStyle={{ backgroundColor: cream, borderColor: border, color: ink }}
            className="w-full rounded-full border px-5 py-3 text-sm tracking-wider focus:outline-none focus:ring-2"
          />
          {error && (
            <p className="text-center text-sm" style={{ color: '#C53030' }}>{error}</p>
          )}
          <button
            type="submit"
            style={{ backgroundColor: forest, color: cream }}
            className="w-full font-semibold px-5 py-3 rounded-full hover:opacity-90 transition-opacity"
          >
            Continue →
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: subtext }}>
          Don&rsquo;t have a code?{' '}
          <a href="mailto:hello@offpitchos.com?subject=OffPitchOS%20access%20code" style={{ color: forest }} className="font-semibold hover:underline">
            Request one
          </a>
        </p>
      </div>
    </main>
  )
}
