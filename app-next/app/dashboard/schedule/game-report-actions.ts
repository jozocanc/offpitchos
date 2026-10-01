'use server'

import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { assertNotPreview } from '@/lib/admin-role'
import { isStaff, isMember } from '@/lib/constants'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { sendPushToProfiles } from '@/lib/push'
import {
  EXTRACTED_FIELDS,
  MAX_REPORT_BYTES,
  SUPPORTED_TYPES_LABEL,
  matchRowsToRoster,
  summarizeLine,
  type ExtractedPlayerRow,
  type GameStatInput,
  type MatchedRow,
  type RosterPlayer,
} from '@/lib/game-stats'

const BUCKET = 'game-reports'
// Sonnet-class for document reading accuracy at a sensible cost per report.
const MODEL = 'claude-sonnet-5-5'
const MAX_TEXT_CHARS = 400_000
// Extracted text kept for the side-by-side review (CSV/Excel/Word/TXT).
const MAX_SOURCE_TEXT_CHARS = 200_000
const SIGNED_URL_TTL = 60 * 60

// ─── Types returned to the client ────────────────────────────────────────────

/**
 * One game report as the review screen needs it. 'parsed' = AI draft, not on
 * any player profile yet. 'confirmed' = saved; savedRows are the live stats.
 */
export interface GameReportView {
  reportId: string
  status: 'parsed' | 'confirmed'
  fileName: string | null
  mimeType: string | null
  /** Short-lived signed URL of the original file (PDF/image preview). */
  fileUrl: string | null
  /** Text the AI read, for CSV/Excel/Word/TXT previews. */
  sourceText: string | null
  teamNameAsWritten: string | null
  opponentName: string | null
  teamScore: number | null
  opponentScore: number | null
  /** AI rows matched to the roster (empty for manual entries). */
  matched: MatchedRow[]
  unmatched: ExtractedPlayerRow[]
  /** Saved stat lines; confirmed reports only. */
  savedRows: GameStatInput[] | null
}

export interface GameReportContext {
  event: { id: string; title: string; start_time: string; type: string; team_name: string | null }
  clubName: string
  roster: RosterPlayer[]
  /** The saved report, if stats exist for this game. */
  confirmed: GameReportView | null
  /** An uploaded report still waiting for review. */
  draft: GameReportView | null
}

export interface SavedGameStats {
  reportId: string
  teamScore: number | null
  opponentScore: number | null
  playerCount: number
}

export interface GameScore {
  teamScore: number | null
  opponentScore: number | null
}

// ─── Shared guards ───────────────────────────────────────────────────────────

/**
 * Staff caller + a game/tournament event in their club. RLS enforces the same
 * on every write; this gives the coach a clear error instead of an empty
 * result.
 */
async function requireStaffEvent(eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role, clubs(name)')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No team found')
  if (!isStaff(profile.role)) throw new Error('Only staff can add game stats.')

  const { data: event } = await supabase
    .from('events')
    .select('id, club_id, team_id, type, title, start_time, teams(name)')
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .maybeSingle()

  if (!event) throw new Error('Event not found.')
  if (event.type !== 'game' && event.type !== 'tournament') {
    throw new Error('Game reports are for games and tournaments only.')
  }

  const club = Array.isArray(profile.clubs) ? profile.clubs[0] : profile.clubs
  const team = Array.isArray(event.teams) ? event.teams[0] : event.teams

  return {
    supabase,
    userId: user.id,
    clubId: profile.club_id as string,
    clubName: ((club as { name?: string } | null)?.name ?? '') as string,
    event: {
      id: event.id as string,
      club_id: event.club_id as string,
      team_id: event.team_id as string,
      type: event.type as string,
      title: event.title as string,
      start_time: event.start_time as string,
      team_name: ((team as { name?: string } | null)?.name ?? null) as string | null,
    },
  }
}

type StaffCtx = Awaited<ReturnType<typeof requireStaffEvent>>

async function loadRoster(supabase: StaffCtx['supabase'], teamId: string): Promise<RosterPlayer[]> {
  const { data } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, position')
    .eq('team_id', teamId)
    .order('jersey_number', { ascending: true, nullsFirst: false })
    .order('last_name', { ascending: true })
  return (data ?? []) as RosterPlayer[]
}

// ─── File type handling ──────────────────────────────────────────────────────

type ReportKind =
  | { kind: 'pdf'; mime: 'application/pdf' }
  | { kind: 'image'; mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
  | { kind: 'csv' | 'text' | 'excel' | 'word'; mime: string }

const UNSUPPORTED_MESSAGE = `That file type isn't supported. Upload a ${SUPPORTED_TYPES_LABEL}.`

function detectKind(fileName: string, mimeType: string): ReportKind {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()

  if (ext === 'heic' || ext === 'heif' || mime === 'image/heic' || mime === 'image/heif') {
    throw new Error('HEIC photos can’t be read yet. Take a screenshot of it, or export it as JPG or PNG, and upload that.')
  }
  if (ext === 'doc' || mime === 'application/msword') {
    throw new Error('Old .doc files can’t be read. Save it as .docx or PDF and upload that.')
  }
  if (ext === 'pdf' || mime === 'application/pdf') return { kind: 'pdf', mime: 'application/pdf' }
  if (ext === 'jpg' || ext === 'jpeg' || mime === 'image/jpeg') return { kind: 'image', mime: 'image/jpeg' }
  if (ext === 'png' || mime === 'image/png') return { kind: 'image', mime: 'image/png' }
  if (ext === 'webp' || mime === 'image/webp') return { kind: 'image', mime: 'image/webp' }
  if (ext === 'gif' || mime === 'image/gif') return { kind: 'image', mime: 'image/gif' }
  if (ext === 'csv' || mime === 'text/csv') return { kind: 'csv', mime: 'text/csv' }
  if (ext === 'txt' || ext === 'tsv' || mime === 'text/plain' || mime === 'text/tab-separated-values') {
    return { kind: 'text', mime: 'text/plain' }
  }
  if (ext === 'xlsx' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return { kind: 'excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  }
  if (ext === 'xls' || mime === 'application/vnd.ms-excel') return { kind: 'excel', mime: 'application/vnd.ms-excel' }
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return { kind: 'word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  }
  throw new Error(UNSUPPORTED_MESSAGE)
}

const EXT_BY_KIND: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

function cleanFileName(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, '').slice(0, 255) || 'report'
}

/** Turn the file into the content block(s) Claude reads. */
async function toContentBlocks(
  kind: ReportKind,
  buf: Buffer,
  fileName: string,
): Promise<{ blocks: Anthropic.Beta.BetaContentBlockParam[]; sourceText: string | null }> {
  if (kind.kind === 'pdf') {
    return {
      sourceText: null,
      blocks: [{
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
      }],
    }
  }
  if (kind.kind === 'image') {
    return {
      sourceText: null,
      blocks: [{
        type: 'image',
        source: { type: 'base64', media_type: kind.mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: buf.toString('base64') },
      }],
    }
  }

  let text: string
  if (kind.kind === 'excel') {
    const wb = XLSX.read(buf, { type: 'buffer' })
    text = wb.SheetNames
      .map(name => `--- Sheet: ${name} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })}`)
      .join('\n\n')
  } else if (kind.kind === 'word') {
    const res = await mammoth.extractRawText({ buffer: buf })
    text = res.value
  } else {
    text = buf.toString('utf8')
  }

  text = text.trim()
  if (!text) throw new Error('That file looks empty. Check it has the box score in it and try again.')
  if (text.length > MAX_TEXT_CHARS) {
    throw new Error('That file is too long to read in one go. Upload just the box score page.')
  }
  return {
    sourceText: text.slice(0, MAX_SOURCE_TEXT_CHARS),
    blocks: [{ type: 'text', text: `--- File: ${fileName} ---\n${text}\n--- End of file ---` }],
  }
}

// ─── Claude extraction ───────────────────────────────────────────────────────

// No minimum: strict tool schemas reject it. sanitizeExtraction drops negatives.
const nullableInt = { type: ['integer', 'null'] as const }

const EXTRACT_TOOL = {
  name: 'record_box_score',
  description:
    'Record the final score and OUR team’s player stats read from the game report. ' +
    'Only our team’s players, never the opponent’s. Use null for any stat the report does not show.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['our_team_found', 'team_name_as_written', 'opponent_name', 'our_score', 'opponent_score', 'players'],
    properties: {
      our_team_found: {
        type: 'boolean',
        description: 'False if you cannot tell which side of the report is our team.',
      },
      team_name_as_written: {
        type: ['string', 'null'],
        description: 'Our team’s name exactly as the report writes it, e.g. "Tyler JC" or "TJC".',
      },
      opponent_name: { type: ['string', 'null'] },
      our_score: { ...nullableInt, description: 'Goals scored by our team (final).' },
      opponent_score: { ...nullableInt, description: 'Goals scored by the opponent (final).' },
      players: {
        type: 'array',
        description: 'One entry per player on OUR side who appears in the report. Skip team totals rows.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'jersey_number', 'name', 'started', 'minutes', 'goals', 'assists', 'shots',
            'shots_on_goal', 'yellow_cards', 'red_cards', 'saves', 'goals_against', 'uncertain_fields',
          ],
          properties: {
            jersey_number: nullableInt,
            name: { type: 'string', description: 'Player name as written.' },
            started: {
              type: ['boolean', 'null'],
              description: 'True if marked as a starter (starters list, asterisk, GS column). Null if the report does not say.',
            },
            minutes: nullableInt,
            goals: nullableInt,
            assists: nullableInt,
            shots: nullableInt,
            shots_on_goal: nullableInt,
            yellow_cards: nullableInt,
            red_cards: nullableInt,
            saves: { ...nullableInt, description: 'Goalkeepers only; null for field players.' },
            goals_against: { ...nullableInt, description: 'Goalkeepers only; null for field players.' },
            uncertain_fields: {
              type: 'array',
              items: { type: 'string', enum: [...EXTRACTED_FIELDS] },
              description:
                'Fields of this entry you could not read with confidence (blurry, cut off, ambiguous column). Empty if all clear.',
            },
          },
        },
      },
    },
  },
}

interface ExtractionOutput {
  our_team_found: boolean
  team_name_as_written: string | null
  opponent_name: string | null
  our_score: number | null
  opponent_score: number | null
  players: ExtractedPlayerRow[]
}

const SYSTEM_PROMPT = `You read soccer game reports (official box scores, stat sheets, screenshots, spreadsheets, typed notes) for a college or club team's coaching staff and record the stats with the record_box_score tool.

Box scores almost always list BOTH teams. Extract ONLY our team's side. Decide which side is ours using the team name you are given (it may appear abbreviated, as a mascot, or with "JC"/"CC"/"College" variations) and, most reliably, the roster you are given: the side whose names and numbers match our roster is ours.

Rules:
- Copy numbers exactly as printed. Never estimate or invent a stat. If a column is missing for the whole report, use null for it. If a player's cell is blank or a dash where the column exists, use 0 for counting stats (goals, assists, shots, shots on goal, cards) and null for minutes.
- "SOG" or "Shots on goal" go in shots_on_goal; "Sh"/"Shots" in shots. "G" goals, "A" assists, "YC"/"Y" yellow cards, "RC"/"R" red cards, "MIN" minutes, "GS" or a starters list or an asterisk means started.
- Goalkeeper tables: put saves in saves and goals allowed in goals_against for that keeper. If the keeper also appears in the field player table, merge into one entry. Use null for saves and goals_against for field players.
- Skip totals rows ("Totals", "Team"), coaches and the opponent's players.
- If any value for a player is hard to read or you are unsure which column it belongs to, give your best reading and list that field in uncertain_fields. Staff check flagged fields before saving.
- our_score and opponent_score are the final score from our perspective.
- If you truly cannot tell which side is ours, set our_team_found to false and leave players empty.
- Always answer by calling record_box_score exactly once.`

function rosterText(roster: RosterPlayer[]): string {
  if (roster.length === 0) return '(no roster on file)'
  return roster
    .map(p => `${p.jersey_number != null ? `#${p.jersey_number}` : '#?'} ${p.first_name} ${p.last_name}${p.position ? ` (${p.position})` : ''}`)
    .join('\n')
}

function toIntOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const n = Math.round(v)
  return n >= 0 && n <= 999 ? n : null
}

/** Strict mode guarantees the shape; this still guards every value. */
function sanitizeExtraction(input: unknown): ExtractionOutput {
  const o = (input ?? {}) as Record<string, unknown>
  const players = Array.isArray(o.players) ? o.players : []
  return {
    our_team_found: o.our_team_found !== false,
    team_name_as_written: typeof o.team_name_as_written === 'string' ? o.team_name_as_written.slice(0, 200) : null,
    opponent_name: typeof o.opponent_name === 'string' ? o.opponent_name.slice(0, 200) : null,
    our_score: toIntOrNull(o.our_score),
    opponent_score: toIntOrNull(o.opponent_score),
    players: players
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map(p => ({
        jersey_number: toIntOrNull(p.jersey_number),
        name: typeof p.name === 'string' ? p.name.slice(0, 120) : '',
        started: typeof p.started === 'boolean' ? p.started : null,
        minutes: toIntOrNull(p.minutes),
        goals: toIntOrNull(p.goals),
        assists: toIntOrNull(p.assists),
        shots: toIntOrNull(p.shots),
        shots_on_goal: toIntOrNull(p.shots_on_goal),
        yellow_cards: toIntOrNull(p.yellow_cards),
        red_cards: toIntOrNull(p.red_cards),
        saves: toIntOrNull(p.saves),
        goals_against: toIntOrNull(p.goals_against),
        uncertain_fields: Array.isArray(p.uncertain_fields)
          ? p.uncertain_fields.filter((f): f is string => typeof f === 'string' && (EXTRACTED_FIELDS as readonly string[]).includes(f))
          : [],
      }))
      .filter(p => p.name || p.jersey_number != null),
  }
}

async function extractWithClaude(
  blocks: Anthropic.Beta.BetaContentBlockParam[],
  ctx: StaffCtx,
  roster: RosterPlayer[],
): Promise<ExtractionOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const ours = [ctx.clubName, ctx.event.team_name].filter(Boolean).join(' / ') || 'our team'
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...blocks,
    {
      type: 'text',
      text:
        `Our team: ${ours}\n` +
        `Game on our schedule: "${ctx.event.title}" (${ctx.event.start_time.slice(0, 10)})\n\n` +
        `Our roster (number, name, position):\n${rosterText(roster)}\n\n` +
        'Read the report above and call record_box_score with our side only.',
    },
  ]

  // Server-side refusal fallback (beta): if a safety classifier declines, the
  // API re-runs the request on a fallback model inside the same call. The
  // field isn't in this SDK version's types, so the params are built as a
  // variable and passed through as-is.
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming & { fallbacks: 'default' } = {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL as unknown as Anthropic.Beta.BetaTool],
    // Forced tool_choice is rejected on this model; the prompt asks for the
    // tool and strict: true keeps its input schema-valid.
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  }

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create(params)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      throw new Error('The report reader is busy right now. Try again in a minute.')
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('[game-report] bad request:', e.message)
      throw new Error('That file couldn’t be read. Try a PDF or a clear screenshot of the box score.')
    }
    if (e instanceof Anthropic.APIError) {
      console.error('[game-report] API error:', e.status, e.message)
      throw new Error('Couldn’t read the report right now. Try again, or enter the stats manually.')
    }
    throw e
  }

  if (process.env.NODE_ENV !== 'production' || process.env.LOG_AI_USAGE === '1') {
    console.log('[game-report] usage:', JSON.stringify(response.usage))
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('The report couldn’t be read. Try a different file, or enter the stats manually.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('That report was too long to finish reading. Upload just the box score page.')
  }

  const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'record_box_score')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('No stats could be read from that file. Try a clearer copy, or enter the stats manually.')
  }
  return sanitizeExtraction(toolBlock.input)
}

// ─── Upload: signed URL for direct browser upload ────────────────────────────

/**
 * Hosting caps request bodies at ~4.5 MB, below the 10 MB report limit, so the
 * browser uploads straight to storage with a one-time signed URL and then
 * calls uploadAndParseGameReport with the path.
 */
export async function createGameReportUpload(
  ...args: Parameters<typeof _createGameReportUpload>
): Promise<ActionResult<Awaited<ReturnType<typeof _createGameReportUpload>>>> {
  try {
    return { ok: true, data: await _createGameReportUpload(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _createGameReportUpload(eventId: string, fileName: string, mimeType: string, size: number) {
  await assertNotPreview()
  const ctx = await requireStaffEvent(eventId)
  if (size > MAX_REPORT_BYTES) throw new Error('That file is over 10 MB. Upload a smaller copy or just the box score page.')
  if (size <= 0) throw new Error('That file is empty.')
  const kind = detectKind(fileName, mimeType)

  const path = `${ctx.clubId}/${eventId}/${crypto.randomUUID()}.${EXT_BY_KIND[kind.mime] ?? 'bin'}`
  const service = createServiceClient()
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`Upload failed: ${error?.message ?? 'no upload URL'}`)
  return { path: data.path, token: data.token, contentType: kind.mime }
}

// ─── Upload + parse ──────────────────────────────────────────────────────────

/**
 * Store the report and extract our players' stats. FormData carries either
 * `file` (a File, for small uploads) or `storagePath` + `fileName` +
 * `mimeType` (already uploaded through createGameReportUpload). Saves a
 * game_reports row with status 'parsed'; nothing touches player stats until
 * confirmGameReport.
 */
export async function uploadAndParseGameReport(
  ...args: Parameters<typeof _uploadAndParseGameReport>
): Promise<ActionResult<Awaited<ReturnType<typeof _uploadAndParseGameReport>>>> {
  try {
    return { ok: true, data: await _uploadAndParseGameReport(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _uploadAndParseGameReport(eventId: string, formData: FormData): Promise<GameReportView> {
  await assertNotPreview()
  const ctx = await requireStaffEvent(eventId)
  const service = createServiceClient()

  const file = formData.get('file')
  const storagePathRaw = formData.get('storagePath')
  let path: string
  let fileName: string
  let kind: ReportKind
  let buf: Buffer

  if (file instanceof File) {
    if (file.size > MAX_REPORT_BYTES) throw new Error('That file is over 10 MB. Upload a smaller copy or just the box score page.')
    if (file.size === 0) throw new Error('That file is empty.')
    fileName = cleanFileName(file.name)
    kind = detectKind(fileName, file.type)
    buf = Buffer.from(await file.arrayBuffer())
    path = `${ctx.clubId}/${eventId}/${crypto.randomUUID()}.${EXT_BY_KIND[kind.mime] ?? 'bin'}`
    const { error: upErr } = await service.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: kind.mime, upsert: false })
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
  } else if (typeof storagePathRaw === 'string' && storagePathRaw) {
    // Only paths minted for this club + event.
    if (!storagePathRaw.startsWith(`${ctx.clubId}/${eventId}/`) || storagePathRaw.includes('..')) {
      throw new Error('Upload not found. Try again.')
    }
    path = storagePathRaw
    fileName = cleanFileName(String(formData.get('fileName') ?? 'report'))
    kind = detectKind(fileName, String(formData.get('mimeType') ?? ''))
    const { data: blob, error: dlErr } = await service.storage.from(BUCKET).download(path)
    if (dlErr || !blob) throw new Error('Upload not found. Try again.')
    if (blob.size > MAX_REPORT_BYTES) {
      await service.storage.from(BUCKET).remove([path])
      throw new Error('That file is over 10 MB. Upload a smaller copy or just the box score page.')
    }
    buf = Buffer.from(await blob.arrayBuffer())
  } else {
    throw new Error('Choose a file to upload.')
  }

  const roster = await loadRoster(ctx.supabase, ctx.event.team_id)

  let extraction: ExtractionOutput
  let sourceText: string | null
  try {
    const converted = await toContentBlocks(kind, buf, fileName)
    sourceText = converted.sourceText
    extraction = await extractWithClaude(converted.blocks, ctx, roster)
  } catch (e) {
    await service.storage.from(BUCKET).remove([path])
    throw e
  }

  if (!extraction.our_team_found && extraction.players.length === 0) {
    await service.storage.from(BUCKET).remove([path])
    throw new Error(`Couldn\u2019t find ${ctx.clubName || 'your team'} in that report. Check it\u2019s the right game, or enter the stats manually.`)
  }

  // Drop earlier unconfirmed uploads for this game so abandoned reviews
  // don't pile up. Confirmed reports stay until a new one is confirmed.
  const { data: stale } = await ctx.supabase
    .from('game_reports')
    .select('id, storage_path')
    .eq('event_id', eventId)
    .eq('status', 'parsed')
  if (stale && stale.length > 0) {
    await ctx.supabase.from('game_reports').delete().in('id', stale.map(s => s.id))
    const stalePaths = stale.map(s => s.storage_path).filter((p): p is string => !!p)
    if (stalePaths.length > 0) await service.storage.from(BUCKET).remove(stalePaths)
  }

  // A draft: the AI output lives only here until staff confirm. Nothing is
  // written to player_game_stats, so players see nothing yet.
  const stored: StoredExtraction = { ...extraction, source_text: sourceText }
  const { data: report, error: insErr } = await ctx.supabase
    .from('game_reports')
    .insert({
      club_id: ctx.clubId,
      team_id: ctx.event.team_id,
      event_id: eventId,
      storage_path: path,
      file_name: fileName,
      mime_type: kind.mime,
      status: 'parsed',
      extraction: stored,
      team_score: extraction.our_score,
      opponent_score: extraction.opponent_score,
      created_by: ctx.userId,
    })
    .select(REPORT_SELECT)
    .single()

  if (insErr || !report) {
    await service.storage.from(BUCKET).remove([path])
    throw new Error(`Save failed: ${insErr?.message ?? 'unknown error'}`)
  }

  return toView(report as unknown as ReportRow, roster, null)
}

// ─── Report view ─────────────────────────────────────────────────────────────

type StoredExtraction = ExtractionOutput & { source_text: string | null }

const REPORT_SELECT = 'id, status, storage_path, file_name, mime_type, extraction, team_score, opponent_score'

interface ReportRow {
  id: string
  status: 'parsed' | 'confirmed'
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  extraction: StoredExtraction | null
  team_score: number | null
  opponent_score: number | null
}

async function toView(r: ReportRow, roster: RosterPlayer[], savedRows: GameStatInput[] | null): Promise<GameReportView> {
  let fileUrl: string | null = null
  if (r.storage_path && r.mime_type && (r.mime_type === 'application/pdf' || r.mime_type.startsWith('image/'))) {
    const { data } = await createServiceClient().storage.from(BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL)
    fileUrl = data?.signedUrl ?? null
  }
  const ex = r.extraction
  // Older rows or manual entries have no extraction.
  const players = (ex?.players ?? []).map(p => ({ ...p, uncertain_fields: p.uncertain_fields ?? [] }))
  const { matched, unmatched } = matchRowsToRoster(players, roster)
  return {
    reportId: r.id,
    status: r.status,
    fileName: r.file_name,
    mimeType: r.mime_type,
    fileUrl,
    sourceText: ex?.source_text ?? null,
    teamNameAsWritten: ex?.team_name_as_written ?? null,
    opponentName: ex?.opponent_name ?? null,
    teamScore: r.team_score,
    opponentScore: r.opponent_score,
    matched,
    unmatched,
    savedRows,
  }
}

// ─── Read: context for the modal ─────────────────────────────────────────────

export async function getGameReportContext(
  ...args: Parameters<typeof _getGameReportContext>
): Promise<ActionResult<Awaited<ReturnType<typeof _getGameReportContext>>>> {
  try {
    return { ok: true, data: await _getGameReportContext(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

const STAT_SELECT =
  'player_id, started, minutes, goals, assists, shots, shots_on_goal, yellow_cards, red_cards, saves, goals_against'

async function _getGameReportContext(eventId: string): Promise<GameReportContext> {
  const ctx = await requireStaffEvent(eventId)
  const [roster, { data: reports }, { data: stats }] = await Promise.all([
    loadRoster(ctx.supabase, ctx.event.team_id),
    ctx.supabase
      .from('game_reports')
      .select(REPORT_SELECT)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
    ctx.supabase
      .from('player_game_stats')
      .select(STAT_SELECT)
      .eq('event_id', eventId),
  ])

  const rows = (reports ?? []) as unknown as ReportRow[]
  const confirmedRow = rows.find(r => r.status === 'confirmed') ?? null
  const draftRow = rows.find(r => r.status === 'parsed') ?? null

  const [confirmed, draft] = await Promise.all([
    confirmedRow ? toView(confirmedRow, roster, (stats ?? []) as GameStatInput[]) : Promise.resolve(null),
    draftRow ? toView(draftRow, roster, null) : Promise.resolve(null),
  ])

  return {
    event: {
      id: ctx.event.id,
      title: ctx.event.title,
      start_time: ctx.event.start_time,
      type: ctx.event.type,
      team_name: ctx.event.team_name,
    },
    clubName: ctx.clubName,
    roster,
    confirmed,
    draft,
  }
}

// ─── Save ────────────────────────────────────────────────────────────────────

function cleanCount(v: unknown, label: string, max = 99): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${label} must be a whole number from 0 to ${max}.`)
  return n
}

function cleanNullable(v: unknown, label: string, max = 99): number | null {
  if (v == null || v === '') return null
  return cleanCount(v, label, max)
}

function validateRows(rows: GameStatInput[], roster: RosterPlayer[]): GameStatInput[] {
  const onRoster = new Set(roster.map(p => p.id))
  const seen = new Set<string>()
  return rows.map(r => {
    if (!r.player_id || !onRoster.has(r.player_id)) throw new Error('Every row needs a player from this team’s roster.')
    if (seen.has(r.player_id)) {
      const p = roster.find(x => x.id === r.player_id)
      throw new Error(`${p ? `${p.first_name} ${p.last_name}` : 'A player'} is listed twice. Remove one row.`)
    }
    seen.add(r.player_id)
    return {
      player_id: r.player_id,
      started: Boolean(r.started),
      minutes: cleanNullable(r.minutes, 'Minutes', 200),
      goals: cleanCount(r.goals, 'Goals'),
      assists: cleanCount(r.assists, 'Assists'),
      shots: cleanCount(r.shots, 'Shots'),
      shots_on_goal: cleanCount(r.shots_on_goal, 'Shots on goal'),
      yellow_cards: cleanCount(r.yellow_cards, 'Yellow cards', 2),
      red_cards: cleanCount(r.red_cards, 'Red cards', 1),
      saves: cleanNullable(r.saves, 'Saves'),
      goals_against: cleanNullable(r.goals_against, 'Goals against'),
    }
  })
}

/**
 * Make `reportId` the one confirmed report for its event and write its stat
 * lines. Replaces earlier values: other reports for the game go (with their
 * files), stat rows for players no longer listed are removed, the rest are
 * upserted on (event_id, player_id).
 */
async function commitStats(
  ctx: StaffCtx,
  reportId: string,
  rows: GameStatInput[],
  scores: GameScore,
): Promise<SavedGameStats> {
  const service = createServiceClient()
  const roster = await loadRoster(ctx.supabase, ctx.event.team_id)
  const clean = validateRows(rows, roster)
  const teamScore = cleanNullable(scores.teamScore, 'Our score')
  const opponentScore = cleanNullable(scores.opponentScore, 'Opponent score')

  const { data: all } = await ctx.supabase
    .from('game_reports')
    .select('id, storage_path, status')
    .eq('event_id', ctx.event.id)
  // Includes this report itself when staff are editing saved stats.
  const hadConfirmed = (all ?? []).some(o => o.status === 'confirmed')
  const others = (all ?? []).filter(o => o.id !== reportId)

  if (others.length > 0) {
    const { error: delErr } = await ctx.supabase.from('game_reports').delete().in('id', others.map(o => o.id))
    if (delErr) throw new Error(`Save failed: ${delErr.message}`)
    const paths = others.map(o => o.storage_path).filter((p): p is string => !!p)
    if (paths.length > 0) await service.storage.from(BUCKET).remove(paths)
  }

  const { error: upErr } = await ctx.supabase
    .from('game_reports')
    .update({ status: 'confirmed', team_score: teamScore, opponent_score: opponentScore })
    .eq('id', reportId)
  if (upErr) throw new Error(`Save failed: ${upErr.message}`)

  const keep = clean.map(r => r.player_id)
  let removeQuery = ctx.supabase.from('player_game_stats').delete().eq('event_id', ctx.event.id)
  if (keep.length > 0) removeQuery = removeQuery.not('player_id', 'in', `(${keep.join(',')})`)
  const { error: rmErr } = await removeQuery
  if (rmErr) throw new Error(`Save failed: ${rmErr.message}`)

  if (clean.length > 0) {
    const { error: statErr } = await ctx.supabase
      .from('player_game_stats')
      .upsert(
        clean.map(r => ({
          ...r,
          club_id: ctx.clubId,
          team_id: ctx.event.team_id,
          event_id: ctx.event.id,
          report_id: reportId,
          created_by: ctx.userId,
        })),
        { onConflict: 'event_id,player_id' },
      )
    if (statErr) throw new Error(`Save failed: ${statErr.message}`)
  }

  // First time stats land for this game: tell the players who appear. Not on
  // corrections, so a fix doesn't buzz the whole squad again. Push only.
  if (!hadConfirmed && clean.length > 0) {
    try {
      await notifyPlayers(ctx, clean)
    } catch (e) {
      console.error('[game-report] push failed:', e)
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/players', 'layout')
  revalidatePath(`/dashboard/teams/${ctx.event.team_id}`)

  return { reportId, teamScore, opponentScore, playerCount: clean.length }
}

async function notifyPlayers(ctx: StaffCtx, rows: GameStatInput[]) {
  const service = createServiceClient()
  const { data: players } = await service
    .from('players')
    .select('id, parent_id')
    .in('id', rows.map(r => r.player_id))
  const accountByPlayer = new Map((players ?? []).map(p => [p.id as string, p.parent_id as string]))
  const accountIds = Array.from(new Set(accountByPlayer.values()))
  if (accountIds.length === 0) return

  // Only real player accounts. An unclaimed roster row points at the head
  // coach's account, who should not get "your stats" pushes.
  const { data: profiles } = await service
    .from('profiles')
    .select('id, user_id, role')
    .eq('club_id', ctx.clubId)
    .in('user_id', accountIds)
  const profileByUser = new Map(
    (profiles ?? []).filter(p => isMember(p.role as string)).map(p => [p.user_id as string, p.id as string]),
  )

  await Promise.allSettled(rows.map(r => {
    const userId = accountByPlayer.get(r.player_id)
    const profileId = userId ? profileByUser.get(userId) : undefined
    if (!profileId) return Promise.resolve()
    const line = summarizeLine(r)
    return sendPushToProfiles([profileId], {
      title: 'Game stats are in',
      message: `Stats from ${ctx.event.title} are in${line ? `: ${line}` : ''}`,
      url: `/dashboard/players/${r.player_id}`,
      tag: `game-stats-${ctx.event.id}`,
    })
  }))
}

export async function confirmGameReport(
  ...args: Parameters<typeof _confirmGameReport>
): Promise<ActionResult<Awaited<ReturnType<typeof _confirmGameReport>>>> {
  try {
    return { ok: true, data: await _confirmGameReport(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _confirmGameReport(reportId: string, rows: GameStatInput[], scores: GameScore): Promise<SavedGameStats> {
  await assertNotPreview()
  const supabase = await createClient()
  const { data: report } = await supabase
    .from('game_reports')
    .select('id, event_id')
    .eq('id', reportId)
    .maybeSingle()
  if (!report) throw new Error('That report is gone. Upload it again.')
  const ctx = await requireStaffEvent(report.event_id as string)
  return commitStats(ctx, reportId, rows, scores)
}

export async function saveManualStats(
  ...args: Parameters<typeof _saveManualStats>
): Promise<ActionResult<Awaited<ReturnType<typeof _saveManualStats>>>> {
  try {
    return { ok: true, data: await _saveManualStats(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

/** Same as confirm, without a file: a report row with no storage_path. */
async function _saveManualStats(eventId: string, rows: GameStatInput[], scores: GameScore): Promise<SavedGameStats> {
  await assertNotPreview()
  const ctx = await requireStaffEvent(eventId)
  const { data: report, error } = await ctx.supabase
    .from('game_reports')
    .insert({
      club_id: ctx.clubId,
      team_id: ctx.event.team_id,
      event_id: eventId,
      storage_path: null,
      status: 'parsed',
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error || !report) throw new Error(`Save failed: ${error?.message ?? 'unknown error'}`)
  try {
    return await commitStats(ctx, report.id as string, rows, scores)
  } catch (e) {
    await ctx.supabase.from('game_reports').delete().eq('id', report.id)
    throw e
  }
}

export async function deleteGameReport(
  ...args: Parameters<typeof _deleteGameReport>
): Promise<ActionResult<Awaited<ReturnType<typeof _deleteGameReport>>>> {
  try {
    return { ok: true, data: await _deleteGameReport(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

/** Removes the report, its file and the stat lines it wrote. */
async function _deleteGameReport(reportId: string): Promise<void> {
  await assertNotPreview()
  const supabase = await createClient()
  const { data: report } = await supabase
    .from('game_reports')
    .select('id, event_id, storage_path')
    .eq('id', reportId)
    .maybeSingle()
  if (!report) throw new Error('Report not found.')
  const ctx = await requireStaffEvent(report.event_id as string)

  const { error: statErr } = await ctx.supabase.from('player_game_stats').delete().eq('report_id', reportId)
  if (statErr) throw new Error(`Delete failed: ${statErr.message}`)
  const { data: deleted, error } = await ctx.supabase.from('game_reports').delete().eq('id', reportId).select('id')
  if (error) throw new Error(`Delete failed: ${error.message}`)
  if (!deleted || deleted.length === 0) throw new Error('Not allowed.')

  if (report.storage_path) {
    await createServiceClient().storage.from(BUCKET).remove([report.storage_path as string])
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/players', 'layout')
  revalidatePath(`/dashboard/teams/${ctx.event.team_id}`)
}

// ─── Scores for the schedule chips ───────────────────────────────────────────

export async function getGameScores(
  ...args: Parameters<typeof _getGameScores>
): Promise<ActionResult<Awaited<ReturnType<typeof _getGameScores>>>> {
  try {
    return { ok: true, data: await _getGameScores(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getGameScores(eventIds: string[]): Promise<Record<string, GameScore>> {
  const ids = eventIds.filter(Boolean).slice(0, 500)
  if (ids.length === 0) return {}
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_game_scores', { p_event_ids: ids })
  if (error) throw new Error(error.message)
  const out: Record<string, GameScore> = {}
  for (const r of (data ?? []) as { event_id: string; team_score: number | null; opponent_score: number | null }[]) {
    out[r.event_id] = { teamScore: r.team_score, opponentScore: r.opponent_score }
  }
  return out
}
