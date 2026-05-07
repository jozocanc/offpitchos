import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import DigestClient from './digest-client'

export const metadata: Metadata = { title: 'Weekly Digest' }
export const dynamic = 'force-dynamic'

interface DigestRow {
  id: string
  week_start: string
  summary_md: string
  stats: any  // eslint-disable-line @typescript-eslint/no-explicit-any
  emailed_at: string | null
  email_recipients: number
  created_at: string
}

export default async function DigestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) redirect('/dashboard')

  const isDoc = profile.role === 'doc'

  // Service client read so parents who haven't joined a team_member yet
  // can still see the club-wide digest. RLS already filters by club.
  const service = createServiceClient()
  const { data: digestsRaw } = await service
    .from('weekly_digests')
    .select('id, week_start, summary_md, stats, emailed_at, email_recipients, created_at')
    .eq('club_id', profile.club_id)
    .order('week_start', { ascending: false })
    .limit(12)

  const digests = (digestsRaw ?? []) as DigestRow[]

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <DigestClient digests={digests} isDoc={isDoc} />
    </div>
  )
}
