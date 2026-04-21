// Server-only — never import this in client components.
// Imported only from app/api/tactics/pdf/** route handlers.

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { DrillRow } from './object-schema'
import { DRILL_CATEGORY_LABELS } from './drill-categories'
import type { DrillCategory } from './drill-categories'

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  green: '#2d6e42',
  cream: '#f7f3e9',
  offWhite: '#fafaf7',
  ink: '#1a1a1a',
  muted: '#6b7280',
  border: '#e5e0d5',
  // forest green at 20% opacity — expressed as hex approximation on white bg
  headerBorderGreen: '#b8d4c2',
} as const

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.ink,
    backgroundColor: '#ffffff',
    paddingBottom: 56,
  },
  // ─ Logo box (18×18 forest-green rounded square with "OP" white text) ─
  logoBox: {
    width: 18,
    height: 18,
    backgroundColor: C.green,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  // ─ Header band ─
  header: {
    backgroundColor: C.cream,
    paddingHorizontal: 32,
    paddingTop: 22,
    paddingBottom: 18,
    borderBottom: `1pt solid ${C.headerBorderGreen}`,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 16,
  },
  drillTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 26,
    color: C.green,
    flex: 1,
    lineHeight: 1.2,
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  headerMetaText: {
    fontSize: 9,
    color: C.muted,
    marginBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: C.cream,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    color: C.green,
    border: `1pt solid ${C.green}`,
    fontFamily: 'Helvetica-Bold',
  },
  // ─ Body ─
  body: {
    paddingHorizontal: 32,
    paddingTop: 20,
    flex: 1,
  },
  sectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  description: {
    fontSize: 10,
    color: C.ink,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  coachNoteBox: {
    backgroundColor: C.cream,
    borderLeft: `3pt solid ${C.green}`,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 20,
    borderRadius: 2,
  },
  coachNoteText: {
    fontSize: 9,
    color: C.ink,
    lineHeight: 1.5,
  },
  diagramArea: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  diagramPanel: {
    width: 380,
    backgroundColor: C.offWhite,
    border: `1pt solid ${C.green}`,
    borderRadius: 6,
    padding: 6,
    alignItems: 'center',
  },
  diagramImage: {
    width: 368,
    height: 276,
    objectFit: 'contain',
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },
  // ─ Footer ─
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: C.cream,
    borderTop: `1pt solid ${C.headerBorderGreen}`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerBrand: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.green,
    letterSpacing: 0.5,
  },
  footerPage: {
    fontSize: 9,
    color: C.muted,
  },
  footerDate: {
    fontSize: 8,
    color: C.muted,
  },
  // ─ Cover page ─
  coverPage: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.ink,
    backgroundColor: '#ffffff',
    paddingBottom: 56,
  },
  coverHeader: {
    backgroundColor: C.green,
    paddingHorizontal: 48,
    paddingTop: 64,
    paddingBottom: 64,
  },
  coverBrand: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.cream,
    letterSpacing: 1,
    marginBottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverBrandText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.cream,
    letterSpacing: 1,
  },
  coverTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 32,
    color: '#ffffff',
    marginBottom: 10,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
  },
  coverBody: {
    paddingHorizontal: 48,
    paddingTop: 32,
    flex: 1,
  },
  coverMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    width: 90,
  },
  coverMetaValue: {
    fontSize: 10,
    color: C.ink,
    flex: 1,
  },
  coverChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  coverChip: {
    backgroundColor: C.cream,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    color: C.green,
    border: `1pt solid ${C.green}`,
    fontFamily: 'Helvetica-Bold',
  },
  coverMetaDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 20,
  },
  coverGoalBox: {
    backgroundColor: C.cream,
    borderLeft: `3pt solid ${C.green}`,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 2,
    marginTop: 8,
  },
  coverGoalLabel: {
    fontSize: 8,
    color: C.green,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  coverGoalText: {
    fontSize: 10,
    color: C.ink,
    lineHeight: 1.5,
  },
  coverDrillListItem: {
    fontSize: 10,
    color: C.ink,
    marginBottom: 5,
    paddingLeft: 12,
  },
  // ─ Per-drill page header (session/batch pages) ─
  drillPageHeader: {
    backgroundColor: C.cream,
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `2pt solid ${C.green}`,
  },
  drillPageTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: C.ink,
    flex: 1,
    marginRight: 16,
  },
  drillPageMeta: {
    alignItems: 'flex-end',
    gap: 3,
  },
  drillPageMetaText: {
    fontSize: 9,
    color: C.muted,
  },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  })
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ') + '…'
}

function categoryLabel(cat: string): string {
  return DRILL_CATEGORY_LABELS[cat as DrillCategory] ?? cat
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function LogoBox() {
  return (
    <View style={S.logoBox}>
      <Text style={S.logoText}>OP</Text>
    </View>
  )
}

function DiagramArea({ thumbnail }: { thumbnail: Buffer }) {
  return (
    <View style={S.diagramArea}>
      <View style={S.diagramPanel}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={thumbnail} style={S.diagramImage} />
      </View>
    </View>
  )
}

function PageFooter({ generatedAt, pageNum, totalPages }: { generatedAt: string; pageNum: number; totalPages: number }) {
  return (
    <View style={S.footer}>
      <View style={S.footerLeft}>
        <LogoBox />
        <Text style={S.footerBrand}>OffPitchOS</Text>
      </View>
      <Text style={S.footerDate}>Generated {generatedAt}</Text>
      <Text style={S.footerPage}>Page {pageNum} / {totalPages}</Text>
    </View>
  )
}

// ─── DrillPDF ─────────────────────────────────────────────────────────────────

export interface DrillPDFProps {
  drill: DrillRow
  creatorName: string
  teamName: string
  thumbnail: Buffer
}

export function DrillPDF({ drill, creatorName, teamName, thumbnail }: DrillPDFProps) {
  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  const drillDate = formatDate(drill.updated_at)
  const descTruncated = drill.description ? truncateWords(drill.description, 120) : ''

  return (
    <Document
      title={drill.title}
      author="OffPitchOS"
      subject="Drill Export"
    >
      <Page size="A4" style={S.page}>
        {/* Header band */}
        <View style={S.header}>
          <View style={S.headerTop}>
            <View style={S.headerLeft}>
              <View style={{ marginTop: 6, marginRight: 10 }}>
                <LogoBox />
              </View>
              <Text style={S.drillTitle}>{drill.title}</Text>
            </View>
            <View style={S.headerMeta}>
              <Text style={S.headerMetaText}>{creatorName}</Text>
              <Text style={S.headerMetaText}>{drillDate}</Text>
            </View>
          </View>
          <View style={S.chipRow}>
            <Text style={S.chip}>{categoryLabel(drill.category)}</Text>
            <Text style={S.chip}>{teamName}</Text>
          </View>
        </View>

        {/* Body */}
        <View style={S.body}>
          {descTruncated ? (
            <>
              <Text style={S.sectionLabel}>Description</Text>
              <Text style={S.description}>{descTruncated}</Text>
            </>
          ) : null}

          <Text style={S.sectionLabel}>Diagram</Text>
          <DiagramArea thumbnail={thumbnail} />
        </View>

        {/* Footer */}
        <PageFooter generatedAt={generatedAt} pageNum={1} totalPages={1} />
      </Page>
    </Document>
  )
}

// ─── SessionPlanPDF ───────────────────────────────────────────────────────────

export interface SessionDrill {
  id: string
  drillId: string
  orderIndex: number
  durationMinutes: number
  coachNotes: string | null
  title: string
  category: string
  thumbnail: Buffer
  description: string
}

export interface SessionEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  notes: string | null
  teamName: string
  coachName: string
}

export interface SessionPlanPDFProps {
  event: SessionEvent
  drills: SessionDrill[]
}

export function SessionPlanPDF({ event, drills }: SessionPlanPDFProps) {
  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const sessionDate = new Date(event.start_time).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  })
  const sessionTime = new Date(event.start_time).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })

  const totalMin = drills.reduce((sum, d) => sum + d.durationMinutes, 0)
  const totalPages = drills.length > 0 ? drills.length + 1 : 1

  return (
    <Document
      title={`Session Plan — ${event.title}`}
      author="OffPitchOS"
      subject="Session Plan Export"
    >
      {/* Cover page */}
      <Page size="A4" style={S.coverPage}>
        <View style={S.coverHeader}>
          {/* Brand row */}
          <View style={[S.coverBrand, { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={[S.logoBox, { marginRight: 8, backgroundColor: C.cream }]}>
              <Text style={[S.logoText, { color: C.green }]}>OP</Text>
            </View>
            <Text style={S.coverBrandText}>OffPitchOS</Text>
          </View>
          <Text style={S.coverTitle}>{event.title}</Text>
          <Text style={S.coverSubtitle}>Session Plan</Text>
        </View>

        <View style={S.coverBody}>
          <View style={S.coverMetaRow}>
            <Text style={S.coverMetaLabel}>Team</Text>
            <Text style={S.coverMetaValue}>{event.teamName}</Text>
          </View>
          <View style={S.coverMetaRow}>
            <Text style={S.coverMetaLabel}>Date</Text>
            <Text style={S.coverMetaValue}>{sessionDate} at {sessionTime}</Text>
          </View>
          <View style={S.coverMetaRow}>
            <Text style={S.coverMetaLabel}>Coach</Text>
            <Text style={S.coverMetaValue}>{event.coachName}</Text>
          </View>
          <View style={[S.coverMetaRow, { alignItems: 'center' }]}>
            <Text style={S.coverMetaLabel}>Duration &amp; Drills</Text>
            <View style={S.coverChipRow}>
              <Text style={S.coverChip}>{totalMin} min</Text>
              <Text style={S.coverChip}>
                {drills.length === 0 ? 'No drills' : `${drills.length} drill${drills.length === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>

          {event.notes && (
            <>
              <View style={S.coverMetaDivider} />
              <View style={S.coverGoalBox}>
                <Text style={S.coverGoalLabel}>Session Goal</Text>
                <Text style={S.coverGoalText}>{truncateWords(event.notes, 80)}</Text>
              </View>
            </>
          )}

          {drills.length === 0 && (
            <View style={[S.coverGoalBox, { marginTop: 32 }]}>
              <Text style={[S.coverGoalText, { color: C.muted, textAlign: 'center' }]}>
                No drills attached yet.
              </Text>
            </View>
          )}
        </View>

        <PageFooter generatedAt={generatedAt} pageNum={1} totalPages={totalPages} />
      </Page>

      {/* One page per drill */}
      {drills.map((d, idx) => {
        const pageNum = idx + 2
        const descTruncated = d.description ? truncateWords(d.description, 100) : ''

        return (
          <Page key={d.id} size="A4" style={S.page}>
            {/* Drill page header */}
            <View style={S.drillPageHeader}>
              <Text style={S.drillPageTitle}>{d.title}</Text>
              <View style={S.drillPageMeta}>
                <Text style={S.drillPageMetaText}>{categoryLabel(d.category)}</Text>
                <Text style={S.drillPageMetaText}>{d.durationMinutes} min</Text>
              </View>
            </View>

            <View style={S.body}>
              {d.coachNotes && (
                <>
                  <Text style={S.sectionLabel}>Coach Notes</Text>
                  <View style={S.coachNoteBox}>
                    <Text style={S.coachNoteText}>{d.coachNotes}</Text>
                  </View>
                </>
              )}

              {descTruncated ? (
                <>
                  <Text style={S.sectionLabel}>Description</Text>
                  <Text style={S.description}>{descTruncated}</Text>
                </>
              ) : null}

              <Text style={S.sectionLabel}>Diagram</Text>
              <DiagramArea thumbnail={d.thumbnail} />
            </View>

            <PageFooter generatedAt={generatedAt} pageNum={pageNum} totalPages={totalPages} />
          </Page>
        )
      })}
    </Document>
  )
}

// ─── BatchDrillPDF ────────────────────────────────────────────────────────────

export interface BatchDrill {
  id: string
  title: string
  category: string
  description: string
  thumbnail: Buffer
}

export interface BatchDrillPDFProps {
  drills: BatchDrill[]
}

export function BatchDrillPDF({ drills }: BatchDrillPDFProps) {
  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const totalPages = drills.length + 1

  return (
    <Document
      title={`Drill Pack — ${drills.length} drill${drills.length === 1 ? '' : 's'}`}
      author="OffPitchOS"
      subject="Drill Pack Export"
    >
      {/* Cover page */}
      <Page size="A4" style={S.coverPage}>
        <View style={S.coverHeader}>
          <View style={[S.coverBrand, { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={[S.logoBox, { marginRight: 8, backgroundColor: C.cream }]}>
              <Text style={[S.logoText, { color: C.green }]}>OP</Text>
            </View>
            <Text style={S.coverBrandText}>OffPitchOS</Text>
          </View>
          <Text style={S.coverTitle}>Drill Pack</Text>
          <Text style={S.coverSubtitle}>
            {drills.length} drill{drills.length === 1 ? '' : 's'} · {generatedAt}
          </Text>
        </View>

        <View style={S.coverBody}>
          <View style={S.coverChipRow}>
            <Text style={S.coverChip}>{drills.length} drill{drills.length === 1 ? '' : 's'}</Text>
            <Text style={S.coverChip}>{generatedAt}</Text>
          </View>

          <View style={S.coverMetaDivider} />

          <Text style={[S.sectionLabel, { marginBottom: 10 }]}>Included drills</Text>
          {drills.map((d, i) => (
            <Text key={d.id} style={S.coverDrillListItem}>
              {i + 1}. {d.title} — {categoryLabel(d.category)}
            </Text>
          ))}
        </View>

        <PageFooter generatedAt={generatedAt} pageNum={1} totalPages={totalPages} />
      </Page>

      {/* One page per drill */}
      {drills.map((d, idx) => {
        const pageNum = idx + 2
        const descTruncated = d.description ? truncateWords(d.description, 100) : ''

        return (
          <Page key={d.id} size="A4" style={S.page}>
            <View style={S.drillPageHeader}>
              <Text style={S.drillPageTitle}>{d.title}</Text>
              <View style={S.drillPageMeta}>
                <Text style={S.drillPageMetaText}>{categoryLabel(d.category)}</Text>
              </View>
            </View>

            <View style={S.body}>
              {descTruncated ? (
                <>
                  <Text style={S.sectionLabel}>Description</Text>
                  <Text style={S.description}>{descTruncated}</Text>
                </>
              ) : null}

              <Text style={S.sectionLabel}>Diagram</Text>
              <DiagramArea thumbnail={d.thumbnail} />
            </View>

            <PageFooter generatedAt={generatedAt} pageNum={pageNum} totalPages={totalPages} />
          </Page>
        )
      })}
    </Document>
  )
}
