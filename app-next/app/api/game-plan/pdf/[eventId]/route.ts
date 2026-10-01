import { NextRequest } from 'next/server'
import React, { type ReactElement } from 'react'
import { renderToStream, type DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { isStaff, roleLabel } from '@/lib/constants'
import { DrillDocSchema, FieldSchema } from '@/lib/tactics/object-schema'
import { renderThumbnailPng } from '@/lib/tactics/thumbnail'
import type { BatchDrill } from '@/lib/tactics/pdf-document'
import { GamePlanPDF } from '@/lib/game-plan-pdf'
import {
  SET_PIECE_KEYS,
  normalizePlanDoc,
  parsePrintSections,
  placedCount,
  type PlanPlayer,
  type PrintSection,
  type SetPieceKey,
} from '@/lib/game-plan'

// Game plan PDF (059). Staff only. ?sections=lineup,corner_attack_left,drill:<id>
// picks and orders what prints (default: everything set up). ?paper=a4|letter.

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'game'
}

// Stored library thumbnail, else rendered from the board (same as the
// session plan PDF).
async function drillThumbnail(row: { thumbnail_path: string | null; field: unknown; objects: unknown }): Promise<Buffer> {
  if (row.thumbnail_path) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${row.thumbnail_path}`
    try {
      const res = await fetch(url)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    } catch {
      // fall through to on-the-fly render
    }
  }
  const parsed = DrillDocSchema.safeParse({ field: row.field, objects: row.objects })
  if (parsed.success) return renderThumbnailPng(parsed.data.field, parsed.data.objects)
  return renderThumbnailPng(
    FieldSchema.parse({ width_m: 50, length_m: 68, units: 'm', orientation: 'horizontal', half_field: false, style: 'schematic' }),
    [],
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!UUID_RE.test(eventId)) return new Response('Not found', { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || !isStaff(profile.role)) return new Response('Forbidden', { status: 403 })

  const { data: event } = await supabase
    .from('events')
    .select('id, type, title, start_time, end_time, address, team_id, teams ( name ), venues ( name, address )')
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .maybeSingle()
  if (!event || (event.type !== 'game' && event.type !== 'tournament')) {
    return new Response('Not found', { status: 404 })
  }

  const [{ data: planRow }, { data: rosterRows }, timeZone] = await Promise.all([
    supabase
      .from('game_plans')
      .select('formation, lineup, set_pieces, drill_ids, notes')
      .eq('event_id', eventId)
      .maybeSingle(),
    supabase.rpc('get_team_roster', { p_team_id: event.team_id }),
    getClubTimezone(),
  ])
  const doc = normalizePlanDoc(planRow)

  // Sections: requested order is fixed (lineup, corners, drills in plan order).
  const requested = parsePrintSections(req.nextUrl.searchParams.get('sections'))
  const defaults: PrintSection[] = [
    ...(placedCount(doc.lineup) > 0 ? (['lineup'] as PrintSection[]) : []),
    ...SET_PIECE_KEYS.filter(k => doc.set_pieces[k]),
    ...doc.drill_ids.map(id => `drill:${id}` as PrintSection),
  ]
  const wanted = new Set<PrintSection>(requested ?? defaults)
  const showLineup = wanted.has('lineup')
  const corners: SetPieceKey[] = SET_PIECE_KEYS.filter(k => wanted.has(k) && doc.set_pieces[k])
  const drillIds = doc.drill_ids.filter(id => wanted.has(`drill:${id}`))

  const drillQuery = drillIds.length
    ? supabase
        .from('drills')
        .select('id, title, category, description, thumbnail_path, field, objects')
        .eq('club_id', profile.club_id)
        .in('id', drillIds)
        .then(r => r.data ?? [])
    : Promise.resolve([] as { id: string; title: string; category: string; description: string | null; thumbnail_path: string | null; field: unknown; objects: unknown }[])

  const [drillRows, docRows, coachRows] = await Promise.all([
    drillQuery,
    supabase.from('profiles').select('display_name, role').eq('club_id', profile.club_id).eq('role', 'doc'),
    supabase
      .from('team_members')
      .select('profiles ( display_name, role, staff_title )')
      .eq('team_id', event.team_id)
      .eq('role', 'coach'),
  ])

  const drillById = new Map(drillRows.map(d => [d.id as string, d]))
  const orderedDrills = drillIds.map(id => drillById.get(id)).filter(Boolean) as typeof drillRows
  const thumbs = await Promise.all(orderedDrills.map(d => drillThumbnail(d)))
  const drills: BatchDrill[] = orderedDrills.map((d, i) => ({
    id: d.id as string,
    title: d.title as string,
    category: d.category as string,
    description: (d.description as string | null) ?? '',
    thumbnail: thumbs[i],
  }))

  const staff: { name: string; title: string }[] = []
  const seen = new Set<string>()
  for (const p of docRows.data ?? []) {
    const name = ((p.display_name as string | null) ?? '').trim()
    if (name && !seen.has(name)) { seen.add(name); staff.push({ name, title: roleLabel('doc') }) }
  }
  for (const row of coachRows.data ?? []) {
    const p = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { display_name?: string | null; role?: string | null; staff_title?: string | null } | null
    const name = (p?.display_name ?? '').trim()
    if (!name || seen.has(name) || p?.role === 'doc') continue
    seen.add(name)
    staff.push({ name, title: roleLabel(p?.role ?? 'coach', p?.staff_title) })
  }

  type RosterRow = { id: string; first_name: string | null; last_name: string | null; jersey_number: number | null; position: string | null }
  const players: PlanPlayer[] = ((rosterRows ?? []) as RosterRow[]).map(p => ({
    id: p.id,
    firstName: p.first_name ?? '',
    lastName: p.last_name ?? '',
    jerseyNumber: p.jersey_number ?? null,
    position: p.position ?? null,
    availability: 'unknown',
  }))

  if (!showLineup && corners.length === 0 && drills.length === 0) {
    return new Response('Nothing to print: pick at least one section that is set up.', { status: 400 })
  }

  const team = Array.isArray(event.teams) ? event.teams[0] : event.teams
  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues
  const size = req.nextUrl.searchParams.get('paper') === 'a4' ? 'A4' : 'LETTER'

  const element = React.createElement(GamePlanPDF, {
    event: {
      title: event.title as string,
      teamName: (team as { name?: string } | null)?.name ?? '',
      startTime: event.start_time as string,
      endTime: event.end_time as string,
      venueName: (venue as { name?: string } | null)?.name ?? null,
      venueAddress: (event.address as string | null) || (venue as { address?: string | null } | null)?.address || null,
    },
    doc,
    players,
    staff,
    showLineup,
    corners,
    drills,
    timeZone,
    size,
  }) as unknown as ReactElement<DocumentProps>
  const stream = await renderToStream(element)

  const onlyLineup = showLineup && corners.length === 0 && drills.length === 0
  const filename = `${onlyLineup ? 'lineup' : 'game-plan'}-${slugify(event.title as string)}.pdf`
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
