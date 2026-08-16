'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { DrillDocSchema } from '@/lib/tactics/object-schema'
import { DRILL_CATEGORIES, type DrillCategory } from '@/lib/tactics/drill-categories'
import {
import { type ActionResult, toActionError } from '@/lib/action-result'
  SYSTEM_PROMPT_CACHED_MESSAGES,
  PDF_IMPORT_SYSTEM_CACHED_MESSAGES,
} from '@/lib/tactics/ai-prompt'

const MODEL = 'claude-sonnet-4-6'
const PDF_MODEL = 'claude-opus-4-7'
const MAX_TOKENS = 4096
const TEMPERATURE = 0.3

export interface GenerateDrillInput {
  description: string
  drillType?: 'auto' | 'rondo' | 'build-up' | 'pressing' | 'finishing' | 'warm-up' | 'ssg' | 'transition' | 'other'
  teamId?: string | null
  fieldOverride?: { width_m: number; length_m: number; half_field?: boolean }
}

export interface GenerateDrillResult {
  drillId: string
}

// ─── Anthropic tool definition — forces structured output ────────────────────

const GENERATE_DRILL_TOOL: Anthropic.Tool = {
  name: 'generate_drill_doc',
  description:
    'Emit a valid DrillDoc JSON object describing a soccer training drill. ' +
    'All player coordinates must be within the field bounds. ' +
    'Respond using ONLY this tool — no prose.',
  input_schema: {
    type: 'object' as const,
    required: ['field', 'objects'],
    properties: {
      field: {
        type: 'object' as const,
        required: ['width_m', 'length_m', 'units', 'orientation', 'half_field', 'style'],
        properties: {
          width_m:     { type: 'number' as const,  minimum: 5,  maximum: 120 },
          length_m:    { type: 'number' as const,  minimum: 5,  maximum: 120 },
          units:       { type: 'string' as const,  enum: ['m', 'yd'] },
          orientation: { type: 'string' as const,  enum: ['horizontal', 'vertical'] },
          half_field:  { type: 'boolean' as const },
          style:       { type: 'string' as const,  enum: ['schematic', 'realistic'] },
        },
      },
      objects: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['id', 'type'],
          properties: {
            id:       { type: 'string' as const },
            type:     { type: 'string' as const },
            x:        { type: 'number' as const },
            y:        { type: 'number' as const },
            role:     { type: 'string' as const },
            color:    { type: 'string' as const },
            variant:  { type: 'string' as const },
            rotation: { type: 'number' as const },
            points:   { type: 'array' as const, items: { type: 'number' as const } },
            style:    { type: 'string' as const },
            thickness:{ type: 'number' as const },
            width:    { type: 'number' as const },
            height:   { type: 'number' as const },
            opacity:  { type: 'number' as const },
            label:    { type: 'string' as const },
            number:   { type: 'number' as const },
            position: { type: 'string' as const },
          },
        },
      },
    },
  },
}

// ─── Anthropic tool definition — PDF import (adds title/description/category) ─

const IMPORT_DRILL_TOOL: Anthropic.Tool = {
  name: 'import_drill_doc',
  description:
    'Emit the drill read from the PDF as a structured object: a title, a ' +
    'description, a drill category, and a valid DrillDoc (field + objects). ' +
    'Respond using ONLY this tool — no prose.',
  input_schema: {
    type: 'object' as const,
    required: ['title', 'description', 'category', 'field', 'objects'],
    properties: {
      title: { type: 'string' as const, description: 'Drill name from the PDF heading.' },
      description: {
        type: 'string' as const,
        description: 'Setup, objective and coaching points in flowing prose.',
      },
      category: { type: 'string' as const, enum: [...DRILL_CATEGORIES] },
      field: {
        type: 'object' as const,
        required: ['width_m', 'length_m', 'units', 'orientation', 'half_field', 'style'],
        properties: {
          width_m:     { type: 'number' as const,  minimum: 5,  maximum: 120 },
          length_m:    { type: 'number' as const,  minimum: 5,  maximum: 120 },
          units:       { type: 'string' as const,  enum: ['m', 'yd'] },
          orientation: { type: 'string' as const,  enum: ['horizontal', 'vertical'] },
          half_field:  { type: 'boolean' as const },
          style:       { type: 'string' as const,  enum: ['schematic', 'realistic'] },
        },
      },
      objects: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['id', 'type'],
          properties: {
            id:       { type: 'string' as const },
            type:     { type: 'string' as const },
            x:        { type: 'number' as const },
            y:        { type: 'number' as const },
            role:     { type: 'string' as const },
            color:    { type: 'string' as const },
            variant:  { type: 'string' as const },
            rotation: { type: 'number' as const },
            points:   { type: 'array' as const, items: { type: 'number' as const } },
            style:    { type: 'string' as const },
            thickness:{ type: 'number' as const },
            width:    { type: 'number' as const },
            height:   { type: 'number' as const },
            opacity:  { type: 'number' as const },
            label:    { type: 'string' as const },
            number:   { type: 'number' as const },
            position: { type: 'string' as const },
          },
        },
      },
    },
  },
}

// ─── Helper: call Claude and extract tool_use input ──────────────────────────

async function callClaude(
  client: Anthropic,
  userContent: string,
  retryReminder?: string,
): Promise<unknown> {
  const userMessage: Anthropic.MessageParam = {
    role: 'user',
    content: retryReminder
      ? `${userContent}\n\n[REMINDER] ${retryReminder}`
      : userContent,
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: SYSTEM_PROMPT_CACHED_MESSAGES,
    tools: [GENERATE_DRILL_TOOL],
    tool_choice: { type: 'auto' },
    messages: [userMessage],
  })

  // Log cache metrics for cost monitoring
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_AI_USAGE === '1') {
    console.log('[AI Tactics] usage:', JSON.stringify(response.usage))
  }

  // Extract the tool_use block
  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Model did not call the generate_drill_doc tool. Please try again.')
  }

  return toolBlock.input
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function generateDrillFromDescription(
  ...args: Parameters<typeof _generateDrillFromDescription>
): Promise<ActionResult<Awaited<ReturnType<typeof _generateDrillFromDescription>>>> {
  try {
    return { ok: true, data: await _generateDrillFromDescription(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _generateDrillFromDescription(
  input: GenerateDrillInput,
): Promise<GenerateDrillResult> {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club associated with this account')
  if (profile.role !== 'doc' && profile.role !== 'coach') {
    throw new Error('Only DOCs and coaches can generate drills')
  }

  // ── Resolve teamId ──────────────────────────────────────────────────────────
  let resolvedTeamId: string | null = input.teamId ?? null

  // If coach and no team specified, default to their first rostered team
  if (profile.role === 'coach' && resolvedTeamId === undefined) {
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', profile.id)
      .limit(1)
      .single()
    resolvedTeamId = teamMembership?.team_id ?? null
  }

  // DOCs can create club-wide drills (teamId = null); coaches must have a team
  if (profile.role === 'coach' && !resolvedTeamId) {
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', profile.id)
      .limit(1)
      .single()
    resolvedTeamId = teamMembership?.team_id ?? null
  }

  // ── Build user message ──────────────────────────────────────────────────────
  const drillTypeHint =
    input.drillType && input.drillType !== 'auto'
      ? `\nDrill type hint: ${input.drillType}`
      : ''
  const fieldHint = input.fieldOverride
    ? `\nField size override: ${input.fieldOverride.width_m}m wide × ${input.fieldOverride.length_m}m long${input.fieldOverride.half_field ? ' (half field)' : ''}`
    : ''
  const userMessage = `${input.description.trim()}${drillTypeHint}${fieldHint}`

  // ── Call Claude (with one retry on validation failure) ──────────────────────
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  let rawOutput: unknown
  let parseResult = null as ReturnType<typeof DrillDocSchema.safeParse> | null

  try {
    rawOutput = await callClaude(client, userMessage)
    parseResult = DrillDocSchema.safeParse(rawOutput)
  } catch (err) {
    throw new Error(
      `Failed to reach AI service: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }

  // Retry once on Zod validation failure
  if (!parseResult.success) {
    const zodErrors = JSON.stringify(parseResult.error.issues.slice(0, 5))
    console.warn('[AI Tactics] First attempt validation failed, retrying.', zodErrors)
    try {
      rawOutput = await callClaude(
        client,
        userMessage,
        `Your previous response failed schema validation with these errors: ${zodErrors}. ` +
          'Emit ONLY valid DrillDoc JSON via the generate_drill_doc tool. ' +
          'Ensure all zone colors are #rrggbb hex, all required fields are present, ' +
          'and all coordinates are within the declared field dimensions.',
      )
      parseResult = DrillDocSchema.safeParse(rawOutput)
    } catch (err) {
      throw new Error(
        `AI retry call failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  if (!parseResult.success) {
    console.error('[AI Tactics] Second attempt also failed validation:', parseResult.error.issues)
    throw new Error(
      "Couldn't generate from that description — try being more specific " +
        '(e.g., include number of players, field size, or drill type).',
    )
  }

  const doc = parseResult.data

  // ── Derive a title from the description ─────────────────────────────────────
  const words = input.description.trim().split(/\s+/)
  const title =
    words.length <= 6
      ? input.description.trim()
      : words.slice(0, 6).join(' ') + '…'

  // ── Map drillType to category (or use 'other' as fallback) ──────────────────
  const category =
    input.drillType && input.drillType !== 'auto' ? input.drillType : 'other'

  // ── Insert drill row ────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await supabase
    .from('drills')
    .insert({
      club_id:     profile.club_id,
      team_id:     resolvedTeamId,
      created_by:  profile.id,
      title,
      description: input.description.trim(),
      category,
      visibility:  'private',
      field:       doc.field,
      objects:     doc.objects,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Failed to save drill to database')
  }

  revalidatePath('/dashboard/tactics')
  return { drillId: inserted.id }
}

// ─── PDF import ───────────────────────────────────────────────────────────────

export interface PdfPageInput {
  pngDataUrl: string
  text: string
}

export interface GenerateDrillFromPdfInput {
  pages: PdfPageInput[]
  teamId?: string | null
}

function dataUrlToParts(
  dataUrl: string,
): { mediaType: 'image/png' | 'image/jpeg'; base64: string } | null {
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  return { mediaType: m[1] as 'image/png' | 'image/jpeg', base64: m[2] }
}

async function callClaudePdf(
  client: Anthropic,
  pages: PdfPageInput[],
  retryReminder?: string,
): Promise<unknown> {
  const content: Anthropic.MessageParam['content'] = []
  pages.forEach((p, i) => {
    const parts = dataUrlToParts(p.pngDataUrl)
    if (!parts) return
    content.push({ type: 'text', text: `--- Page ${i + 1} image ---` })
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: parts.mediaType, data: parts.base64 },
    })
  })
  if (content.length === 0) {
    throw new Error('No readable page images were provided.')
  }

  const combinedText = pages
    .map((p, i) => `--- Page ${i + 1} text ---\n${p.text || '(no selectable text on this page)'}`)
    .join('\n\n')
    .slice(0, 12000)
  content.push({
    type: 'text',
    text:
      'Extracted PDF text below — use it to verify titles, numbers and instructions, ' +
      `and to disambiguate anything unclear in the images.\n\n${combinedText}\n\n` +
      'Call the import_drill_doc tool now with every element you can see in the diagram(s).' +
      (retryReminder ? `\n\n[REMINDER] ${retryReminder}` : ''),
  })

  // Opus 4.7 rejects the temperature parameter — omit it.
  const response = await client.messages.create({
    model: PDF_MODEL,
    max_tokens: MAX_TOKENS,
    system: PDF_IMPORT_SYSTEM_CACHED_MESSAGES,
    tools: [IMPORT_DRILL_TOOL],
    tool_choice: { type: 'tool', name: 'import_drill_doc' },
    messages: [{ role: 'user', content }],
  })

  if (process.env.NODE_ENV !== 'production' || process.env.LOG_AI_USAGE === '1') {
    console.log('[AI Tactics PDF] usage:', JSON.stringify(response.usage))
  }

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('The parser did not return a structured drill. Please try again.')
  }
  return toolBlock.input
}

export async function generateDrillFromPdf(
  ...args: Parameters<typeof _generateDrillFromPdf>
): Promise<ActionResult<Awaited<ReturnType<typeof _generateDrillFromPdf>>>> {
  try {
    return { ok: true, data: await _generateDrillFromPdf(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _generateDrillFromPdf(
  input: GenerateDrillFromPdfInput,
): Promise<GenerateDrillResult> {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club associated with this account')
  if (profile.role !== 'doc' && profile.role !== 'coach') {
    throw new Error('Only DOCs and coaches can import drills')
  }

  const pages = (input.pages ?? []).slice(0, 5)
  if (pages.length === 0) throw new Error('No PDF pages were provided')

  // ── Resolve teamId — coaches default to their first rostered team ───────────
  let resolvedTeamId: string | null = input.teamId ?? null
  if (profile.role === 'coach' && !resolvedTeamId) {
    const { data: teamMembership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', profile.id)
      .limit(1)
      .single()
    resolvedTeamId = teamMembership?.team_id ?? null
  }

  // ── Call Claude (Opus vision) with one retry on validation failure ──────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let raw: Record<string, unknown>
  try {
    raw = (await callClaudePdf(client, pages)) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `Parser couldn't read that PDF: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }

  let parseResult = DrillDocSchema.safeParse({ field: raw.field, objects: raw.objects })

  if (!parseResult.success) {
    const zodErrors = JSON.stringify(parseResult.error.issues.slice(0, 5))
    console.warn('[AI Tactics PDF] First attempt validation failed, retrying.', zodErrors)
    try {
      raw = (await callClaudePdf(
        client,
        pages,
        `Your previous response failed schema validation with these errors: ${zodErrors}. ` +
          'Emit ONLY valid output via the import_drill_doc tool. Ensure every zone color ' +
          'is #rrggbb hex, all required fields are present, and all coordinates are within ' +
          'the declared field dimensions.',
      )) as Record<string, unknown>
      parseResult = DrillDocSchema.safeParse({ field: raw.field, objects: raw.objects })
    } catch (err) {
      throw new Error(
        `Parser retry failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  if (!parseResult.success) {
    console.error('[AI Tactics PDF] Second attempt also failed validation:', parseResult.error.issues)
    throw new Error(
      "Couldn't reproduce that drill from the PDF — the diagram may be too unclear. " +
        'Try a cleaner PDF or build the drill manually.',
    )
  }

  const doc = parseResult.data

  // ── Title / description / category from the tool output ─────────────────────
  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : ''
  const title = rawTitle.slice(0, 120) || 'Imported drill'
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  const category: DrillCategory =
    typeof raw.category === 'string' && (DRILL_CATEGORIES as readonly string[]).includes(raw.category)
      ? (raw.category as DrillCategory)
      : 'other'

  // ── Insert drill row ────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await supabase
    .from('drills')
    .insert({
      club_id:     profile.club_id,
      team_id:     resolvedTeamId,
      created_by:  profile.id,
      title,
      description,
      category,
      visibility:  'private',
      field:       doc.field,
      objects:     doc.objects,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Failed to save drill to database')
  }

  revalidatePath('/dashboard/tactics')
  return { drillId: inserted.id }
}
