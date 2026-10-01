// Server-only: imported from app/api/game-plan/pdf/** only.
//
// Game plan PDF: lineup page, corner boards, then attached drills (rendered
// with the tactics drill page). Black and white friendly: white pitch, black
// lines, outlined player circles.

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Line,
  Rect,
  Circle,
  Path,
  Polygon,
} from '@react-pdf/renderer'
import { DrillPdfPage, type BatchDrill } from '@/lib/tactics/pdf-document'
import { formatLongDate, formatTime } from '@/lib/format-datetime'
import {
  BOX_VIEW,
  SETUP_LABELS,
  SET_PIECE_LABELS,
  markerPlayerId,
  playerFullName,
  playerShortName,
  slotLine,
  type GamePlanDoc,
  type PlanPlayer,
  type SetPiece,
  type SetPieceKey,
} from '@/lib/game-plan'

const INK = '#111111'
const MUTED = '#555555'
const RULE = '#bbbbbb'

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: INK, backgroundColor: '#ffffff', padding: 30, paddingBottom: 44 },
  header: { borderBottom: `1.5pt solid ${INK}`, paddingBottom: 8, marginBottom: 12 },
  kicker: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 20, lineHeight: 1.15 },
  meta: { fontSize: 10, color: INK, marginTop: 3 },
  metaMuted: { fontSize: 9, color: MUTED, marginTop: 1 },
  row: { flexDirection: 'row' },
  sectionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, marginTop: 10 },
  bigChip: { fontFamily: 'Helvetica-Bold', fontSize: 14, border: `1.5pt solid ${INK}`, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  tableRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${RULE}`, paddingVertical: 3.5, alignItems: 'center' },
  num: { width: 26, fontFamily: 'Helvetica-Bold', fontSize: 12, textAlign: 'right', paddingRight: 8 },
  name: { flex: 1, fontSize: 11 },
  pos: { width: 34, fontSize: 9, color: MUTED, textAlign: 'right' },
  notes: { fontSize: 9.5, lineHeight: 1.45 },
  footer: { position: 'absolute', left: 30, right: 30, bottom: 18, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
  boardWrap: { flexDirection: 'row', marginBottom: 14 },
  boardTitle: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 6 },
})

export interface GamePlanPdfEvent {
  title: string
  teamName: string
  startTime: string
  endTime: string
  venueName: string | null
  venueAddress: string | null
}

export interface GamePlanPdfProps {
  event: GamePlanPdfEvent
  doc: GamePlanDoc
  players: PlanPlayer[]
  staff: { name: string; title: string }[]
  /** Ordered sections to print. */
  showLineup: boolean
  corners: SetPieceKey[]
  drills: BatchDrill[]
  timeZone: string
  size: 'A4' | 'LETTER'
}

function Footer({ event, timeZone }: { event: GamePlanPdfEvent; timeZone: string }) {
  return (
    <View style={S.footer} fixed>
      <Text>OffPitchOS · Game plan · {event.title}</Text>
      <Text>{formatLongDate(event.startTime, timeZone)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  )
}

function Header({ event, timeZone, kicker }: { event: GamePlanPdfEvent; timeZone: string; kicker: string }) {
  const venue = [event.venueName, event.venueAddress].filter(Boolean).join(', ')
  return (
    <View style={S.header}>
      <Text style={S.kicker}>{kicker}</Text>
      <Text style={S.title}>{event.teamName ? `${event.teamName}: ${event.title}` : event.title}</Text>
      <Text style={S.meta}>
        {formatLongDate(event.startTime, timeZone)} · Kickoff {formatTime(event.startTime, timeZone)}
      </Text>
      {venue ? <Text style={S.metaMuted}>{venue}</Text> : null}
    </View>
  )
}

// ─── Pitch drawing ──────────────────────────────────────────────────────────

function FullPitch({ width }: { width: number }) {
  const W = 68
  const L = 105
  const height = (width * L) / W
  const box = { x: (W - 40.32) / 2, w: 40.32, d: 16.5 }
  const six = { x: (W - 18.32) / 2, w: 18.32, d: 5.5 }
  const gx = (W - 7.32) / 2
  const sw = 0.35
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${L}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Rect x={0} y={0} width={W} height={L} fill="#ffffff" stroke={INK} strokeWidth={sw} />
      <Line x1={0} y1={L / 2} x2={W} y2={L / 2} stroke={INK} strokeWidth={sw} />
      <Circle cx={W / 2} cy={L / 2} r={9.15} fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={box.x} y={0} width={box.w} height={box.d} fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={six.x} y={0} width={six.w} height={six.d} fill="none" stroke={INK} strokeWidth={sw} />
      <Path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={box.x} y={L - box.d} width={box.w} height={box.d} fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={six.x} y={L - six.d} width={six.w} height={six.d} fill="none" stroke={INK} strokeWidth={sw} />
      <Path d={`M 26.69 ${L - 16.5} A 9.15 9.15 0 0 1 41.31 ${L - 16.5}`} fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={gx} y={0} width={7.32} height={1.2} fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={gx} y={L - 1.2} width={7.32} height={1.2} fill="none" stroke={INK} strokeWidth={sw} />
      <Circle cx={W / 2} cy={L / 2} r={0.4} fill={INK} />
    </Svg>
  )
}

function BoxPitch({ width, setPiece }: { width: number; setPiece: SetPiece }) {
  const W = BOX_VIEW.widthM
  const D = BOX_VIEW.depthM
  const height = (width * D) / W
  const box = { x: (W - 40.32) / 2, w: 40.32, d: 16.5 }
  const six = { x: (W - 18.32) / 2, w: 18.32, d: 5.5 }
  const gx = (W - 7.32) / 2
  const sw = 0.25
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${D}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Rect x={0} y={0} width={W} height={D} fill="#ffffff" stroke={INK} strokeWidth={sw} />
      <Rect x={box.x} y={0} width={box.w} height={box.d} fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={six.x} y={0} width={six.w} height={six.d} fill="none" stroke={INK} strokeWidth={sw} />
      <Path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" fill="none" stroke={INK} strokeWidth={sw} />
      <Rect x={gx} y={0} width={7.32} height={1} fill="#dddddd" stroke={INK} strokeWidth={sw} />
      <Circle cx={W / 2} cy={11} r={0.3} fill={INK} />
      {setPiece.arrows.map(a => {
        const x1 = a.x1 * W, y1 = a.y1 * D, x2 = a.x2 * W, y2 = a.y2 * D
        const ang = Math.atan2(y2 - y1, x2 - x1)
        const h = 1.6
        const p1 = `${x2},${y2}`
        const p2 = `${x2 - h * Math.cos(ang - 0.45)},${y2 - h * Math.sin(ang - 0.45)}`
        const p3 = `${x2 - h * Math.cos(ang + 0.45)},${y2 - h * Math.sin(ang + 0.45)}`
        return (
          <React.Fragment key={a.id}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={0.35} strokeDasharray="1.2,0.8" />
            <Polygon points={`${p1} ${p2} ${p3}`} fill={INK} />
          </React.Fragment>
        )
      })}
    </Svg>
  )
}

function Token({ x, y, size, number, name, sub, keeper, captain }: {
  x: number
  y: number
  size: number
  number: number | null
  name: string
  sub?: string
  keeper?: boolean
  captain?: boolean
}) {
  const labelW = size * 4
  return (
    <View style={{ position: 'absolute', left: x - labelW / 2, top: y - size / 2, width: labelW, alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          border: `${keeper ? 2 : 1.2}pt solid ${INK}`,
          backgroundColor: keeper ? '#e6e6e6' : '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: size * 0.46 }}>{number ?? ''}</Text>
      </View>
      {captain ? (
        <View style={{ position: 'absolute', top: -3, left: labelW / 2 + size / 2 - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 6.5 }}>C</Text>
        </View>
      ) : null}
      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: Math.max(6.5, size * 0.36), marginTop: 1.5, textAlign: 'center', backgroundColor: '#ffffff' }}>
        {name}
      </Text>
      {sub ? <Text style={{ fontSize: Math.max(5.5, size * 0.28), color: MUTED, textAlign: 'center' }}>{sub}</Text> : null}
    </View>
  )
}

// ─── Pages ──────────────────────────────────────────────────────────────────

function LineupPage({ event, doc, byId, staff, timeZone, size }: {
  event: GamePlanPdfEvent
  doc: GamePlanDoc
  byId: Map<string, PlanPlayer>
  staff: { name: string; title: string }[]
  timeZone: string
  size: 'A4' | 'LETTER'
}) {
  const pitchW = 262
  const pitchH = (pitchW * 105) / 68
  const order = ['GK', 'D', 'M', 'F']
  const xi = [...doc.lineup.slots]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => order.indexOf(slotLine(a.s.label)) - order.indexOf(slotLine(b.s.label)) || a.i - b.i)
    .map(({ s }) => s)
  const captain = doc.lineup.captain_id ? byId.get(doc.lineup.captain_id) : undefined

  return (
    <Page size={size} style={S.page}>
      <Header event={event} timeZone={timeZone} kicker="Game plan · Lineup" />
      <View style={S.row}>
        <View style={{ width: pitchW, height: pitchH, position: 'relative', marginRight: 18 }}>
          <FullPitch width={pitchW} />
          {doc.lineup.slots.map(s => {
            const p = s.player_id ? byId.get(s.player_id) : undefined
            return (
              <Token
                key={s.slot_id}
                x={s.x * pitchW}
                y={s.y * pitchH}
                size={22}
                number={p?.jerseyNumber ?? null}
                name={p ? playerShortName(p) : s.label}
                keeper={slotLine(s.label) === 'GK'}
                captain={Boolean(p && p.id === doc.lineup.captain_id)}
              />
            )
          })}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={S.bigChip}>{doc.formation}</Text>
          {captain ? (
            <Text style={{ fontSize: 10, marginTop: 6 }}>
              Captain: <Text style={{ fontFamily: 'Helvetica-Bold' }}>#{captain.jerseyNumber ?? '-'} {playerFullName(captain)}</Text>
            </Text>
          ) : null}

          <Text style={S.sectionLabel}>Starting XI</Text>
          {xi.map(s => {
            const p = s.player_id ? byId.get(s.player_id) : undefined
            return (
              <View key={s.slot_id} style={S.tableRow}>
                <Text style={S.num}>{p?.jerseyNumber ?? ''}</Text>
                <Text style={S.name}>
                  {p ? playerFullName(p) : '(empty)'}
                  {p && p.id === doc.lineup.captain_id ? ' (C)' : ''}
                </Text>
                <Text style={S.pos}>{s.label}</Text>
              </View>
            )
          })}

          {doc.lineup.bench.length > 0 ? (
            <>
              <Text style={S.sectionLabel}>Bench</Text>
              {doc.lineup.bench.map(id => {
                const p = byId.get(id)
                if (!p) return null
                return (
                  <View key={id} style={S.tableRow}>
                    <Text style={S.num}>{p.jerseyNumber ?? ''}</Text>
                    <Text style={S.name}>{playerFullName(p)}</Text>
                    <Text style={S.pos}>{p.position ?? ''}</Text>
                  </View>
                )
              })}
            </>
          ) : null}

          {staff.length > 0 ? (
            <>
              <Text style={S.sectionLabel}>Staff</Text>
              {staff.map((s, i) => (
                <Text key={i} style={{ fontSize: 9.5, marginBottom: 1.5 }}>
                  {s.name} <Text style={{ color: MUTED }}>· {s.title}</Text>
                </Text>
              ))}
            </>
          ) : null}
        </View>
      </View>

      {doc.notes.trim() ? (
        <View style={{ marginTop: 12 }}>
          <Text style={S.sectionLabel}>Notes</Text>
          <Text style={S.notes}>{doc.notes.trim()}</Text>
        </View>
      ) : null}
      <Footer event={event} timeZone={timeZone} />
    </Page>
  )
}

function CornerBoard({ k, sp, doc, byId }: { k: SetPieceKey; sp: SetPiece; doc: GamePlanDoc; byId: Map<string, PlanPlayer> }) {
  const w = 318
  const h = (w * BOX_VIEW.depthM) / BOX_VIEW.widthM
  const rows = sp.markers.map(m => {
    const pid = markerPlayerId(m, doc.lineup.slots)
    return { m, p: pid ? byId.get(pid) : undefined }
  })
  return (
    <View style={S.boardWrap} wrap={false}>
      <View style={{ width: w, marginRight: 14 }}>
        <Text style={S.boardTitle}>
          {SET_PIECE_LABELS[k]}{sp.setup ? ` · ${SETUP_LABELS[sp.setup]}` : ''}
        </Text>
        <View style={{ width: w, height: h, position: 'relative' }}>
          <BoxPitch width={w} setPiece={sp} />
          {rows.map(({ m, p }) => (
            <Token
              key={m.id}
              x={m.x * w}
              y={m.y * h}
              size={14}
              number={p?.jerseyNumber ?? null}
              name={p ? playerShortName(p) : '?'}
              keeper={m.role_label === 'GK'}
            />
          ))}
        </View>
      </View>
      <View style={{ flex: 1, paddingTop: 20 }}>
        {rows.map(({ m, p }) => (
          <Text key={m.id} style={{ fontSize: 8.5, marginBottom: 1.5 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{m.role_label || 'Player'}:</Text>{' '}
            {p ? `#${p.jerseyNumber ?? '-'} ${playerShortName(p)}` : '-'}
          </Text>
        ))}
        {sp.notes.trim() ? (
          <>
            <Text style={[S.sectionLabel, { marginTop: 6 }]}>Notes</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.4 }}>{sp.notes.trim()}</Text>
          </>
        ) : null}
      </View>
    </View>
  )
}

function CornersPage({ event, keys, doc, byId, timeZone, size }: {
  event: GamePlanPdfEvent
  keys: SetPieceKey[]
  doc: GamePlanDoc
  byId: Map<string, PlanPlayer>
  timeZone: string
  size: 'A4' | 'LETTER'
}) {
  return (
    <Page size={size} style={S.page}>
      <Header event={event} timeZone={timeZone} kicker="Game plan · Corners" />
      {keys.map(k => {
        const sp = doc.set_pieces[k]
        return sp ? <CornerBoard key={k} k={k} sp={sp} doc={doc} byId={byId} /> : null
      })}
      <Footer event={event} timeZone={timeZone} />
    </Page>
  )
}

export function GamePlanPDF({ event, doc, players, staff, showLineup, corners, drills, timeZone, size }: GamePlanPdfProps) {
  const byId = new Map(players.map(p => [p.id, p]))
  // Three boards per page.
  const cornerPages: SetPieceKey[][] = []
  for (let i = 0; i < corners.length; i += 3) cornerPages.push(corners.slice(i, i + 3))

  return (
    <Document title={`Game plan: ${event.title}`} author="OffPitchOS" subject="Game plan">
      {showLineup ? <LineupPage event={event} doc={doc} byId={byId} staff={staff} timeZone={timeZone} size={size} /> : null}
      {cornerPages.map((keys, i) => (
        <CornersPage key={i} event={event} keys={keys} doc={doc} byId={byId} timeZone={timeZone} size={size} />
      ))}
      {drills.map(d => (
        <DrillPdfPage key={d.id} drill={d} timeZone={timeZone} size={size} context={`Game plan: ${event.title}`} />
      ))}
    </Document>
  )
}
