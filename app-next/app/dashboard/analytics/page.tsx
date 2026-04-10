import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import { getAnalyticsData } from './actions'
import AnalyticsClient from './analytics-client'

export const metadata: Metadata = {
  title: 'Analytics',
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  const role = await getEffectiveRole(user.email ?? '', prof?.role ?? 'parent')
  if (role !== 'doc') redirect('/dashboard')

  const data = await getAnalyticsData()

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray mt-1">Your club at a glance.</p>
      </div>

      <AnalyticsClient data={data} />
    </div>
  )
}
