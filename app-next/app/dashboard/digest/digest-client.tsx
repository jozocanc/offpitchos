'use client'
import { formatDayKeyShort, formatMonthDay } from '@/lib/format-datetime'
import { useClubTimezone } from '@/components/club-timezone'

import { useState, useTransition } from 'react'
import { generateDigestNow, emailDigest } from './actions'
import { useToast } from '@/components/toast'

interface DigestRow {
  id: string
  week_start: string
  summary_md: string
  stats: {
    weekStart: string
    weekEnd: string
    clubName: string
    events: { total: number; practices: number; games: number; cancelled: number }
    attendance: { totalRecords: number; presentRecords: number; rate: number }
    perTeam: { name: string; ageGroup: string; eventsRun: number; attendanceRate: number | null; rsvpsReceived: number }[]
    upcomingEvents: { title: string; when: string; teamName: string }[]
    feedbackHighlights: { playerName: string; teamName: string; category: string; rating: number | null; notes: string }[]
    responseGap: { rsvpResponseRate: number }
  } | null
  emailed_at: string | null
  email_recipients: number
  created_at: string
}

// Splits a line on `**bold**` and renders each segment, returning an
// array of nodes. Keeps the rest of the renderer purely line-based.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={`${keyBase}-${i}`} className="font-bold text-white">{part.slice(2, -2)}</strong>
    }
    return <span key={`${keyBase}-${i}`}>{part}</span>
  })
}

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let listBuffer: string[] = []
  let key = 0

  function flushList() {
    if (listBuffer.length === 0) return
    out.push(
      <ul key={`ul-${key++}`} className="list-disc pl-5 my-2 space-y-1">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-white/80">{renderInline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>
    )
    listBuffer = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushList(); continue }
    // Horizontal rule — Haiku tends to emit `---` between sections.
    // Render as a thin divider rather than a literal "---".
    if (/^-{3,}$/.test(line)) {
      flushList()
      out.push(<hr key={key++} className="border-white/10 my-4" />)
      continue
    }
    if (line.startsWith('# ')) {
      flushList()
      out.push(<h2 key={key++} className="text-xl font-bold mt-4 mb-2">{renderInline(line.slice(2), `h2-${key}`)}</h2>)
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      out.push(<h3 key={key++} className="text-base font-bold text-green mt-4 mb-1">{renderInline(line.slice(3), `h3-${key}`)}</h3>)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2))
      continue
    }
    flushList()
    out.push(<p key={key++} className="text-white/80 my-2">{renderInline(line, `p-${key}`)}</p>)
  }
  flushList()
  return out
}

function fmtWeek(weekStart: string) {
  // Week bounds are calendar dates. Anchor at UTC so adding 6 days cannot land
  // on the wrong side of a DST change and so both ends format identically on
  // the server and in the browser.
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  return `${formatDayKeyShort(weekStart)} – ${formatDayKeyShort(end.toISOString().slice(0, 10))}`
}

export default function DigestClient({ digests, isDoc }: { digests: DigestRow[]; isDoc: boolean }) {
  const timezone = useClubTimezone()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [emailing, setEmailing] = useState<string | null>(null)
  const [latest, ...rest] = digests

  function handleGenerate() {
    startTransition(async () => {
      try {
        const result = await generateDigestNow()
        toast(`Digest generated for week of ${fmtWeek(result.weekStart)}`, 'success')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to generate'
        toast(msg, 'error')
      }
    })
  }

  function handleEmail(id: string) {
    if (!confirm('Send this digest to everyone in the club via email?')) return
    setEmailing(id)
    startTransition(async () => {
      try {
        const result = await emailDigest(id)
        toast(`Sent to ${result.sent} ${result.sent === 1 ? 'person' : 'people'}${result.failed > 0 ? ` · ${result.failed} failed` : ''}`, result.failed > 0 ? 'error' : 'success')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to send'
        toast(msg, 'error')
      } finally {
        setEmailing(null)
      }
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Weekly Digest</h1>
          <p className="text-gray text-sm mt-1">
            AI-generated recap of the week — attendance, standout players, and what&apos;s coming up.
          </p>
        </div>
        {isDoc && (
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-50"
          >
            {isPending ? 'Generating…' : latest ? 'Regenerate This Week' : 'Generate Digest'}
          </button>
        )}
      </div>

      {!latest && (
        <div className="bg-dark-secondary border border-white/5 rounded-2xl p-12 text-center">
          <p className="text-gray text-lg">No digest yet.</p>
          <p className="text-gray text-sm mt-1">
            {isDoc
              ? 'Click "Generate Digest" to create the first one.'
              : 'The DOC will generate the first digest at the end of the week.'}
          </p>
        </div>
      )}

      {latest && (
        <article className="bg-dark-secondary border border-white/5 rounded-2xl p-6 md:p-8 mb-8">
          <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-green">Latest</p>
              <h2 className="text-2xl font-black mt-1">Week of {fmtWeek(latest.week_start)}</h2>
              {latest.emailed_at && (
                <p className="text-xs text-gray mt-1">
                  Emailed to {latest.email_recipients} {latest.email_recipients === 1 ? 'person' : 'people'} on{' '}
                  {formatMonthDay(latest.emailed_at, timezone)}
                </p>
              )}
            </div>
            {isDoc && (
              <button
                onClick={() => handleEmail(latest.id)}
                disabled={isPending && emailing === latest.id}
                className="text-xs font-bold bg-green/10 hover:bg-green/20 text-green border border-green/20 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {emailing === latest.id ? 'Sending…' : latest.emailed_at ? 'Resend Email' : 'Send to Club'}
              </button>
            )}
          </header>

          {latest.stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="Events" value={latest.stats.events.total} sub={`${latest.stats.events.cancelled} cancelled`} />
              <Stat label="Attendance" value={`${latest.stats.attendance.rate}%`} sub={`${latest.stats.attendance.presentRecords} of ${latest.stats.attendance.totalRecords}`} />
              <Stat label="RSVP Rate" value={`${latest.stats.responseGap.rsvpResponseRate}%`} sub="parents responded" />
              <Stat label="Coming Up" value={latest.stats.upcomingEvents.length} sub="events next week" />
            </div>
          )}

          <div className="prose-digest">
            {renderMarkdown(latest.summary_md)}
          </div>
        </article>
      )}

      {rest.length > 0 && (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray mb-3">Past digests</h3>
          <div className="space-y-2">
            {rest.map(d => (
              <details key={d.id} className="bg-dark-secondary border border-white/5 rounded-xl">
                <summary className="cursor-pointer p-4 flex items-center justify-between">
                  <span className="font-medium">Week of {fmtWeek(d.week_start)}</span>
                  <span className="text-xs text-gray">
                    {d.stats?.attendance.rate ?? 0}% attendance · {d.stats?.events.total ?? 0} events
                  </span>
                </summary>
                <div className="px-4 pb-4 prose-digest">
                  {renderMarkdown(d.summary_md)}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-dark border border-white/5 rounded-xl p-3">
      <p className="text-xs text-gray uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray mt-0.5">{sub}</p>}
    </div>
  )
}
