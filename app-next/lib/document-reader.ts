import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { MAX_IMPORT_BYTES } from './import-files'

// Shared "read any file with Claude" plumbing for the roster and schedule
// imports. Same formats as the game report reader (lib/game-stats.ts).

const MODEL = 'claude-opus-5-5'
const MAX_TEXT_CHARS = 400_000

type Kind =
  | { kind: 'pdf' }
  | { kind: 'image'; mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
  | { kind: 'csv' | 'text' | 'excel' | 'word' }

function detectKind(fileName: string, mimeType: string): Kind {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()

  if (ext === 'heic' || ext === 'heif' || mime === 'image/heic' || mime === 'image/heif') {
    throw new Error('iPhone HEIC photos can’t be read yet. Take a screenshot of the photo and upload that.')
  }
  if (ext === 'doc' || mime === 'application/msword') {
    throw new Error('Old .doc files can’t be read. Save it as .docx or PDF and upload that.')
  }
  if (ext === 'pages' || ext === 'numbers') {
    throw new Error('Pages and Numbers files can’t be read. Export it as PDF or Excel and upload that.')
  }
  if (ext === 'pdf' || mime === 'application/pdf') return { kind: 'pdf' }
  if (ext === 'jpg' || ext === 'jpeg' || mime === 'image/jpeg') return { kind: 'image', mime: 'image/jpeg' }
  if (ext === 'png' || mime === 'image/png') return { kind: 'image', mime: 'image/png' }
  if (ext === 'webp' || mime === 'image/webp') return { kind: 'image', mime: 'image/webp' }
  if (ext === 'gif' || mime === 'image/gif') return { kind: 'image', mime: 'image/gif' }
  if (ext === 'csv' || mime === 'text/csv') return { kind: 'csv' }
  if (ext === 'txt' || ext === 'tsv' || mime === 'text/plain' || mime === 'text/tab-separated-values') return { kind: 'text' }
  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') {
    return { kind: 'excel' }
  }
  if (ext === 'docx' || mime.includes('wordprocessingml')) return { kind: 'word' }
  throw new Error('That file type isn’t supported. Upload a PDF, photo or screenshot, Excel, CSV, Word (.docx) or text file.')
}

/** Turn an uploaded file into the content block Claude reads. */
export async function fileToContent(file: File): Promise<Anthropic.Beta.BetaContentBlockParam> {
  if (file.size === 0) throw new Error('That file is empty.')
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('That file is over 4 MB. Upload a smaller copy, a screenshot, or just the pages you need.')
  }
  const kind = detectKind(file.name, file.type)
  const buf = Buffer.from(await file.arrayBuffer())

  if (kind.kind === 'pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
  }
  if (kind.kind === 'image') {
    return { type: 'image', source: { type: 'base64', media_type: kind.mime, data: buf.toString('base64') } }
  }

  let text: string
  if (kind.kind === 'excel') {
    const wb = XLSX.read(buf, { type: 'buffer' })
    text = wb.SheetNames
      .map(name => `--- Sheet: ${name} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })}`)
      .join('\n\n')
  } else if (kind.kind === 'word') {
    text = (await mammoth.extractRawText({ buffer: buf })).value
  } else {
    text = buf.toString('utf8')
  }
  text = text.trim()
  if (!text) throw new Error('That file looks empty.')
  if (text.length > MAX_TEXT_CHARS) throw new Error('That file is too long to read in one go. Upload just the part you need.')
  return { type: 'text', text: `--- File: ${file.name.slice(0, 200)} ---\n${text}\n--- End of file ---` }
}

/**
 * One extraction call: Claude reads the file and answers through the given
 * strict tool. Returns the tool input; callers sanitize every value.
 */
export async function extractWithTool(opts: {
  system: string
  tool: { name: string; description: string; input_schema: Record<string, unknown> }
  file: Anthropic.Beta.BetaContentBlockParam
  instructions: string
  label: string
}): Promise<unknown> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Server-side refusal fallback (beta), as in game-report-actions.ts: the
  // field isn't in this SDK version's types, so params are passed through.
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming & { fallbacks: 'default' } = {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: opts.system,
    tools: [{ ...opts.tool, strict: true } as unknown as Anthropic.Beta.BetaTool],
    // Forced tool_choice is rejected on this model; the prompt names the tool.
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: [opts.file, { type: 'text', text: opts.instructions }] }],
  }

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create(params)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      throw new Error('The file reader is busy right now. Try again in a minute.')
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error(`[${opts.label}] bad request:`, e.message)
      throw new Error('That file couldn’t be read. Try a PDF or a clear screenshot.')
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`[${opts.label}] API error:`, e.status, e.message)
      throw new Error('Couldn’t read the file right now. Try again in a minute.')
    }
    throw e
  }

  if (response.stop_reason === 'refusal') throw new Error('That file couldn’t be read. Try a different copy.')
  if (response.stop_reason === 'max_tokens') throw new Error('That file was too long to finish reading. Upload a shorter part.')

  const block = response.content.find(b => b.type === 'tool_use' && b.name === opts.tool.name)
  if (!block || block.type !== 'tool_use') throw new Error('Nothing could be read from that file. Try a clearer copy.')
  return block.input
}
