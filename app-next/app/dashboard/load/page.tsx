import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import { getLoadPageData } from './actions'
import LoadClient from './load-client'

export const metadata: Metadata = {
  title: 'Load',
}

export default async function LoadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  const role = await getEffectiveRole(prof?.role ?? 'parent')
  if (role !== 'doc' && role !== 'coach') redirect('/dashboard')

  const data = await getLoadPageData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Load</h1>
        <p className="text-sm text-gray mt-1">
          GPS vest data, attached to the session it came from.
        </p>
      </div>

      <LoadClient data={data} />
    </div>
  )
}
