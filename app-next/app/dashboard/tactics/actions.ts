'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { DrillCategory, Visibility } from '@/lib/tactics/drill-categories'

export interface DrillSummary {
  id: string
  title: string
  category: DrillCategory
  visibility: Visibility
  teamId: string | null
  teamName: string | null
  createdById: string
  createdByName: string | null
  thumbnailUrl: string | null
  updatedAt: string
  canEdit: boolean
  canDelete: boolean
}

export async function listDrills(filters?: {
  teamId?: string | 'all' | 'none'
  category?: DrillCategory | 'all'
  visibility?: Visibility | 'mine' | 'all'
  search?: string
}): Promise<DrillSummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) return []

  let q = supabase
    .from('drills')
    .select('id, title, category, visibility, team_id, created_by, thumbnail_path, updated_at')
    .eq('club_id', profile.club_id)
    .order('updated_at', { ascending: false })

  if (filters?.teamId === 'none') q = q.is('team_id', null)
  else if (filters?.teamId && filters.teamId !== 'all') q = q.eq('team_id', filters.teamId)
  if (filters?.category && filters.category !== 'all') q = q.eq('category', filters.category)
  if (filters?.visibility === 'mine') q = q.eq('created_by', profile.id)
  else if (filters?.visibility && filters.visibility !== 'all') q = q.eq('visibility', filters.visibility)
  if (filters?.search) q = q.ilike('title', `%${filters.search}%`)

  const { data } = await q
  if (!data) return []

  const teamIds = Array.from(new Set(data.map(d => d.team_id).filter(Boolean))) as string[]
  const creatorIds = Array.from(new Set(data.map(d => d.created_by)))
  const [teamsRes, profilesRes] = await Promise.all([
    teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] as { id: string, name: string }[] }),
    supabase.from('profiles').select('id, display_name').in('id', creatorIds),
  ])
  const teamById = new Map((teamsRes.data ?? []).map(t => [t.id, t.name]))
  const nameById = new Map((profilesRes.data ?? []).map(p => [p.id, p.display_name]))

  return data.map(d => ({
    id: d.id,
    title: d.title,
    category: d.category,
    visibility: d.visibility,
    teamId: d.team_id,
    teamName: d.team_id ? teamById.get(d.team_id) ?? null : null,
    createdById: d.created_by,
    createdByName: nameById.get(d.created_by) ?? null,
    thumbnailUrl: d.thumbnail_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${d.thumbnail_path}`
      : null,
    updatedAt: d.updated_at,
    canEdit: d.created_by === profile.id || profile.role === 'doc',
    canDelete: d.created_by === profile.id || profile.role === 'doc',
  }))
}

export async function createBlankDrill(teamId: string | null): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) throw new Error('No club')
  if (profile.role !== 'doc' && profile.role !== 'coach') throw new Error('Forbidden')

  const { data, error } = await supabase.from('drills').insert({
    club_id: profile.club_id,
    team_id: teamId,
    created_by: profile.id,
    title: 'Untitled drill',
  }).select('id').single()

  if (error || !data) throw new Error(error?.message ?? 'Insert failed')
  revalidatePath('/dashboard/tactics')
  return data.id
}

export async function deleteDrill(drillId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('drills').delete().eq('id', drillId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tactics')
}

export async function duplicateDrill(drillId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles').select('id, club_id').eq('user_id', user.id).single()
  if (!profile?.club_id) throw new Error('No club')

  const { data: src } = await supabase.from('drills').select('*').eq('id', drillId).single()
  if (!src) throw new Error('Not found')

  const { data, error } = await supabase.from('drills').insert({
    club_id: profile.club_id,
    team_id: src.team_id,
    created_by: profile.id,
    title: `${src.title} (copy)`,
    description: src.description,
    category: src.category,
    visibility: 'private',
    field: src.field,
    objects: src.objects,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Duplicate failed')
  revalidatePath('/dashboard/tactics')
  return data.id
}

export async function updateVisibility(drillId: string, visibility: Visibility) {
  const supabase = await createClient()
  const { error } = await supabase.from('drills').update({ visibility }).eq('id', drillId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tactics')
}
