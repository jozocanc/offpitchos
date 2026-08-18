'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'

export async function addTeam(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // redirect() throws; toActionError re-throws it rather than turning a
    // sign-in redirect into a returned error message.
    if (!user) redirect('/login')

    const teamName = formData.get('teamName') as string
    const ageGroup = formData.get('ageGroup') as string

    // Age group is optional — a college program or senior side has none.
    if (!teamName?.trim()) {
      throw new Error('Team name is required')
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('club_id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile?.club_id) {
      throw new Error('Could not find your club')
    }

    const { error } = await supabase
      .from('teams')
      .insert({ name: teamName.trim(), age_group: ageGroup ?? '', club_id: profile.club_id })

    if (error) throw new Error(`Failed to create team: ${error.message}`)

    revalidatePath('/dashboard/teams')
    return { ok: true, data: undefined }
  } catch (e) {
    return toActionError(e)
  }
}
