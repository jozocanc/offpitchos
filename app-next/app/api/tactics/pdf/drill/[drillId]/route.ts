import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DrillRowSchema } from '@/lib/tactics/object-schema'
import { renderToStream, type DocumentProps } from '@react-pdf/renderer'
import { DrillPDF } from '@/lib/tactics/pdf-document'
import React, { type ReactElement } from 'react'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'drill'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ drillId: string }> }
) {
  const { drillId } = await params

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

  const { data: row } = await supabase
    .from('drills')
    .select('*')
    .eq('id', drillId)
    .single()

  if (!row) return new Response('Not found', { status: 404 })

  const parsed = DrillRowSchema.safeParse(row)
  if (!parsed.success) return new Response('Corrupt drill', { status: 500 })

  // Fetch creator name + team name in parallel
  const [creatorRes, teamRes] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', row.created_by).single(),
    row.team_id
      ? supabase.from('teams').select('name').eq('id', row.team_id).single()
      : Promise.resolve({ data: null }),
  ])
  const creatorName = creatorRes.data?.display_name ?? 'Unknown'
  const teamName = teamRes.data?.name ?? 'Club-wide'

  // Fetch thumbnail if present
  let thumbnail: Buffer | null = null
  if (row.thumbnail_path) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${row.thumbnail_path}`
    try {
      const res = await fetch(url)
      if (res.ok) thumbnail = Buffer.from(await res.arrayBuffer())
    } catch {
      // ignore — render without thumbnail
    }
  }

  const element = React.createElement(DrillPDF, {
    drill: parsed.data,
    creatorName,
    teamName,
    thumbnail,
  }) as unknown as ReactElement<DocumentProps>

  const stream = await renderToStream(element)

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${slugify(row.title)}.pdf"`,
    },
  })
}
