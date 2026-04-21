'use client'

import React from 'react'
import Konva from 'konva'
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Ellipse,
  Line,
  Text,
  Group,
  RegularPolygon,
  Arrow,
  Arc,
  Path,
} from 'react-konva'
import type { BoardObject, Field } from '@/lib/tactics/object-schema'
import { FieldMarkings, NetPattern } from './field-markings'
import {
  useFieldLayout as _useFieldLayout,
  mToPx,
  pxToM as _pxToM,
  mLen,
  type FieldLayout,
} from './field-renderer-layout'

// Re-export layout helpers so existing imports `from '@/lib/tactics/field-renderer'` keep working.
export const useFieldLayout = _useFieldLayout
export const pxToM = _pxToM
export type { FieldLayout }
export { FieldMarkings }

// ─── Color maps ──────────────────────────────────────────────────────────────

// Field backgrounds — kept for external consumers. Actual render uses a gradient.
export const FIELD_BG = {
  schematic: '#2d6e42',
  realistic: '#2d6e42',
} as const

// Gradients for player tokens — `top` is the light (upper) color, `bottom` is
// the darker shade used at the bottom of the fill. Builds a subtle 3D look.
export interface TokenGradient { top: string; bottom: string }

export const PLAYER_GRADIENTS: Record<string, TokenGradient> = {
  red:     { top: '#ef4557', bottom: '#c62032' },
  blue:    { top: '#3b82f6', bottom: '#1e40af' },
  neutral: { top: '#a1a1aa', bottom: '#71717a' },
  outside: { top: '#9ca3af', bottom: '#4b5563' },
  gk:      { top: '#fde047', bottom: '#eab308' },
  coach:   { top: '#374151', bottom: '#111111' },
}

// Flat fallback colors — kept as the `PLAYER_COLORS` public export for any
// consumers (palette swatches etc.) that still read a single color.
export const PLAYER_COLORS: Record<string, string> = {
  red:     PLAYER_GRADIENTS.red.bottom,
  blue:    PLAYER_GRADIENTS.blue.bottom,
  neutral: PLAYER_GRADIENTS.neutral.bottom,
  outside: PLAYER_GRADIENTS.outside.bottom,
  gk:      PLAYER_GRADIENTS.gk.bottom,
  coach:   PLAYER_GRADIENTS.coach.bottom,
}

export const CONE_GRADIENTS: Record<string, TokenGradient> = {
  orange: { top: '#ffb366', bottom: '#e06a00' },
  yellow: { top: '#ffe066', bottom: '#e6b800' },
  red:    { top: '#ef4557', bottom: '#b8192b' },
  blue:   { top: '#60a5fa', bottom: '#1e40af' },
  white:  { top: '#ffffff', bottom: '#cbd5e1' },
}

export const CONE_COLORS: Record<string, string> = {
  orange: CONE_GRADIENTS.orange.bottom,
  yellow: CONE_GRADIENTS.yellow.bottom,
  red:    CONE_GRADIENTS.red.bottom,
  blue:   CONE_GRADIENTS.blue.bottom,
  white:  CONE_GRADIENTS.white.bottom,
}

export const ARROW_STYLES: Record<
  string,
  { stroke: string; fill: string; dash?: number[]; curved?: boolean }
> = {
  pass: { stroke: '#ef4557', fill: '#ef4557' },
  run:  { stroke: '#3b82f6', fill: '#3b82f6', dash: [10, 6], curved: true },
  free: { stroke: '#fde047', fill: '#fde047' },
}

// Selection glow / ring
const SEL_COLOR = '#00FF87'
const SEL_GLOW_BLUR = 14

// ─── Fade-in + drag-feedback hooks ──────────────────────────────────────────

type KonvaRef = React.RefObject<Konva.Node | null>

// Attaches a one-shot Konva fade-in tween on mount. Group starts at opacity 0
// and tweens to 1 over ~180ms for a polished placement/load feel.
function useFadeInOnMount(ref: KonvaRef) {
  const didRun = React.useRef(false)
  React.useEffect(() => {
    if (didRun.current) return
    didRun.current = true
    const node = ref.current
    if (!node) return
    node.opacity(0)
    node.to({ opacity: 1, duration: 0.18, easing: Konva.Easings.EaseOut })
  }, [ref])
}

// Scale-up on drag start, scale back on drag end. Uses Konva tweens so the
// animation runs smoothly without tearing react render.
function useDragScale(ref: KonvaRef, scaleUp: number = 1.05) {
  const handlers = React.useMemo(() => ({
    onDragStart: () => {
      const node = ref.current
      if (!node) return
      node.moveToTop()
      node.to({ scaleX: scaleUp, scaleY: scaleUp, duration: 0.12, easing: Konva.Easings.EaseOut })
    },
    onDragEnd: () => {
      const node = ref.current
      if (!node) return
      node.to({ scaleX: 1, scaleY: 1, duration: 0.14, easing: Konva.Easings.EaseOut })
    },
  }), [ref, scaleUp])
  return handlers
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
  const groupRef = React.useRef<Konva.Group | null>(null)
  useFadeInOnMount(groupRef as KonvaRef)
  const dragScale = useDragScale(groupRef as KonvaRef, 1.03)

  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
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
        onDragStart: dragScale.onDragStart,
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          dragScale.onDragEnd()
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      ref={groupRef}
      x={x}
      y={y}
      draggable={draggable}
      {...handlers}
    >
      {selected && (
        <Rect
          x={-3}
          y={-3}
          width={w + 6}
          height={h + 6}
          stroke={SEL_COLOR}
          strokeWidth={2}
          shadowColor={SEL_COLOR}
          shadowBlur={SEL_GLOW_BLUR}
          shadowOpacity={0.7}
          listening={false}
        />
      )}
      <Rect
        width={w}
        height={h}
        fill={obj.color}
        opacity={obj.opacity}
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
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={Math.max(10, mLen(1.5, layout)) * (obj.scale ?? 1)}
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
      strokeWidth={2 * (obj.scale ?? 1)}
      dash={[8, 6]}
      lineCap="round"
      shadowColor={selected ? SEL_COLOR : undefined}
      shadowBlur={selected ? SEL_GLOW_BLUR : 0}
      shadowOpacity={selected ? 0.6 : 0}
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
  const groupRef = React.useRef<Konva.Group | null>(null)
  useFadeInOnMount(groupRef as KonvaRef)
  const dragScale = useDragScale(groupRef as KonvaRef)

  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(0.8, layout) * (obj.scale ?? 1)
  const draggable = interactive && !obj.locked

  const grad = CONE_GRADIENTS[obj.color] ?? { top: '#ffb366', bottom: '#e06a00' }

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragStart: dragScale.onDragStart,
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          dragScale.onDragEnd()
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      ref={groupRef}
      x={x}
      y={y}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      {/* Base shadow (subtle ellipse under cone) */}
      <Ellipse
        radiusX={radius * 0.75}
        radiusY={radius * 0.22}
        y={radius * 0.85}
        fill="rgba(0,0,0,0.3)"
        listening={false}
      />
      {/* Selection glow behind the cone */}
      {selected && (
        <RegularPolygon
          sides={3}
          radius={radius * 1.25}
          stroke={SEL_COLOR}
          strokeWidth={2}
          shadowColor={SEL_COLOR}
          shadowBlur={SEL_GLOW_BLUR}
          shadowOpacity={0.8}
          listening={false}
        />
      )}
      {/* Cone body (gradient) */}
      <RegularPolygon
        sides={3}
        radius={radius}
        fillLinearGradientStartPoint={{ x: 0, y: -radius }}
        fillLinearGradientEndPoint={{ x: 0, y: radius }}
        fillLinearGradientColorStops={[0, grad.top, 1, grad.bottom]}
        stroke="#00000055"
        strokeWidth={0.75}
        shadowColor="rgba(0,0,0,0.45)"
        shadowBlur={4}
        shadowOffsetY={2}
        shadowOpacity={0.6}
      />
      {/* Highlight streak — thin line on upper-right edge */}
      <Line
        points={[-radius * 0.15, -radius * 0.55, radius * 0.35, radius * 0.1]}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1}
        lineCap="round"
        listening={false}
      />
    </Group>
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
  const groupRef = React.useRef<Konva.Group | null>(null)
  useFadeInOnMount(groupRef as KonvaRef)
  const dragScale = useDragScale(groupRef as KonvaRef)

  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(0.4, layout) * (obj.scale ?? 1)
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
        onDragStart: dragScale.onDragStart,
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          dragScale.onDragEnd()
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  const centerPentR = radius * 0.32
  const satPentR = radius * 0.2
  const satDist = radius * 0.58

  return (
    <Group
      id={obj.id}
      ref={groupRef}
      x={x}
      y={y}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      {selected && (
        <Circle
          radius={radius * 1.35}
          stroke={SEL_COLOR}
          strokeWidth={2}
          shadowColor={SEL_COLOR}
          shadowBlur={SEL_GLOW_BLUR}
          shadowOpacity={0.8}
          listening={false}
        />
      )}
      <Circle
        radius={radius}
        fillRadialGradientStartPoint={{ x: -radius * 0.3, y: -radius * 0.3 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={radius}
        fillRadialGradientColorStops={[0, '#ffffff', 1, '#d8d8d8']}
        stroke="#1a1a1a"
        strokeWidth={0.75}
        shadowColor="rgba(0,0,0,0.45)"
        shadowBlur={4}
        shadowOffsetY={2}
        shadowOpacity={0.6}
      />
      <RegularPolygon
        sides={5}
        radius={centerPentR}
        fill="#1a1a1a"
        listening={false}
      />
      {[0, 1, 2, 3, 4].map(i => {
        const a = (i * 72 - 90) * (Math.PI / 180)
        return (
          <RegularPolygon
            key={`pent-${i}`}
            sides={5}
            radius={satPentR}
            x={Math.cos(a) * satDist}
            y={Math.sin(a) * satDist}
            rotation={i * 72 + 180}
            fill="#1a1a1a"
            listening={false}
          />
        )
      })}
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
  const groupRef = React.useRef<Konva.Group | null>(null)
  useFadeInOnMount(groupRef as KonvaRef)
  const dragScale = useDragScale(groupRef as KonvaRef, 1.04)

  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const size = GOAL_SIZES[obj.variant] ?? GOAL_SIZES['full']
  const scaleFactor = obj.scale ?? 1
  const w = mLen(size.w, layout) * scaleFactor
  const h = mLen(size.h, layout) * scaleFactor
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
        onDragStart: dragScale.onDragStart,
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          dragScale.onDragEnd()
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  const postThickness = Math.max(2, Math.min(w, h) * 0.08)

  return (
    <Group
      id={obj.id}
      ref={groupRef}
      x={x}
      y={y}
      rotation={obj.rotation ?? 0}
      offsetX={w / 2}
      offsetY={h / 2}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      {selected && (
        <Rect
          x={-3}
          y={-3}
          width={w + 6}
          height={h + 6}
          stroke={SEL_COLOR}
          strokeWidth={2}
          shadowColor={SEL_COLOR}
          shadowBlur={SEL_GLOW_BLUR}
          shadowOpacity={0.7}
          listening={false}
        />
      )}
      <Rect
        width={w}
        height={h}
        fill="#ffffff"
        opacity={0.85}
      />
      <NetPattern x={0} y={0} w={w} h={h} />
      <Rect x={0}                  y={0} width={postThickness} height={h} fill="#1a1a1a" />
      <Rect x={w - postThickness} y={0} width={postThickness} height={h} fill="#1a1a1a" />
      <Rect x={0}                  y={0} width={w}             height={postThickness} fill="#1a1a1a" />
      <Rect
        width={w}
        height={h}
        stroke="#222222"
        strokeWidth={0.75}
        listening={false}
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
  const groupRef = React.useRef<Konva.Group | null>(null)
  useFadeInOnMount(groupRef as KonvaRef)
  const dragScale = useDragScale(groupRef as KonvaRef, 1.08)

  if (obj.hidden) return null
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(1.2, layout) * (obj.scale ?? 1)
  const label =
    obj.number != null ? String(obj.number) : (obj.position ?? '')
  const draggable = interactive && !obj.locked

  const grad = PLAYER_GRADIENTS[obj.role] ?? PLAYER_GRADIENTS.neutral
  const ringColor = obj.role === 'coach' ? '#f5f5f0' : '#ffffff'

  const handlers = interactive
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey),
        onDblClick: () => onDoubleClick?.(obj.id),
        onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
          e.evt.preventDefault()
          onContextMenu?.(obj.id, e.evt.clientX, e.evt.clientY)
        },
        onDragStart: dragScale.onDragStart,
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          dragScale.onDragEnd()
          const node = e.target
          const { xM, yM } = pxToM(node.x(), node.y(), field, layout)
          onDragEnd?.(obj.id, xM, yM)
        },
      }
    : {}

  return (
    <Group
      id={obj.id}
      ref={groupRef}
      x={x}
      y={y}
      draggable={draggable}
      listening={interactive}
      {...handlers}
    >
      {selected && (
        <Circle
          radius={radius + 3}
          stroke={SEL_COLOR}
          strokeWidth={2.5}
          shadowColor={SEL_COLOR}
          shadowBlur={SEL_GLOW_BLUR}
          shadowOpacity={0.9}
          listening={false}
        />
      )}
      <Circle
        radius={radius}
        fillLinearGradientStartPoint={{ x: 0, y: -radius }}
        fillLinearGradientEndPoint={{ x: 0, y: radius }}
        fillLinearGradientColorStops={[0, grad.top, 1, grad.bottom]}
        stroke={ringColor}
        strokeWidth={Math.max(1.5, radius * 0.12)}
        shadowColor="rgba(0,0,0,0.5)"
        shadowBlur={3}
        shadowOffsetX={0}
        shadowOffsetY={2}
        shadowOpacity={0.8}
      />
      <Arc
        innerRadius={radius * 0.88}
        outerRadius={radius * 0.95}
        angle={180}
        rotation={180}
        fill="rgba(255,255,255,0.35)"
        listening={false}
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
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={0.5}
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={Math.max(9, radius * 0.95)}
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  )
}

// ── ArrowNode ─────────────────────────────────────────────────────────────────
type ArrowObj = Extract<BoardObject, { type: 'arrow' }>

// Quadratic-bezier path between two points with a perpendicular offset mid-control.
function buildCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const off = len * 0.08
  const cx = mx + (-dy / len) * off
  const cy = my + (dx / len) * off
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

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
  const scaleFactor = obj.scale ?? 1
  const strokeWidth = (obj.thickness ?? 3.5) * scaleFactor
  const stroke = selected ? SEL_COLOR : arrowStyle.stroke
  const fill = selected ? SEL_COLOR : arrowStyle.fill

  const commonHandlers = {
    onClick: interactive
      ? (e: Konva.KonvaEventObject<MouseEvent>) =>
          onSelect?.(obj.id, e.evt.shiftKey)
      : undefined,
    onContextMenu:
      interactive && onContextMenu
        ? (e: Konva.KonvaEventObject<PointerEvent>) => {
            e.evt.preventDefault()
            onContextMenu(obj.id, e.evt.clientX, e.evt.clientY)
          }
        : undefined,
  }

  if (arrowStyle.curved && pxPoints.length >= 4) {
    const x1 = pxPoints[0], y1 = pxPoints[1]
    const x2 = pxPoints[pxPoints.length - 2]
    const y2 = pxPoints[pxPoints.length - 1]
    const data = buildCurvedPath(x1, y1, x2, y2)
    const headLen = 12 * scaleFactor
    const headWidth = 11 * scaleFactor
    return (
      <>
        <Path
          data={data}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={arrowStyle.dash}
          lineCap="round"
          lineJoin="round"
          fill={undefined}
          shadowColor={selected ? SEL_COLOR : undefined}
          shadowBlur={selected ? SEL_GLOW_BLUR : 0}
          shadowOpacity={selected ? 0.7 : 0}
          listening={interactive}
          {...commonHandlers}
        />
        <Arrow
          points={[
            x2 - (x2 - x1) * 0.02,
            y2 - (y2 - y1) * 0.02,
            x2,
            y2,
          ]}
          stroke={stroke}
          fill={fill}
          strokeWidth={strokeWidth}
          pointerLength={headLen}
          pointerWidth={headWidth}
          listening={false}
        />
      </>
    )
  }

  return (
    <Arrow
      points={pxPoints}
      stroke={stroke}
      fill={fill}
      strokeWidth={strokeWidth}
      dash={arrowStyle.dash}
      lineCap="round"
      lineJoin="round"
      pointerLength={12 * scaleFactor}
      pointerWidth={11 * scaleFactor}
      shadowColor={selected ? SEL_COLOR : undefined}
      shadowBlur={selected ? SEL_GLOW_BLUR : 0}
      shadowOpacity={selected ? 0.7 : 0}
      listening={interactive}
      {...commonHandlers}
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
  points: [number, number, number, number]
}

export interface FieldRendererProps {
  field: Field
  objects: BoardObject[]
  width: number
  height: number
  interactive?: boolean
  selectedIds?: string[]
  hiddenIds?: string[]
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
  hiddenIds = [],
  onSelect,
  onDragEnd,
  onDoubleClick,
  onContextMenu,
  stageRef,
  previewArrow,
  marquee,
  alignmentGuides = [],
}: FieldRendererProps): React.JSX.Element {
  const layout = _useFieldLayout(field, width, height)
  const selectedSet = new Set(selectedIds)
  const hiddenSet = new Set(hiddenIds)

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!interactive) return
    if (e.target === e.currentTarget) {
      onSelect?.(null, false)
    }
  }

  function renderObject(obj: BoardObject) {
    if (hiddenSet.has(obj.id)) return null
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
              lineCap="round"
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
