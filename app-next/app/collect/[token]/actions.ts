'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CollectPlayer {
  firstName: string
  lastName: string
  teamName: string
  clubName: string
  jerseySize: string | null
  shortsSize: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  dietaryNotes: string | null
  collectedAt: string | null
}

/**
 * The token IS the credential on this page, so every read and write goes
 * through it and nothing else. No club_id, no player id from the client: a
 * caller who could name the row they wanted to write would be able to edit
 * any player in any club.
 */
export async function getCollectPlayer(token: string): Promise<CollectPlayer | null> {
  if (!UUID.test(token)) return null

  try {
    const service = createServiceClient()
    const { data } = await service
      .from('players')
      .select('first_name, last_name, jersey_size, shorts_size, address, emergency_contact_name, emergency_contact_phone, dietary_notes, collected_at, teams(name), clubs(name)')
      .eq('collect_token', token)
      .single()

    if (!data) return null

    const team = Array.isArray(data.teams) ? data.teams[0] : data.teams
    const club = Array.isArray(data.clubs) ? data.clubs[0] : data.clubs

    return {
      firstName: data.first_name,
      lastName: data.last_name,
      teamName: (team as { name?: string } | null)?.name ?? '',
      clubName: (club as { name?: string } | null)?.name ?? '',
      jerseySize: data.jersey_size,
      shortsSize: data.shorts_size,
      address: data.address,
      emergencyContactName: data.emergency_contact_name,
      emergencyContactPhone: data.emergency_contact_phone,
      dietaryNotes: data.dietary_notes,
      collectedAt: data.collected_at,
    }
  } catch {
    return null
  }
}

export async function saveCollectedDetails(
  token: string,
  fields: {
    jerseySize: string
    shortsSize: string
    address: string
    emergencyContactName: string
    emergencyContactPhone: string
    dietaryNotes: string
  }
): Promise<ActionResult> {
  try {
    if (!UUID.test(token)) throw new Error('This link is not valid.')

    const service = createServiceClient()

    // Blank means "not answered", so it is stored as null rather than '' —
    // the gear page counts a missing size by null-ness.
    const orNull = (v: string) => {
      const t = v.trim()
      return t === '' ? null : t
    }

    const { data, error } = await service
      .from('players')
      .update({
        jersey_size: orNull(fields.jerseySize),
        shorts_size: orNull(fields.shortsSize),
        address: orNull(fields.address),
        emergency_contact_name: orNull(fields.emergencyContactName),
        emergency_contact_phone: orNull(fields.emergencyContactPhone),
        dietary_notes: orNull(fields.dietaryNotes),
        collected_at: new Date().toISOString(),
      })
      .eq('collect_token', token)
      .select('id')
      .single()

    if (error || !data) throw new Error('This link is not valid.')

    revalidatePath(`/collect/${token}`)
    revalidatePath('/dashboard/gear')
    return { ok: true, data: undefined }
  } catch (e) {
    return toActionError(e)
  }
}
