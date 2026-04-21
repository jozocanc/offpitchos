'use client'

import React from 'react'
import Konva from 'konva'
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Text,
  Group,
  RegularPolygon,
  Arrow,
} from 'react-konva'
import type { BoardObject, Field } from '@/lib/tactics/object-schema'

// ─── Color maps ──────────────────────────────────────────────────────────────

export const FIELD_BG = {
  schematic: '#0A6B3C',
  realistic: '#2B7A3F',
} as const

export const PLAYER_COLORS: Record<string, string> = {
  red: '#E63946',
  blue: '#2C7BE5',
  neutral: '#9CA3AF',
  outside: '#6B7280',
  gk: '#FFD500',
  coach: '#111111',
}

export const CONE_COLORS: Record<string, string> = {
  orange: '#FF8C00',
  yellow: '#FFD500',
  red: '#E63946',
  blue: '#2C7BE5',
  white: '#F3F4F6',
}

export const ARROW_STYLES: Record<
  string,
  { stroke: string; fill: string; dash?: number[] }
> = {
  pass: { stroke: '#E63946', fill: '#E63946' },
  run: { stroke: '#2C7BE5', fill: '#2C7BE5', dash: [10, 6] },
  free: { stroke: '#FFD500', fill: '#FFD500' },
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface FieldLayout {
  pxPerMeter: number
  fieldPxX: number
  fieldPxY: number
  fieldPxW: number
  fieldPxH: number
}

const MARGIN = 24

export function useFieldLayout(
  field: Field,
  width: number,
  height: number
): FieldLayout {
  // available space after margin
  const availW = width - MARGIN * 2
  const availH = height - MARGIN * 2

  // meters on each pixel axis
  const mW = field.orientation === 'horizontal' ? field.length_m : field.width_m
  const mH = field.orientation === 'horizontal' ? field.width_m : field.length_m

  const pxPerMeter = Math.min(availW / mW, availH / mH)

  const fieldPxW = mW * pxPerMeter
  const fieldPxH = mH * pxPerMeter

  // center within stage
  const fieldPxX = (width - fieldPxW) / 2
  const fieldPxY = (height - fieldPxH) / 2

  return { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH }
}

// helpers: convert field-meter coords to stage-pixel coords (orientation-aware)
function mToPx(xM: number, yM: number, field: Field, layout: FieldLayout) {
  if (field.orientation === 'horizontal') {
    return {
      x: layout.fieldPxX + xM * layout.pxPerMeter,
      y: layout.fieldPxY + yM * layout.pxPerMeter,
    }
  }
  // vertical: length (x-meter) runs down pixel-y; width (y-meter) runs across pixel-x
  return {
    x: layout.fieldPxX + yM * layout.pxPerMeter,
    y: layout.fieldPxY + xM * layout.pxPerMeter,
  }
}

// Inverse: stage-pixel coords → field-meter coords (orientation-aware)
export function pxToM(
  px: number, py: number, field: Field, layout: FieldLayout
): { xM: number; yM: number } {
  const dx = px - layout.fieldPxX
  const dy = py - layout.fieldPxY
  if (field.orientation === 'horizontal') {
    return { xM: dx / layout.pxPerMeter, yM: dy / layout.pxPerMeter }
  }
  // vertical: pixel-x → yM, pixel-y → xM
  return { xM: dy / layout.pxPerMeter, yM: dx / layout.pxPerMeter }
}

function mLen(meters: number, layout: FieldLayout) {
  return meters * layout.pxPerMeter
}

// ─── Field markings ──────────────────────────────────────────────────────────

interface FieldMarkingsProps {
  field: Field
  layout: FieldLayout
  style: 'schematic' | 'realistic'
}

export function FieldMarkings({ field, layout, style }: FieldMarkingsProps) {
  const { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH } = layout
  const isH = field.orientation === 'horizontal'
  const half = field.half_field

  // In "horizontal" mode: X axis = length_m (goal to goal), Y axis = width_m (sideline to sideline)
  // In "vertical" mode:   Y axis = length_m, X axis = width_m
  const lengthPx = field.length_m * pxPerMeter
  const widthPx = field.width_m * pxPerMeter

  const strokeColor = '#ffffff'
  const strokeWidth = 2

  // --- Realistic grass stripes ---
  const grassStripes: React.ReactNode[] = []
  if (style === 'realistic') {
    const stripeStep = 5 * pxPerMeter
    const stripeCount = Math.ceil((isH ? fieldPxW : fieldPxH) / stripeStep)
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) continue
      grassStripes.push(
        <Rect
          key={`stripe-${i}`}
          x={isH ? fieldPxX + i * stripeStep : fieldPxX}
          y={isH ? fieldPxY : fieldPxY + i * stripeStep}
          width={isH ? stripeStep : fieldPxW}
          height={isH ? fieldPxH : stripeStep}
          fill="rgba(255,255,255,0.04)"
          listening={false}
        />
      )
    }
  }

  // --- Center line (full-field only) ---
  const centerLine = !half ? (
    isH ? (
      <Line
        key="center-line"
        points={[
          fieldPxX + lengthPx / 2, fieldPxY,
          fieldPxX + lengthPx / 2, fieldPxY + widthPx,
        ]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        listening={false}
      />
    ) : (
      <Line
        key="center-line"
        points={[
          fieldPxX,               fieldPxY + lengthPx / 2,
          fieldPxX + widthPx,     fieldPxY + lengthPx / 2,
        ]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        listening={false}
      />
    )
  ) : null

  // --- Center circle (full-field only) ---
  const centerCircleR = 9.15 * pxPerMeter
  const centerCircle = !half ? (
    <Circle
      key="center-circle"
      x={isH ? fieldPxX + lengthPx / 2 : fieldPxX + widthPx / 2}
      y={isH ? fieldPxY + widthPx / 2 : fieldPxY + lengthPx / 2}
      radius={centerCircleR}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      fill="transparent"
      listening={false}
    />
  ) : null

  // --- Penalty & goal boxes ---
  // penalty box: 16.5m × 40.3m (depth × width), centered on width axis, at each end
  const penaltyDepth = 16.5 * pxPerMeter
  const penaltyWidth = 40.3 * pxPerMeter
  const goalAreaDepth = 5.5 * pxPerMeter
  const goalAreaWidth = 18.3 * pxPerMeter
  const goalWidth = 7.32 * pxPerMeter
  const goalDepth = 0.5 * pxPerMeter

  // Build boxes for each end. ends: 0 = left/top, 1 = right/bottom
  const ends = half ? [1] : [0, 1] // attacking end = end 1 (right/bottom)

  const penaltyBoxes: React.ReactNode[] = []
  const goalAreaBoxes: React.ReactNode[] = []
  const goalPosts: React.ReactNode[] = []

  for (const end of ends) {
    if (isH) {
      // end 0 = left side (x=fieldPxX), end 1 = right side
      const boxX = end === 0 ? fieldPxX : fieldPxX + lengthPx - penaltyDepth
      const boxY = fieldPxY + (widthPx - penaltyWidth) / 2
      penaltyBoxes.push(
        <Rect
          key={`penalty-${end}`}
          x={boxX}
          y={boxY}
          width={penaltyDepth}
          height={penaltyWidth}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          listening={false}
        />
      )

      const gaX = end === 0 ? fieldPxX : fieldPxX + lengthPx - goalAreaDepth
      const gaY = fieldPxY + (widthPx - goalAreaWidth) / 2
      goalAreaBoxes.push(
        <Rect
          key={`goal-area-${end}`}
          x={gaX}
          y={gaY}
          width={goalAreaDepth}
          height={goalAreaWidth}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          listening={false}
        />
      )

      // goal posts (drawn outside the field)
      const gX = end === 0 ? fieldPxX - goalDepth : fieldPxX + lengthPx
      const gY = fieldPxY + (widthPx - goalWidth) / 2
      goalPosts.push(
        <Rect
          key={`goal-${end}`}
          x={gX}
          y={gY}
          width={goalDepth}
          height={goalWidth}
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth={1}
          listening={false}
        />
      )
    } else {
      // vertical orientation: length on Y axis
      // end 0 = top (y=fieldPxY), end 1 = bottom
      const boxY = end === 0 ? fieldPxY : fieldPxY + lengthPx - penaltyDepth
      const boxX = fieldPxX + (widthPx - penaltyWidth) / 2
      penaltyBoxes.push(
        <Rect
          key={`penalty-${end}`}
          x={boxX}
          y={boxY}
          width={penaltyWidth}
          height={penaltyDepth}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          listening={false}
        />
      )

      const gaY = end === 0 ? fieldPxY : fieldPxY + lengthPx - goalAreaDepth
      const gaX = fieldPxX + (widthPx - goalAreaWidth) / 2
      goalAreaBoxes.push(
        <Rect
          key={`goal-area-${end}`}
          x={gaX}
          y={gaY}
          width={goalAreaWidth}
          height={goalAreaDepth}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          listening={false}
        />
      )

      const gY = end === 0 ? fieldPxY - goalDepth : fieldPxY + lengthPx
      const gX = fieldPxX + (widthPx - goalWidth) / 2
      goalPosts.push(
        <Rect
          key={`goal-${end}`}
          x={gX}
          y={gY}
          width={goalWidth}
          height={goalDepth}
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth={1}
          listening={false}
        />
      )
    }
  }

  return (
    <>
      {/* Field background */}
      <Rect
        x={fieldPxX}
        y={fieldPxY}
        width={fieldPxW}
        height={fieldPxH}
        fill={FIELD_BG[style]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        listening={false}
      />
      {grassStripes}
      {penaltyBoxes}
      {goalAreaBoxes}
      {goalPosts}
      {centerLine}
      {centerCircle}
    </>
  )
}

// ─── Per-type object nodes ────────────────────────────────────────────────────

interface NodeProps<T extends BoardObject> {
  obj: T
  field: Field
  layout: FieldLayout
  selected: boolean
  interactive: boolean
  onSelect?: (id: string, additive: boolean) => void
  onDragEnd?: (id: string, x: number, y: number) => void
  onDoubleClick?: (id: string) => void
  onContextMenu?: (id: string, clientX: number, clientY: number) => void
}

// Selection ring stroke
const SEL_COLOR = '#00FF87'
const SEL_WIDTH = 3

// ── ZoneNode ──────────────────────────────────────────────────────────────────
type ZoneObj = Extract<BoardObject, { type: 'zone' }>

export function ZoneNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
}: NodeProps<ZoneObj>) {
  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  // In vertical orientation, the x/y axes are swapped, so pixel width = height_m * ppm and vice versa
  const w = field.orientation === 'horizontal' ? mLen(obj.width, layout) : mLen(obj.height, layout)
  const h = field.orientation === 'horizontal' ? mLen(obj.height, layout) : mLen(obj.width, layout)
  const draggable = interactive && !obj.locked

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      draggable={draggable}
      {...handlers}
    >
      <Rect
        width={w}
        height={h}
        fill={obj.color}
        opacity={obj.opacity}
        stroke={selected ? SEL_COLOR : undefined}
        strokeWidth={selected ? SEL_WIDTH : 0}
        listening={interactive}
      />
      {obj.label && (
        <Text
          text={obj.label}
          x={0}
          y={0}
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          fill="#ffffff"
          shadowColor="#000000"
          shadowBlur={3}
          shadowOpacity={0.8}
          fontSize={Math.max(10, mLen(1.5, layout))}
          listening={false}
        />
      )}
    </Group>
  )
}

// ── ZoneLineNode ──────────────────────────────────────────────────────────────
type ZoneLineObj = Extract<BoardObject, { type: 'zone-line' }>

export function ZoneLineNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onContextMenu,
}: NodeProps<ZoneLineObj>) {
  if (obj.hidden) return null
  const p0 = mToPx(obj.points[0], obj.points[1], field, layout)
  const p1 = mToPx(obj.points[2], obj.points[3], field, layout)

  return (
    <Line
      points={[p0.x, p0.y, p1.x, p1.y]}
      stroke={selected ? SEL_COLOR : obj.color}
      strokeWidth={2}
      dash={[8, 6]}
      listening={interactive}
      onClick={
        interactive
          ? (e: Konva.KonvaEventObject<MouseEvent>) =>
              onSelect?.(obj.id, e.evt.shiftKey)
          : undefined
      }
      onContextMenu={
        interactive && onContextMenu
          ? (e: Konva.KonvaEventObject<PointerEvent>) => {
              e.evt.preventDefault()
              onContextMenu(obj.id, e.evt.clientX, e.evt.clientY)
            }
          : undefined
      }
    />
  )
}

// ── ConeNode ──────────────────────────────────────────────────────────────────
type ConeObj = Extract<BoardObject, { type: 'cone' }>

export function ConeNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
}: NodeProps<ConeObj>) {
  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(0.8, layout)
  const draggable = interactive && !obj.locked

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <RegularPolygon
      id={obj.id}
      x={x}
      y={y}
      sides={3}
      radius={radius}
      fill={CONE_COLORS[obj.color] ?? obj.color}
      stroke={selected ? SEL_COLOR : '#00000044'}
      strokeWidth={selected ? SEL_WIDTH : 1}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    />
  )
}

// ── BallNode ──────────────────────────────────────────────────────────────────
type BallObj = Extract<BoardObject, { type: 'ball' }>

export function BallNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
}: NodeProps<BallObj>) {
  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(0.4, layout)
  const draggable = interactive && !obj.locked

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      <Circle
        radius={radius}
        fill="#ffffff"
        stroke={selected ? SEL_COLOR : '#111111'}
        strokeWidth={selected ? SEL_WIDTH : 1.5}
      />
      {/* Simple detail: small inner dark circle */}
      <Circle radius={radius * 0.3} fill="#111111" listening={false} />
    </Group>
  )
}

// ── GoalNode ──────────────────────────────────────────────────────────────────
type GoalObj = Extract<BoardObject, { type: 'goal' }>

const GOAL_SIZES: Record<string, { w: number; h: number }> = {
  'mini-h': { w: 3, h: 1 },
  'mini-v': { w: 1, h: 3 },
  full: { w: 7.32, h: 2.44 },
}

export function GoalNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
}: NodeProps<GoalObj>) {
  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const size = GOAL_SIZES[obj.variant] ?? GOAL_SIZES['full']
  const w = mLen(size.w, layout)
  const h = mLen(size.h, layout)
  const draggable = interactive && !obj.locked

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      rotation={obj.rotation ?? 0}
      offsetX={w / 2}
      offsetY={h / 2}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      <Rect
        width={w}
        height={h}
        fill="#ffffff"
        stroke={selected ? SEL_COLOR : '#222222'}
        strokeWidth={selected ? SEL_WIDTH : 2}
      />
    </Group>
  )
}

// ── PlayerNode ────────────────────────────────────────────────────────────────
type PlayerObj = Extract<BoardObject, { type: 'player' }>

export function PlayerNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
}: NodeProps<PlayerObj>) {
  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(1.2, layout)
  const label =
    obj.number != null ? String(obj.number) : (obj.position ?? '')
  const draggable = interactive && !obj.locked

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      x={x}
      y={y}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      <Circle
        radius={radius}
        fill={PLAYER_COLORS[obj.role] ?? '#9CA3AF'}
        stroke={selected ? SEL_COLOR : '#ffffff'}
        strokeWidth={selected ? SEL_WIDTH : 2}
      />
      {label !== '' && (
        <Text
          text={label}
          x={-radius}
          y={-radius}
          width={radius * 2}
          height={radius * 2}
          align="center"
          verticalAlign="middle"
          fill="#ffffff"
          fontSize={Math.max(8, radius * 0.9)}
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  )
}

// ── ArrowNode ─────────────────────────────────────────────────────────────────
type ArrowObj = Extract<BoardObject, { type: 'arrow' }>

export function ArrowNode({
  obj,
  field,
  layout,
  selected,
  interactive,
  onSelect,
  onContextMenu,
}: NodeProps<ArrowObj>) {
  if (obj.hidden) return null
  const pxPoints: number[] = []
  for (let i = 0; i < obj.points.length - 1; i += 2) {
    const { x, y } = mToPx(obj.points[i], obj.points[i + 1], field, layout)
    pxPoints.push(x, y)
  }

  const arrowStyle = ARROW_STYLES[obj.style] ?? ARROW_STYLES['pass']
  const strokeWidth = obj.thickness ?? 3
  const stroke = selected ? SEL_COLOR : arrowStyle.stroke
  const fill = selected ? SEL_COLOR : arrowStyle.fill

  return (
    <Arrow
      points={pxPoints}
      stroke={stroke}
      fill={fill}
      strokeWidth={strokeWidth}
      dash={arrowStyle.dash}
      pointerLength={10}
      pointerWidth={10}
      listening={interactive}
      onClick={
        interactive
          ? (e: Konva.KonvaEventObject<MouseEvent>) =>
              onSelect?.(obj.id, e.evt.shiftKey)
          : undefined
      }
      onContextMenu={
        interactive && onContextMenu
          ? (e: Konva.KonvaEventObject<PointerEvent>) => {
              e.evt.preventDefault()
              onContextMenu(obj.id, e.evt.clientX, e.evt.clientY)
            }
          : undefined
      }
    />
  )
}

// ─── Main field renderer ──────────────────────────────────────────────────────

export interface PreviewArrow {
  tail: { x: number; y: number } // field-meter coords
  head: { x: number; y: number } // field-meter coords
  style: string
}

export interface MarqueeRect {
  x: number; y: number; width: number; height: number
}

export interface AlignmentGuide {
  // stage-pixel coordinates for a single line
  points: [number, number, number, number]
}

export interface FieldRendererProps {
  field: Field
  objects: BoardObject[]
  width: number
  height: number
  interactive?: boolean
  selectedIds?: string[]
  onSelect?: (id: string | null, additive: boolean) => void
  onDragEnd?: (id: string, x: number, y: number) => void
  onDoubleClick?: (id: string) => void
  onContextMenu?: (id: string, clientX: number, clientY: number) => void
  stageRef?: React.MutableRefObject<Konva.Stage | null>
  previewArrow?: PreviewArrow
  marquee?: MarqueeRect | null
  alignmentGuides?: AlignmentGuide[]
}

export default function FieldRenderer({
  field,
  objects,
  width,
  height,
  interactive = false,
  selectedIds = [],
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
  stageRef,
  previewArrow,
  marquee,
  alignmentGuides = [],
}: FieldRendererProps): React.JSX.Element {
  const layout = useFieldLayout(field, width, height)
  const selectedSet = new Set(selectedIds)

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!interactive) return
    // Only fire if user clicked on the stage background (not a child shape)
    if (e.target === e.currentTarget) {
      onSelect?.(null, false)
    }
  }

  function renderObject(obj: BoardObject) {
    const selected = selectedSet.has(obj.id)
    const commonProps = {
      obj,
      field,
      layout,
      selected,
      interactive,
      onSelect: interactive ? (id: string, additive: boolean) => onSelect?.(id, additive) : undefined,
      onDragEnd: interactive ? onDragEnd : undefined,
      onDoubleClick: interactive ? onDoubleClick : undefined,
      onContextMenu: interactive ? onContextMenu : undefined,
    }

    switch (obj.type) {
      case 'zone':
        return <ZoneNode key={obj.id} {...commonProps} obj={obj} />
      case 'zone-line':
        return <ZoneLineNode key={obj.id} {...commonProps} obj={obj} />
      case 'cone':
        return <ConeNode key={obj.id} {...commonProps} obj={obj} />
      case 'ball':
        return <BallNode key={obj.id} {...commonProps} obj={obj} />
      case 'goal':
        return <GoalNode key={obj.id} {...commonProps} obj={obj} />
      case 'player':
        return <PlayerNode key={obj.id} {...commonProps} obj={obj} />
      case 'arrow':
        return <ArrowNode key={obj.id} {...commonProps} obj={obj} />
      default:
        return null
    }
  }

  // Compute preview arrow pixel points if present
  let previewPxPoints: number[] | null = null
  let previewStroke = '#ffffff'
  if (previewArrow) {
    const tail = mToPx(previewArrow.tail.x, previewArrow.tail.y, field, layout)
    const head = mToPx(previewArrow.head.x, previewArrow.head.y, field, layout)
    previewPxPoints = [tail.x, tail.y, head.x, head.y]
    const arrowStyle = ARROW_STYLES[previewArrow.style] ?? ARROW_STYLES['pass']
    previewStroke = arrowStyle.stroke
  }

  const hasOverlay = previewPxPoints || marquee || alignmentGuides.length > 0

  return (
    <Stage
      width={width}
      height={height}
      ref={stageRef}
      onClick={interactive ? handleStageClick : undefined}
    >
      {/* Layer 1: field background + markings */}
      <Layer listening={false}>
        <FieldMarkings field={field} layout={layout} style={field.style} />
      </Layer>

      {/* Layer 2: objects */}
      <Layer listening={interactive}>
        {objects.map(renderObject)}
      </Layer>

      {/* Layer 3: preview overlay (non-interactive) */}
      {hasOverlay && (
        <Layer listening={false}>
          {previewPxPoints && (
            <Line
              points={previewPxPoints}
              stroke={previewStroke}
              strokeWidth={2}
              dash={[8, 5]}
              opacity={0.7}
              listening={false}
            />
          )}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(147,51,234,0.1)"
              stroke="#9333EA"
              strokeWidth={1}
              dash={[5, 3]}
              listening={false}
            />
          )}
          {alignmentGuides.map((g, i) => (
            <Line
              key={i}
              points={g.points}
              stroke="#9333EA"
              strokeWidth={1}
              dash={[6, 4]}
              opacity={0.8}
              listening={false}
            />
          ))}
        </Layer>
      )}
    </Stage>
  )
}
