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

  let parsedDoc: { field: unknown; objects: unknown } | null = null
  if (patch.doc !== undefined) {
    const parsed = DrillDocSchema.safeParse(patch.doc)
    if (!parsed.success) throw new Error('Invalid drill doc: ' + parsed.error.message)
    update.field = parsed.data.field
    update.objects = parsed.data.objects
    parsedDoc = parsed.data
  }

  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('drills').update(update).eq('id', drillId)
  if (error) throw new Error(error.message)

  // Insert a version snapshot whenever the doc (field/objects) changes
  if (parsedDoc) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('user_id', user.id).single()
      if (profile) {
        // Ignore version insert errors — they shouldn't break the save
        await supabase.from('drill_versions').insert({
          drill_id: drillId,
          field: parsedDoc.field,
          objects: parsedDoc.objects,
          saved_by: profile.id,
        })
      }
    }
  }

  revalidatePath(`/dashboard/tactics/${drillId}`)
}

// ─── Version history ──────────────────────────────────────────────────────────

export interface DrillVersion {
  id: string
  drill_id: string
  field: unknown
  objects: unknown
  saved_by: string
  saved_at: string
}

export async function listDrillVersions(drillId: string): Promise<DrillVersion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('drill_versions')
    .select('id, drill_id, field, objects, saved_by, saved_at')
    .eq('drill_id', drillId)
    .order('saved_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as DrillVersion[]
}

export async function restoreDrillVersion(drillId: string, versionId: string): Promise<DrillVersion> {
  const supabase = await createClient()
  const { data: version, error: fetchErr } = await supabase
    .from('drill_versions')
    .select('id, drill_id, field, objects, saved_by, saved_at')
    .eq('id', versionId)
    .eq('drill_id', drillId)
    .single()
  if (fetchErr || !version) throw new Error('Version not found')

  const { error: updateErr } = await supabase
    .from('drills')
    .update({ field: version.field, objects: version.objects })
    .eq('id', drillId)
  if (updateErr) throw new Error(updateErr.message)

  revalidatePath(`/dashboard/tactics/${drillId}`)
  return version as DrillVersion
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface DrillComment {
  id: string
  drill_id: string
  author_id: string
  body: string
  created_at: string
  author_name: string
}

export async function listDrillComments(drillId: string): Promise<DrillComment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('drill_comments')
    .select('id, drill_id, author_id, body, created_at, profiles(display_name)')
    .eq('drill_id', drillId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  type RawRow = {
    id: string; drill_id: string; author_id: string; body: string; created_at: string
    profiles: { display_name: string } | { display_name: string }[] | null
  }
  return ((data ?? []) as unknown as RawRow[]).map(r => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      id: r.id,
      drill_id: r.drill_id,
      author_id: r.author_id,
      body: r.body,
      created_at: r.created_at,
      author_name: prof?.display_name ?? 'Unknown',
    }
  })
}

export async function postDrillComment(drillId: string, body: string): Promise<void> {
  const trimmed = body.trim()
  if (!trimmed || trimmed.length > 2000) throw new Error('Invalid comment body')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles').select('id').eq('user_id', user.id).single()
  if (!profile) throw new Error('No profile')
  const { error } = await supabase.from('drill_comments').insert({
    drill_id: drillId,
    author_id: profile.id,
    body: trimmed,
  })
  if (error) throw new Error(error.message)
}

export async function deleteDrillComment(commentId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('drill_comments').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
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
