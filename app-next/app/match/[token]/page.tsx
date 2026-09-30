import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache, type ReactNode } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import { DEFAULT_TIMEZONE, formatLongDate, formatTime } from '@/lib/format-datetime'
import { telHref } from '@/lib/match-sheet'
import MatchFooter from './match-footer'

// Staff can edit the sheet right up to kickoff; never serve a stale copy.
export const dynamic = 'force-dynamic'

interface SheetRow {
  event_title: string
  event_type: string
  event_status: string
  start_time: string
  end_time: string
  venue_name: string | null
  venue_address: string | null
  event_address: string | null
  team_name: string
  club_name: string
  club_timezone: string | null
  arrival_notes: string | null
  parking: string | null
  locker_room: string | null
  home_kit: string | null
  contact_name: string | null
  contact_phone: string | null
  extra_notes: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// cache(): generateMetadata and the page both ask for the same token.
const loadSheet = cache(async (token: string): Promise<SheetRow | null> => {
  // Garbage never reaches the SECURITY DEFINER function.
  if (!UUID.test(token)) return null
  const service = createServiceClient()
  const { data, error } = await service.rpc('get_match_sheet', { p_token: token })
  if (error || !data || (data as SheetRow[]).length === 0) return null
  return (data as SheetRow[])[0]
})

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const sheet = await loadSheet(token)
  return {
    title: sheet ? `Match day info · ${sheet.club_name}` : 'Match day info',
    description: sheet ? `${sheet.event_title}: arrival, parking, kit and contact for the visiting team.` : undefined,
    robots: { index: false, follow: false },
  }
}

/** "CDT" / "EDT"; outside the US Intl gives "GMT+2", which is still unambiguous. */
function zoneAbbr(iso: string, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
    .find(p => p.type === 'timeZoneName')
  return part?.value ?? ''
}

function safeZone(tz: string | null): string {
  if (!tz) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-dark-secondary border border-white/5 rounded-2xl p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray mb-2">{title}</h2>
      <div className="text-white text-[15px] leading-relaxed whitespace-pre-line">{children}</div>
    </section>
  )
}

export default async function MatchSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sheet = await loadSheet(token)
  if (!sheet) notFound()

  const tz = safeZone(sheet.club_timezone)
  const cancelled = sheet.event_status === 'cancelled'
  const address = sheet.event_address || sheet.venue_address
  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : sheet.venue_name
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sheet.venue_name)}`
      : null
  const homeName = sheet.club_name === sheet.team_name
    ? sheet.club_name
    : `${sheet.club_name} ${sheet.team_name}`.trim()
  const typeLabel = EVENT_TYPE_LABELS[sheet.event_type as EventType] ?? 'Game'

  return (
    <div className="min-h-screen bg-dark text-white">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-green">
            Match day info for the visiting team
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mt-3 leading-tight">
            {sheet.event_title}
          </h1>
          <p className="text-gray text-sm mt-2">
            {homeName} <span className="text-gray/70">vs</span> Visiting team
          </p>
        </header>

        {cancelled && (
          <div className="mb-4 rounded-2xl border border-red/20 bg-red/5 px-5 py-4 text-red text-sm font-semibold">
            This {typeLabel.toLowerCase()} has been cancelled. Check with the home staff before traveling.
          </div>
        )}

        <div className="space-y-3">
          <section className="bg-dark-secondary border border-white/5 rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray">Kickoff</p>
            <p className={`text-xl font-semibold tracking-[-0.02em] mt-1 ${cancelled ? 'line-through text-gray' : ''}`}>
              {formatLongDate(sheet.start_time, tz)}
            </p>
            <p className="text-white text-lg mt-0.5">
              {formatTime(sheet.start_time, tz)} {zoneAbbr(sheet.start_time, tz)}
            </p>
            <p className="text-gray text-xs mt-1">Local time at the home venue.</p>

            {(sheet.venue_name || address) && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray">Venue</p>
                {sheet.venue_name && <p className="font-semibold mt-1">{sheet.venue_name}</p>}
                {address && <p className="text-gray text-sm mt-0.5">{address}</p>}
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 bg-green text-dark text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
                  >
                    Open in Maps
                  </a>
                )}
              </div>
            )}
          </section>

          {sheet.arrival_notes && <Section title="Arrival">{sheet.arrival_notes}</Section>}
          {sheet.parking && <Section title="Parking">{sheet.parking}</Section>}
          {sheet.locker_room && <Section title="Locker room">{sheet.locker_room}</Section>}
          {sheet.home_kit && (
            <Section title="Kit">
              Home team wears: <span className="font-semibold">{sheet.home_kit}</span>. Please bring a contrasting kit.
            </Section>
          )}
          {sheet.extra_notes && <Section title="Notes">{sheet.extra_notes}</Section>}

          {(sheet.contact_name || sheet.contact_phone) && (
            <section className="bg-dark-secondary border border-green/20 rounded-2xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray">Day-of contact</p>
              {sheet.contact_name && <p className="font-semibold text-lg mt-1">{sheet.contact_name}</p>}
              {sheet.contact_phone && (
                <a
                  href={telHref(sheet.contact_phone)}
                  className="mt-3 inline-flex items-center gap-2 bg-green text-dark text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
                >
                  Call {sheet.contact_phone}
                </a>
              )}
            </section>
          )}
        </div>

        <MatchFooter />
      </div>
    </div>
  )
}
