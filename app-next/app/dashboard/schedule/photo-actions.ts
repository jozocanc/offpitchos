'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

const BUCKET = 'event-photos'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB per photo (post client-side compression)
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SIGNED_URL_TTL = 60 * 60 // 1 hour

export interface EventPhoto {
  id: string
  url: string
  caption: string | null
  uploadedBy: string
  uploaderName: string | null
  createdAt: string
  canDelete: boolean
}

export async function getEventPhotos(eventId: string): Promise<EventPhoto[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('user_id', user.id)
    .single()
  const isDoc = profile?.role === 'doc'

  const { data: photos, error } = await supabase
    .from('event_photos')
    .select('id, storage_path, caption, uploaded_by, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error || !photos || photos.length === 0) return []

  // Look up uploader display names in one round-trip.
  const uploaderIds = Array.from(new Set(photos.map(p => p.uploaded_by)))
  const { data: uploaders } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .in('user_id', uploaderIds)
  const nameByUserId = new Map<string, string | null>(
    (uploaders ?? []).map(u => [u.user_id, u.display_name])
  )

  // Batch-sign URLs via the service client (bucket is private).
  const service = createServiceClient()
  const paths = photos.map(p => p.storage_path)
  const { data: signed } = await service.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL)
  const urlByPath = new Map<string, string>(
    (signed ?? [])
      .filter(s => s.signedUrl && s.path)
      .map(s => [s.path as string, s.signedUrl])
  )

  return photos
    .map(p => ({
      id: p.id,
      url: urlByPath.get(p.storage_path) ?? '',
      caption: p.caption,
      uploadedBy: p.uploaded_by,
      uploaderName: nameByUserId.get(p.uploaded_by) ?? null,
      createdAt: p.created_at,
      canDelete: p.uploaded_by === user.id || isDoc,
    }))
    .filter(p => p.url) // drop any that failed to sign
}

export async function uploadEventPhoto(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const eventId = formData.get('eventId')
  const file = formData.get('file')
  const caption = formData.get('caption')

  if (typeof eventId !== 'string' || !eventId) return { error: 'Missing event' }
  if (!(file instanceof File)) return { error: 'Missing file' }
  if (file.size > MAX_BYTES) return { error: 'File too large (max 5MB)' }
  if (!ALLOWED_MIME.has(file.type)) return { error: 'Only JPG, PNG, or WebP' }

  // Verify the caller is in the event's club — RLS on the insert will
  // enforce this too, but we fail fast with a clearer error.
  const { data: event } = await supabase
    .from('events')
    .select('id, club_id')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }

  const ext = mimeToExt(file.type)
  const path = `${event.club_id}/${eventId}/${crypto.randomUUID()}.${ext}`
  const arrayBuf = await file.arrayBuffer()

  const service = createServiceClient()
  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(path, arrayBuf, { contentType: file.type, upsert: false })
  if (uploadErr) return { error: `Upload failed: ${uploadErr.message}` }

  const { error: insertErr } = await supabase
    .from('event_photos')
    .insert({
      event_id: eventId,
      uploaded_by: user.id,
      storage_path: path,
      caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
      size_bytes: file.size,
    })

  if (insertErr) {
    // Roll back the upload so we don't orphan files.
    await service.storage.from(BUCKET).remove([path])
    return { error: `Save failed: ${insertErr.message}` }
  }

  revalidatePath('/dashboard/schedule')
  return {}
}

export async function deleteEventPhoto(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: photo } = await supabase
    .from('event_photos')
    .select('id, storage_path')
    .eq('id', photoId)
    .single()
  if (!photo) return { error: 'Photo not found' }

  // RLS enforces that only the uploader or a DOC of the event's club
  // can delete. If the delete returns zero rows, the caller wasn't
  // authorized.
  const { data: deleted, error: deleteErr } = await supabase
    .from('event_photos')
    .delete()
    .eq('id', photoId)
    .select('id')

  if (deleteErr) return { error: deleteErr.message }
  if (!deleted || deleted.length === 0) return { error: 'Not allowed' }

  const service = createServiceClient()
  await service.storage.from(BUCKET).remove([photo.storage_path])

  revalidatePath('/dashboard/schedule')
  return {}
}

export async function getEventPhotoCount(eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_photos')
    .select('event_id')
    .in('event_id', eventIds)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1
  }
  return counts
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    default: return 'bin'
  }
}
