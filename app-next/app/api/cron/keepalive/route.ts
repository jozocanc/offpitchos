import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

// Never cache — this must hit Postgres on every invocation.
export const dynamic = 'force-dynamic'

// Daily keep-alive so the free-tier Supabase project never crosses the ~7-day
// idle threshold that auto-pauses it (which takes login + the dashboard down).
// Triggered by the Vercel Cron defined in vercel.json. When CRON_SECRET is set,
// Vercel sends it as a Bearer token — we reject anything else so the endpoint
// isn't a public DB-ping handle.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // A trivial service-role read — guaranteed to reach Postgres regardless of RLS.
  const supabase = createServiceClient()
  const { error } = await supabase.from('profiles').select('id').limit(1)

  if (error) {
    console.error('keepalive ping failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pinged: true })
}
