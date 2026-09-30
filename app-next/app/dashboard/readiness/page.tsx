import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveRole } from '@/lib/admin-role'
import { isStaff } from '@/lib/constants'
import { getReadinessData } from './data'
import ReadinessClient from './readiness-client'

export const metadata: Metadata = { title: 'Readiness' }

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; date?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  // "View as Player" resolves to 'player' here, so the preview is bounced
  // like every other staff page.
  const role = await getEffectiveRole(prof?.role ?? 'player')
  if (!isStaff(role)) redirect('/dashboard')

  const { team, date } = await searchParams
  const data = await getReadinessData({ team, date })

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Readiness</h1>
        <p className="text-sm text-gray mt-1">
          Daily player check-ins: sleep, soreness, energy and availability, plus who you can pick for the next game.
        </p>
      </div>

      <ReadinessClient data={data} />
    </div>
  )
}
