import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveRole } from '@/lib/admin-role'
import { listClubFiles } from './actions'
import FilesClient from './files-client'

export const metadata: Metadata = {
  title: 'Files',
}

export default async function FilesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  const role = await getEffectiveRole(user.email ?? '', prof?.role ?? 'parent')

  const files = await listClubFiles()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Files</h1>
        <p className="text-sm text-gray mt-1">
          Club-wide documents shared with everyone.
        </p>
      </div>

      <FilesClient files={files} role={role} />
    </div>
  )
}
