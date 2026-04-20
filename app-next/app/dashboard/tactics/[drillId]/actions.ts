'use server'
import { createClient } from '@/lib/supabase/server'
import { DrillDocSchema } from '@/lib/tactics/object-schema'
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
