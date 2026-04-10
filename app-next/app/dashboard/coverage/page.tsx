import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCoverageData } from './actions'
import CoverageClient from './coverage-client'

export const metadata: Metadata = { title: 'Coverage' }

export default async function CoveragePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // Parents get redirected — they have no coverage actions. DOC and coach
  // both see the page, but the client component renders different surfaces
  // based on role (DOC manages/assigns, coach accepts/declines).
  if (profile?.role !== 'doc' && profile?.role !== 'coach') {
    redirect('/dashboard')
  }

  const data = await getCoverageData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <CoverageClient
        requests={data.requests}
        responses={data.responses}
        coaches={data.coaches}
        userRole={data.userRole}
        userProfileId={data.userProfileId}
      />
    </div>
  )
}
