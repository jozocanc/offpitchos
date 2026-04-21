import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DrillRowSchema } from '@/lib/tactics/object-schema'
import { renderToStream, type DocumentProps } from '@react-pdf/renderer'
import { BatchDrillPDF } from '@/lib/tactics/pdf-document'
import type { BatchDrill } from '@/lib/tactics/pdf-document'
import { renderThumbnailPng } from '@/lib/tactics/thumbnail'
import React, { type ReactElement } from 'react'

const MAX_DRILLS = 20

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveThumbnail(row: any): Promise<Buffer> {
  const thumbnailPath: string | null = row.thumbnail_path ?? null
  if (thumbnailPath) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${thumbnailPath}`
    try {
      const res = await fetch(url)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    } catch {
      // fall through to on-the-fly render
    }
  }
  const parsed = DrillRowSchema.safeParse(row)
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

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = idsParam
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, MAX_DRILLS)

  if (ids.length === 0) {
    return new Response('No drill IDs provided', { status: 400 })
  }

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

  // Fetch all requested drills — RLS enforces visibility automatically
  const { data: rows, error } = await supabase
    .from('drills')
    .select('id, title, category, description, thumbnail_path, field, objects')
    .in('id', ids)

  if (error) return new Response('Database error', { status: 500 })
  if (!rows || rows.length === 0) return new Response('No drills found', { status: 404 })

  // Preserve the caller's requested order
  const orderedRows = ids
    .map(id => rows.find((r: { id: string }) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null)

  // Resolve thumbnails in parallel
  const thumbnails = await Promise.all(orderedRows.map(r => resolveThumbnail(r)))

  const drills: BatchDrill[] = orderedRows.map((r, i) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    description: r.description ?? '',
    thumbnail: thumbnails[i],
  }))

  const element = React.createElement(BatchDrillPDF, { drills }) as unknown as ReactElement<DocumentProps>
  const stream = await renderToStream(element)

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="drill-pack-${drills.length}.pdf"`,
    },
  })
}
