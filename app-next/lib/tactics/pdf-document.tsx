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
  ink: '#0a1628',
  accent: '#00FF87',
  muted: '#6b7280',
  border: '#e5e0d5',
} as const

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.ink,
    backgroundColor: '#ffffff',
    paddingBottom: 70,
  },
  // Header band
  header: {
    backgroundColor: C.green,
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 20,
    minHeight: 80,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  drillTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    color: '#ffffff',
    flex: 1,
    marginRight: 16,
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  headerMetaText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    color: '#ffffff',
  },
  chipAccent: {
    backgroundColor: C.accent,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    color: C.ink,
    fontFamily: 'Helvetica-Bold',
  },
  // Body
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
    borderLeft: `3px solid ${C.green}`,
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
  diagramImage: {
    width: 370,
    height: 278,
    objectFit: 'contain',
  },
  noPreview: {
    width: 370,
    height: 220,
    backgroundColor: C.cream,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${C.border}`,
  },
  noPreviewText: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'Helvetica-Oblique',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: C.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  footerBrand: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.accent,
    letterSpacing: 0.5,
  },
  footerPage: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
  },
  footerDate: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.45)',
  },
  // Cover page
  cover: {
    backgroundColor: C.green,
    flex: 1,
    padding: 48,
    justifyContent: 'center',
  },
  coverBrand: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.accent,
    letterSpacing: 1,
    marginBottom: 48,
  },
  coverTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    color: '#ffffff',
    marginBottom: 12,
  },
  coverSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 40,
  },
  coverMeta: {
    borderTop: '1px solid rgba(255,255,255,0.2)',
    paddingTop: 24,
    gap: 10,
  },
  coverMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    width: 90,
  },
  coverMetaValue: {
    fontSize: 10,
    color: '#ffffff',
    flex: 1,
  },
  coverGoal: {
    marginTop: 24,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    padding: 14,
  },
  coverGoalLabel: {
    fontSize: 8,
    color: C.accent,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  coverGoalText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.5,
  },
  // Per-drill page (session plan)
  drillPageHeader: {
    backgroundColor: C.cream,
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `2px solid ${C.green}`,
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
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
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

// ─── Diagram area ────────────────────────────────────────────────────────────

function DiagramArea({ thumbnail }: { thumbnail: Buffer | null }) {
  return (
    <View style={S.diagramArea}>
      {thumbnail ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={thumbnail} style={S.diagramImage} />
      ) : (
        <View style={S.noPreview}>
          <Text style={S.noPreviewText}>Preview pending</Text>
        </View>
      )}
    </View>
  )
}

// ─── DrillPDF ─────────────────────────────────────────────────────────────────

export interface DrillPDFProps {
  drill: DrillRow
  creatorName: string
  teamName: string
  thumbnail: Buffer | null
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
        {/* Header */}
        <View style={S.header}>
          <View style={S.headerTop}>
            <Text style={S.drillTitle}>{drill.title}</Text>
            <View style={S.headerMeta}>
              <Text style={S.headerMetaText}>{creatorName}</Text>
              <Text style={S.headerMetaText}>{drillDate}</Text>
            </View>
          </View>
          <View style={S.chipRow}>
            <Text style={S.chipAccent}>{categoryLabel(drill.category)}</Text>
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
        <View style={S.footer}>
          <Text style={S.footerBrand}>OffPitchOS</Text>
          <Text style={S.footerDate}>Generated {generatedAt}</Text>
          <Text style={S.footerPage}>Page 1 / 1</Text>
        </View>
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
  thumbnail: Buffer | null
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
      <Page size="A4" style={S.page}>
        <View style={[S.cover, { paddingBottom: 80 }]}>
          <Text style={S.coverBrand}>OffPitchOS</Text>
          <Text style={S.coverTitle}>{event.title}</Text>
          <Text style={S.coverSubtitle}>Session Plan</Text>

          <View style={S.coverMeta}>
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
            <View style={S.coverMetaRow}>
              <Text style={S.coverMetaLabel}>Duration</Text>
              <Text style={S.coverMetaValue}>{totalMin} min</Text>
            </View>
            <View style={S.coverMetaRow}>
              <Text style={S.coverMetaLabel}>Drills</Text>
              <Text style={S.coverMetaValue}>
                {drills.length === 0 ? 'None attached' : `${drills.length} drill${drills.length === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>

          {event.notes && (
            <View style={S.coverGoal}>
              <Text style={S.coverGoalLabel}>Session Goal</Text>
              <Text style={S.coverGoalText}>{truncateWords(event.notes, 80)}</Text>
            </View>
          )}

          {drills.length === 0 && (
            <View style={[S.coverGoal, { marginTop: 32 }]}>
              <Text style={[S.coverGoalText, { textAlign: 'center', color: 'rgba(255,255,255,0.55)' }]}>
                No drills attached yet.
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerBrand}>OffPitchOS</Text>
          <Text style={S.footerDate}>Generated {generatedAt}</Text>
          <Text style={S.footerPage}>Page 1 / {totalPages}</Text>
        </View>
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

            {/* Footer */}
            <View style={S.footer}>
              <Text style={S.footerBrand}>OffPitchOS</Text>
              <Text style={S.footerDate}>Generated {generatedAt}</Text>
              <Text style={S.footerPage}>Page {pageNum} / {totalPages}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
