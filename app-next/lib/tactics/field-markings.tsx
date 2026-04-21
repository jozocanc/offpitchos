'use client'

import React from 'react'
import { Rect, Circle, Line, Group, Arc } from 'react-konva'
import type { Field } from '@/lib/tactics/object-schema'
import type { FieldLayout } from './field-renderer-layout'

// Line / marking colors — slightly off-white so the field feels less clinical.
export const MARK_LINE = '#f5f5f0'
export const MARK_SHADOW = '#123823' // darker green "drop shadow" underlay

// Realistic gradient stops (top → bottom).
export const FIELD_GRADIENT = {
  realistic: { top: '#2d6e42', bottom: '#1f5a36' },
  schematic: { top: '#2d6e42', bottom: '#2d6e42' },
} as const

// Renders a line with a subtle dark-green drop shadow for depth.
export function MarkLine({
  points, closed,
}: { points: number[]; closed?: boolean }) {
  return (
    <>
      <Line
        points={points}
        stroke={MARK_SHADOW}
        strokeWidth={2.5}
        opacity={0.35}
        lineCap="round"
        lineJoin="round"
        closed={closed}
        listening={false}
      />
      <Line
        points={points}
        stroke={MARK_LINE}
        strokeWidth={1.5}
        lineCap="round"
        lineJoin="round"
        closed={closed}
        listening={false}
      />
    </>
  )
}

// Net pattern: a subtle cross-hatch drawn inside the goal rect
export function NetPattern({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const lines: React.ReactNode[] = []
  const step = Math.max(3, Math.min(w, h) / 4)
  const color = 'rgba(120,120,120,0.35)'
  for (let vx = x + step; vx < x + w; vx += step) {
    lines.push(
      <Line
        key={`nv-${vx}`}
        points={[vx, y, vx, y + h]}
        stroke={color}
        strokeWidth={0.5}
        listening={false}
      />
    )
  }
  for (let vy = y + step; vy < y + h; vy += step) {
    lines.push(
      <Line
        key={`nh-${vy}`}
        points={[x, vy, x + w, vy]}
        stroke={color}
        strokeWidth={0.5}
        listening={false}
      />
    )
  }
  return <>{lines}</>
}

interface FieldMarkingsProps {
  field: Field
  layout: FieldLayout
  style: 'schematic' | 'realistic'
}

export function FieldMarkings({ field, layout, style }: FieldMarkingsProps) {
  const { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH } = layout
  const isH = field.orientation === 'horizontal'
  const half = field.half_field

  const lengthPx = field.length_m * pxPerMeter
  const widthPx = field.width_m * pxPerMeter

  // ── Grass: gradient for realistic, flat for schematic ────────────────────
  const grad = FIELD_GRADIENT[style]
  const bg = (
    <Rect
      x={fieldPxX}
      y={fieldPxY}
      width={fieldPxW}
      height={fieldPxH}
      fill={style === 'schematic' ? grad.top : undefined}
      fillLinearGradientStartPoint={
        style === 'realistic' ? { x: 0, y: fieldPxY } : undefined
      }
      fillLinearGradientEndPoint={
        style === 'realistic' ? { x: 0, y: fieldPxY + fieldPxH } : undefined
      }
      fillLinearGradientColorStops={
        style === 'realistic' ? [0, grad.top, 1, grad.bottom] : undefined
      }
      listening={false}
    />
  )

  // ── Diagonal mow stripes (realistic only) ────────────────────────────────
  const grassStripes: React.ReactNode[] = []
  if (style === 'realistic') {
    const step = 5 * pxPerMeter
    const corners = [
      { x: fieldPxX,              y: fieldPxY },
      { x: fieldPxX + fieldPxW,   y: fieldPxY },
      { x: fieldPxX,              y: fieldPxY + fieldPxH },
      { x: fieldPxX + fieldPxW,   y: fieldPxY + fieldPxH },
    ]
    // Diagonal projection d = (x + y) / √2
    const ds = corners.map(c => (c.x + c.y) / Math.SQRT2)
    const dMin = Math.min(...ds)
    const dMax = Math.max(...ds)
    const bandPitch = step
    const lineLen = Math.sqrt(fieldPxW * fieldPxW + fieldPxH * fieldPxH) + step * 2
    let idx = 0
    for (let d = Math.floor(dMin / bandPitch) * bandPitch; d <= dMax + bandPitch; d += bandPitch) {
      idx++
      if (idx % 2 === 0) continue
      const cx = d / Math.SQRT2
      const cy = d / Math.SQRT2
      const ax = 1 / Math.SQRT2
      const ay = -1 / Math.SQRT2
      const x1 = cx - (ax * lineLen) / 2
      const y1 = cy - (ay * lineLen) / 2
      const x2 = cx + (ax * lineLen) / 2
      const y2 = cy + (ay * lineLen) / 2
      grassStripes.push(
        <Line
          key={`stripe-${idx}`}
          points={[x1, y1, x2, y2]}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={bandPitch}
          listening={false}
        />
      )
    }
  }

  // ── Center line ──────────────────────────────────────────────────────────
  let centerLinePts: number[] | null = null
  if (!half) {
    if (isH) {
      centerLinePts = [
        fieldPxX + lengthPx / 2, fieldPxY,
        fieldPxX + lengthPx / 2, fieldPxY + widthPx,
      ]
    } else {
      centerLinePts = [
        fieldPxX,            fieldPxY + lengthPx / 2,
        fieldPxX + widthPx,  fieldPxY + lengthPx / 2,
      ]
    }
  }

  // ── Center circle / spot ─────────────────────────────────────────────────
  const centerCircleR = 9.15 * pxPerMeter
  const centerCx = isH ? fieldPxX + lengthPx / 2 : fieldPxX + widthPx / 2
  const centerCy = isH ? fieldPxY + widthPx / 2 : fieldPxY + lengthPx / 2
  const centerSpotR = Math.max(1.5, 0.3 * pxPerMeter)

  // ── Penalty / goal box dims ──────────────────────────────────────────────
  const penaltyWidthM = Math.min(40.3, Math.max(field.width_m - 2, field.width_m * 0.5))
  const penaltyDepthM = Math.min(16.5, field.length_m * 0.3)
  const goalAreaWidthM = Math.min(18.3, field.width_m * 0.4)
  const goalAreaDepthM = Math.min(5.5, field.length_m * 0.12)
  const goalPostWidthM = Math.min(7.32, field.width_m * 0.18)
  const penaltyDepth = penaltyDepthM * pxPerMeter
  const penaltyWidth = penaltyWidthM * pxPerMeter
  const goalAreaDepth = goalAreaDepthM * pxPerMeter
  const goalAreaWidth = goalAreaWidthM * pxPerMeter
  const goalWidth = goalPostWidthM * pxPerMeter

  const penaltySpotDistM = Math.min(11, penaltyDepthM * 0.66)
  const penaltySpotDist = penaltySpotDistM * pxPerMeter
  const penaltySpotR = Math.max(1.5, 0.3 * pxPerMeter)

  const penaltyDRadius = 9.15 * pxPerMeter

  const cornerR = Math.max(3, 1 * pxPerMeter)
  const goalDepth = Math.max(3, 0.9 * pxPerMeter)

  const ends = half ? [1] : [0, 1]

  const boxLines: React.ReactNode[] = []
  const arcs: React.ReactNode[] = []
  const spots: React.ReactNode[] = []
  const goals: React.ReactNode[] = []

  for (const end of ends) {
    let penBoxX: number, penBoxY: number, penBoxW: number, penBoxH: number
    let gaBoxX: number, gaBoxY: number, gaBoxW: number, gaBoxH: number
    let penSpotX: number, penSpotY: number
    let goalX: number, goalY: number, goalW: number, goalH: number
    let dArcCx: number, dArcCy: number
    let dArcStart: number, dArcAngle: number

    if (isH) {
      penBoxX = end === 0 ? fieldPxX : fieldPxX + lengthPx - penaltyDepth
      penBoxY = fieldPxY + (widthPx - penaltyWidth) / 2
      penBoxW = penaltyDepth
      penBoxH = penaltyWidth

      gaBoxX = end === 0 ? fieldPxX : fieldPxX + lengthPx - goalAreaDepth
      gaBoxY = fieldPxY + (widthPx - goalAreaWidth) / 2
      gaBoxW = goalAreaDepth
      gaBoxH = goalAreaWidth

      penSpotX = end === 0
        ? fieldPxX + penaltySpotDist
        : fieldPxX + lengthPx - penaltySpotDist
      penSpotY = fieldPxY + widthPx / 2

      dArcCx = penSpotX
      dArcCy = penSpotY
      if (end === 0) {
        dArcStart = -53
        dArcAngle = 106
      } else {
        dArcStart = 127
        dArcAngle = 106
      }

      goalW = goalDepth
      goalH = goalWidth
      goalX = end === 0 ? fieldPxX - goalDepth : fieldPxX + lengthPx
      goalY = fieldPxY + (widthPx - goalWidth) / 2
    } else {
      penBoxY = end === 0 ? fieldPxY : fieldPxY + lengthPx - penaltyDepth
      penBoxX = fieldPxX + (widthPx - penaltyWidth) / 2
      penBoxW = penaltyWidth
      penBoxH = penaltyDepth

      gaBoxY = end === 0 ? fieldPxY : fieldPxY + lengthPx - goalAreaDepth
      gaBoxX = fieldPxX + (widthPx - goalAreaWidth) / 2
      gaBoxW = goalAreaWidth
      gaBoxH = goalAreaDepth

      penSpotY = end === 0
        ? fieldPxY + penaltySpotDist
        : fieldPxY + lengthPx - penaltySpotDist
      penSpotX = fieldPxX + widthPx / 2

      dArcCx = penSpotX
      dArcCy = penSpotY
      if (end === 0) {
        dArcStart = 37
        dArcAngle = 106
      } else {
        dArcStart = 217
        dArcAngle = 106
      }

      goalW = goalWidth
      goalH = goalDepth
      goalY = end === 0 ? fieldPxY - goalDepth : fieldPxY + lengthPx
      goalX = fieldPxX + (widthPx - goalWidth) / 2
    }

    boxLines.push(
      <MarkLine
        key={`pbox-${end}`}
        points={[
          penBoxX, penBoxY,
          penBoxX + penBoxW, penBoxY,
          penBoxX + penBoxW, penBoxY + penBoxH,
          penBoxX, penBoxY + penBoxH,
          penBoxX, penBoxY,
        ]}
      />
    )
    boxLines.push(
      <MarkLine
        key={`gabox-${end}`}
        points={[
          gaBoxX, gaBoxY,
          gaBoxX + gaBoxW, gaBoxY,
          gaBoxX + gaBoxW, gaBoxY + gaBoxH,
          gaBoxX, gaBoxY + gaBoxH,
          gaBoxX, gaBoxY,
        ]}
      />
    )

    spots.push(
      <Circle
        key={`pspot-${end}`}
        x={penSpotX}
        y={penSpotY}
        radius={penaltySpotR}
        fill={MARK_LINE}
        listening={false}
      />
    )

    arcs.push(
      <Arc
        key={`parc-shadow-${end}`}
        x={dArcCx}
        y={dArcCy}
        innerRadius={penaltyDRadius - 1}
        outerRadius={penaltyDRadius + 1}
        angle={dArcAngle}
        rotation={dArcStart}
        fill={MARK_SHADOW}
        opacity={0.35}
        listening={false}
      />
    )
    arcs.push(
      <Arc
        key={`parc-${end}`}
        x={dArcCx}
        y={dArcCy}
        innerRadius={penaltyDRadius - 0.75}
        outerRadius={penaltyDRadius + 0.75}
        angle={dArcAngle}
        rotation={dArcStart}
        fill={MARK_LINE}
        listening={false}
      />
    )

    goals.push(
      <Group key={`goal-${end}`} listening={false}>
        <Rect
          x={goalX}
          y={goalY}
          width={goalW}
          height={goalH}
          fill="#ffffff"
          opacity={0.85}
        />
        <NetPattern x={goalX} y={goalY} w={goalW} h={goalH} />
        <Rect
          x={goalX}
          y={goalY}
          width={goalW}
          height={goalH}
          stroke="#c8c8c8"
          strokeWidth={1}
        />
      </Group>
    )
  }

  // Corner arcs
  const cornerList: Array<{ cx: number; cy: number; start: number }> = []
  if (!half) {
    cornerList.push({ cx: fieldPxX,              cy: fieldPxY,              start: 0 })
    cornerList.push({ cx: fieldPxX + fieldPxW,   cy: fieldPxY,              start: 90 })
    cornerList.push({ cx: fieldPxX + fieldPxW,   cy: fieldPxY + fieldPxH,   start: 180 })
    cornerList.push({ cx: fieldPxX,              cy: fieldPxY + fieldPxH,   start: 270 })
  } else {
    if (isH) {
      cornerList.push({ cx: fieldPxX + fieldPxW, cy: fieldPxY, start: 90 })
      cornerList.push({ cx: fieldPxX + fieldPxW, cy: fieldPxY + fieldPxH, start: 180 })
    } else {
      cornerList.push({ cx: fieldPxX + fieldPxW, cy: fieldPxY + fieldPxH, start: 180 })
      cornerList.push({ cx: fieldPxX,            cy: fieldPxY + fieldPxH, start: 270 })
    }
  }
  for (const c of cornerList) {
    arcs.push(
      <Arc
        key={`corner-sh-${c.cx}-${c.cy}`}
        x={c.cx}
        y={c.cy}
        innerRadius={cornerR - 1}
        outerRadius={cornerR + 1}
        angle={90}
        rotation={c.start}
        fill={MARK_SHADOW}
        opacity={0.35}
        listening={false}
      />
    )
    arcs.push(
      <Arc
        key={`corner-${c.cx}-${c.cy}`}
        x={c.cx}
        y={c.cy}
        innerRadius={cornerR - 0.75}
        outerRadius={cornerR + 0.75}
        angle={90}
        rotation={c.start}
        fill={MARK_LINE}
        listening={false}
      />
    )
  }

  return (
    <>
      {bg}
      {grassStripes}

      {/* Outer boundary */}
      <MarkLine
        points={[
          fieldPxX,              fieldPxY,
          fieldPxX + fieldPxW,   fieldPxY,
          fieldPxX + fieldPxW,   fieldPxY + fieldPxH,
          fieldPxX,              fieldPxY + fieldPxH,
          fieldPxX,              fieldPxY,
        ]}
      />

      {boxLines}

      {centerLinePts && <MarkLine points={centerLinePts} />}

      {!half && (
        <>
          <Circle
            x={centerCx}
            y={centerCy}
            radius={centerCircleR}
            stroke={MARK_SHADOW}
            strokeWidth={2.5}
            opacity={0.35}
            listening={false}
          />
          <Circle
            x={centerCx}
            y={centerCy}
            radius={centerCircleR}
            stroke={MARK_LINE}
            strokeWidth={1.5}
            listening={false}
          />
          <Circle
            x={centerCx}
            y={centerCy}
            radius={centerSpotR}
            fill={MARK_LINE}
            listening={false}
          />
        </>
      )}

      {arcs}
      {spots}
      {goals}
    </>
  )
}
