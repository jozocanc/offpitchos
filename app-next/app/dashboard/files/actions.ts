'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

const BUCKET = 'club-files'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const SIGNED_URL_TTL = 60 * 60 // 1 hour
const BLOCKED_EXTS = new Set(['exe', 'js', 'sh', 'bat', 'cmd', 'com', 'scr', 'msi'])

export interface ClubFile {
  id: string
  name: string
  sizeBytes: number
  mimeType: string
  uploadedBy: string
  uploaderName: string | null
  uploadedAt: string
  canDelete: boolean
}

export async function listClubFiles(): Promise<ClubFile[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) return []
  const isDoc = profile.role === 'doc'

  const { data: files } = await supabase
    .from('club_files')
    .select('id, name, size_bytes, mime_type, uploaded_by, uploaded_at')
    .eq('club_id', profile.club_id)
    .order('uploaded_at', { ascending: false })

  if (!files || files.length === 0) return []

  const uploaderIds = Array.from(new Set(files.map(f => f.uploaded_by)))
  const { data: uploaders } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .in('user_id', uploaderIds)
  const nameByUserId = new Map<string, string | null>(
    (uploaders ?? []).map(u => [u.user_id, u.display_name])
  )

  return files.map(f => ({
    id: f.id,
    name: f.name,
    sizeBytes: Number(f.size_bytes),
    mimeType: f.mime_type,
    uploadedBy: f.uploaded_by,
    uploaderName: nameByUserId.get(f.uploaded_by) ?? null,
    uploadedAt: f.uploaded_at,
    canDelete: isDoc,
  }))
}

export async function uploadClubFile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Missing file' }
  if (file.size === 0) return { error: 'File is empty' }
  if (file.size > MAX_BYTES) return { error: 'File too large (max 25 MB)' }

  const ext = extOf(file.name).toLowerCase()
  if (BLOCKED_EXTS.has(ext)) return { error: 'That file type is not allowed' }

  // Caller must be DOC of a club. RLS enforces the insert check too,
  // but we fail fast with a clearer error.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) return { error: 'No club' }
  if (profile.role !== 'doc') return { error: 'Only DOC can upload' }

  const path = `${profile.club_id}/${crypto.randomUUID()}-${sanitize(file.name)}`
  const arrayBuf = await file.arrayBuffer()

  const service = createServiceClient()
  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(path, arrayBuf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadErr) return { error: `Upload failed: ${uploadErr.message}` }

  const { error: insertErr } = await supabase
    .from('club_files')
    .insert({
      club_id: profile.club_id,
      name: file.name,
      storage_path: path,
      size_bytes: file.size,
      mime_type: file.type || 'application/octet-stream',
      uploaded_by: user.id,
    })

  if (insertErr) {
    // Roll back the storage upload so we don't orphan.
    await service.storage.from(BUCKET).remove([path])
    return { error: `Save failed: ${insertErr.message}` }
  }

  revalidatePath('/dashboard/files')
  return {}
}

export async function deleteClubFile(fileId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: file } = await supabase
    .from('club_files')
    .select('id, storage_path')
    .eq('id', fileId)
    .single()
  if (!file) return { error: 'File not found' }

  // RLS enforces: only DOC of the file's club can delete. If zero rows
  // come back, the caller wasn't authorized.
  const { data: deleted, error: deleteErr } = await supabase
    .from('club_files')
    .delete()
    .eq('id', fileId)
    .select('id')

  if (deleteErr) return { error: deleteErr.message }
  if (!deleted || deleted.length === 0) return { error: 'Not allowed' }

  const service = createServiceClient()
  await service.storage.from(BUCKET).remove([file.storage_path])

  revalidatePath('/dashboard/files')
  return {}
}

export async function getDownloadUrl(fileId: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  // RLS on SELECT enforces club membership.
  const { data: file } = await supabase
    .from('club_files')
    .select('storage_path, name')
    .eq('id', fileId)
    .single()
  if (!file) return { error: 'File not found' }

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL, { download: file.name })

  if (error || !data?.signedUrl) return { error: 'Could not generate download link' }
  return { url: data.signedUrl }
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1) : ''
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}
