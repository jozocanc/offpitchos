'use server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DrillDocSchema } from '@/lib/tactics/object-schema'
import { renderThumbnailPng } from '@/lib/tactics/thumbnail'
import { revalidatePath } from 'next/cache'

export async function saveDrill(drillId: string, patch: {
  title?: string
  description?: string
  category?: string
  visibility?: 'private' | 'team' | 'club'
  doc?: unknown
}) {
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (typeof patch.title === 'string') update.title = patch.title
  if (typeof patch.description === 'string') update.description = patch.description
  if (patch.category) update.category = patch.category
  if (patch.visibility) update.visibility = patch.visibility
  if (patch.doc !== undefined) {
    const parsed = DrillDocSchema.safeParse(patch.doc)
    if (!parsed.success) throw new Error('Invalid drill doc: ' + parsed.error.message)
    update.field = parsed.data.field
    update.objects = parsed.data.objects
  }
  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('drills').update(update).eq('id', drillId)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/tactics/${drillId}`)
}

export async function regenerateThumbnail(drillId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, club_id').eq('user_id', user.id).single()
  if (!profile) throw new Error('No profile')
  const { data: drill } = await supabase
    .from('drills').select('id, club_id, team_id, created_by, visibility, field, objects').eq('id', drillId).single()
  if (!drill) return
  const canEdit =
    drill.created_by === profile.id ||
    (profile.role === 'doc' && profile.club_id === drill.club_id) ||
    (profile.role === 'coach' && drill.visibility !== 'private' && drill.team_id &&
      await isRosteredOnTeam(supabase, profile.id, drill.team_id))
  if (!canEdit) throw new Error('Forbidden')

  const parsed = DrillDocSchema.safeParse({ field: drill.field, objects: drill.objects })
  if (!parsed.success) return
  const png = await renderThumbnailPng(parsed.data.field, parsed.data.objects)
  const path = `${drill.club_id}/${drill.id}.png`
  const svc = createServiceClient()
  await svc.storage.from('drill-thumbnails').upload(path, png, { contentType: 'image/png', upsert: true })
  await supabase.from('drills').update({ thumbnail_path: path }).eq('id', drillId)
  revalidatePath('/dashboard/tactics')
}

async function isRosteredOnTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  teamId: string,
) {
  const { data } = await supabase
    .from('team_members').select('id').eq('profile_id', profileId).eq('team_id', teamId).maybeSingle()
  return !!data
}
