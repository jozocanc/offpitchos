'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { DrillDocSchema } from '@/lib/tactics/object-schema'
import { SYSTEM_PROMPT_CACHED_MESSAGES } from '@/lib/tactics/ai-prompt'

const MODEL = 'claude-sonnet-4-6'
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
