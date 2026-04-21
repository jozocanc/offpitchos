import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DrillRowSchema } from '@/lib/tactics/object-schema'
import { renderToStream, type DocumentProps } from '@react-pdf/renderer'
import { SessionPlanPDF } from '@/lib/tactics/pdf-document'
import type { SessionDrill, SessionEvent } from '@/lib/tactics/pdf-document'
import { renderThumbnailPng } from '@/lib/tactics/thumbnail'
import React, { type ReactElement } from 'react'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'session'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveDrillThumbnail(drillRow: any): Promise<Buffer> {
  // Try stored thumbnail first
  const thumbnailPath: string | null = drillRow.thumbnail_path ?? null
  if (thumbnailPath) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${thumbnailPath}`
    try {
      const res = await fetch(url)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    } catch {
      // fall through to on-the-fly render
    }
  }
  // Render on the fly using field + objects from the drill row
  const parsed = DrillRowSchema.safeParse(drillRow)
  if (parsed.success) {
    return renderThumbnailPng(parsed.data.field, parsed.data.objects)
  }
  // Absolute fallback: blank schematic field
  const { FieldSchema } = await import('@/lib/tactics/object-schema')
  const defaultField = FieldSchema.parse({
    width_m: 50, length_m: 68, units: 'm',
    orientation: 'horizontal', half_field: false, style: 'schematic',
  })
  return renderThumbnailPng(defaultField, [])
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile || (profile.role !== 'doc' && profile.role !== 'coach')) {
    return new Response('Forbidden', { status: 403 })
  }

  // Fetch event + team info
  const { data: eventRow } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, notes, team_id, teams(name)')
    .eq('id', eventId)
    .single()

  if (!eventRow) return new Response('Not found', { status: 404 })

  // RLS: coach must be rostered to the event's team (doc sees all in their club)
  if (profile.role === 'coach' && eventRow.team_id) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', eventRow.team_id)
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (!membership) return new Response('Forbidden', { status: 403 })
  }

  // Fetch coach name
  const { data: profileData } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', profile.id)
    .single()
  const coachName = profileData?.display_name ?? 'Unknown'

  const teamName =
    (Array.isArray(eventRow.teams) ? eventRow.teams[0] : eventRow.teams)?.name ?? 'Unknown team'

  // Fetch attached drills in order — include field + objects for on-the-fly rendering
  const { data: attachments } = await supabase
    .from('event_drills')
    .select('id, drill_id, order_index, duration_minutes, coach_notes, drills!inner(id, title, category, description, thumbnail_path, field, objects)')
    .eq('event_id', eventId)
    .order('order_index')

  // Resolve all thumbnails in parallel (stored or on-the-fly)
  const rawDrills = attachments ?? []
  const thumbnails = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawDrills.map((r: any) => resolveDrillThumbnail(r.drills))
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drills: SessionDrill[] = rawDrills.map((r: any, i: number) => ({
    id: r.id,
    drillId: r.drill_id,
    orderIndex: r.order_index,
    durationMinutes: r.duration_minutes ?? 15,
    coachNotes: r.coach_notes ?? null,
    title: r.drills.title,
    category: r.drills.category,
    description: r.drills.description ?? '',
    thumbnail: thumbnails[i],
  }))

  const event: SessionEvent = {
    id: eventRow.id,
    title: eventRow.title,
    start_time: eventRow.start_time,
    end_time: eventRow.end_time,
    notes: eventRow.notes ?? null,
    teamName,
    coachName,
  }

  const element = React.createElement(SessionPlanPDF, { event, drills }) as unknown as ReactElement<DocumentProps>
  const stream = await renderToStream(element)

  const filename = `session-plan-${slugify(eventRow.title)}.pdf`

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
