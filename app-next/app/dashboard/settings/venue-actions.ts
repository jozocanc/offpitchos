'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'

export async function getVenues(
  ...args: Parameters<typeof _getVenues>
): Promise<ActionResult<Awaited<ReturnType<typeof _getVenues>>>> {
  try {
    return { ok: true, data: await _getVenues(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getVenues() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) return []

  const { data } = await supabase
    .from('venues')
    .select('id, name, address')
    .eq('club_id', profile.club_id)
    .order('name')

  return data ?? []
}

export async function addVenue(
  ...args: Parameters<typeof _addVenue>
): Promise<ActionResult<Awaited<ReturnType<typeof _addVenue>>>> {
  try {
    return { ok: true, data: await _addVenue(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _addVenue(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!name?.trim()) throw new Error('Venue name is required')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('Could not find your club')

  const { error } = await supabase
    .from('venues')
    .insert({ name: name.trim(), address: address?.trim() || null, club_id: profile.club_id })

  if (error) throw new Error(`Failed to add venue: ${error.message}`)

  revalidatePath('/dashboard/settings')
}

export async function updateVenue(
  ...args: Parameters<typeof _updateVenue>
): Promise<ActionResult<Awaited<ReturnType<typeof _updateVenue>>>> {
  try {
    return { ok: true, data: await _updateVenue(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _updateVenue(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!id || !name?.trim()) throw new Error('Venue ID and name are required')

  const { error } = await supabase
    .from('venues')
    .update({ name: name.trim(), address: address?.trim() || null })
    .eq('id', id)

  if (error) throw new Error(`Failed to update venue: ${error.message}`)

  revalidatePath('/dashboard/settings')
}

export async function deleteVenue(
  ...args: Parameters<typeof _deleteVenue>
): Promise<ActionResult<Awaited<ReturnType<typeof _deleteVenue>>>> {
  try {
    return { ok: true, data: await _deleteVenue(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _deleteVenue(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = formData.get('id') as string
  if (!id) throw new Error('Venue ID is required')

  const { error } = await supabase.from('venues').delete().eq('id', id)

  if (error) throw new Error(`Failed to delete venue: ${error.message}`)

  revalidatePath('/dashboard/settings')
}
