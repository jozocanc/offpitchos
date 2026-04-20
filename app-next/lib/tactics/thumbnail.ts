import 'server-only'
import { createCanvas } from '@napi-rs/canvas'
import type { SKRSContext2D } from '@napi-rs/canvas'
import type { BoardObject, Field } from './object-schema'

// ─── Color maps (mirrors field-renderer.tsx) ──────────────────────────────────

const FIELD_BG: Record<string, string> = {
  schematic: '#0A6B3C',
  realistic: '#2B7A3F',
}

const PLAYER_COLORS: Record<string, string> = {
  red: '#E63946',
  blue: '#2C7BE5',
  neutral: '#9CA3AF',
  outside: '#6B7280',
  gk: '#FFD500',
  coach: '#111111',
}

const CONE_COLORS: Record<string, string> = {
  orange: '#FF8C00',
  yellow: '#FFD500',
  red: '#E63946',
  blue: '#2C7BE5',
  white: '#F3F4F6',
}

const ARROW_STYLES: Record<string, { stroke: string; dash?: number[] }> = {
  pass: { stroke: '#E63946' },
  run: { stroke: '#2C7BE5', dash: [10, 6] },
  free: { stroke: '#FFD500' },
}

// ─── Goal sizes (meters) ──────────────────────────────────────────────────────

const GOAL_SIZES: Record<string, { w: number; h: number }> = {
  'mini-h': { w: 3, h: 1 },
  'mini-v': { w: 1, h: 3 },
  full: { w: 7.32, h: 2.44 },
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const MARGIN = 20

interface FieldLayout {
  pxPerMeter: number
  fieldPxX: number
  fieldPxY: number
  fieldPxW: number
  fieldPxH: number
}

function computeLayout(field: Field, W: number, H: number): FieldLayout {
  const availW = W - MARGIN * 2
  const availH = H - MARGIN * 2

  const mW = field.orientation === 'horizontal' ? field.length_m : field.width_m
  const mH = field.orientation === 'horizontal' ? field.width_m : field.length_m

  const pxPerMeter = Math.min(availW / mW, availH / mH)

  const fieldPxW = mW * pxPerMeter
  const fieldPxH = mH * pxPerMeter

  const fieldPxX = (W - fieldPxW) / 2
  const fieldPxY = (H - fieldPxH) / 2

  return { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH }
}

function mToPx(xM: number, yM: number, layout: FieldLayout) {
  return {
    x: layout.fieldPxX + xM * layout.pxPerMeter,
    y: layout.fieldPxY + yM * layout.pxPerMeter,
  }
}

function mLen(meters: number, layout: FieldLayout) {
  return meters * layout.pxPerMeter
}

// ─── Field drawing ────────────────────────────────────────────────────────────

function drawField(ctx: SKRSContext2D, field: Field, W: number, H: number) {
  const layout = computeLayout(field, W, H)
  const { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH } = layout
  const isH = field.orientation === 'horizontal'
  const half = field.half_field

  const lengthPx = field.length_m * pxPerMeter
  const widthPx = field.width_m * pxPerMeter

  // Field background
  ctx.fillStyle = FIELD_BG[field.style] ?? '#0A6B3C'
  ctx.fillRect(fieldPxX, fieldPxY, fieldPxW, fieldPxH)

  // Realistic grass stripes
  if (field.style === 'realistic') {
    const stripeStep = 5 * pxPerMeter
    const stripeCount = Math.ceil((isH ? fieldPxW : fieldPxH) / stripeStep)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    for (let i = 1; i < stripeCount; i += 2) {
      if (isH) {
        ctx.fillRect(fieldPxX + i * stripeStep, fieldPxY, stripeStep, fieldPxH)
      } else {
        ctx.fillRect(fieldPxX, fieldPxY + i * stripeStep, fieldPxW, stripeStep)
      }
    }
  }

  // Outline
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.setLineDash([])
  ctx.strokeRect(fieldPxX, fieldPxY, fieldPxW, fieldPxH)

  // Center line (full-field only)
  if (!half) {
    ctx.beginPath()
    if (isH) {
      ctx.moveTo(fieldPxX + lengthPx / 2, fieldPxY)
      ctx.lineTo(fieldPxX + lengthPx / 2, fieldPxY + widthPx)
    } else {
      ctx.moveTo(fieldPxX, fieldPxY + lengthPx / 2)
      ctx.lineTo(fieldPxX + widthPx, fieldPxY + lengthPx / 2)
    }
    ctx.stroke()
  }

  // Center circle (full-field only)
  if (!half) {
    const centerCircleR = 9.15 * pxPerMeter
    const cx = isH ? fieldPxX + lengthPx / 2 : fieldPxX + widthPx / 2
    const cy = isH ? fieldPxY + widthPx / 2 : fieldPxY + lengthPx / 2
    ctx.beginPath()
    ctx.arc(cx, cy, centerCircleR, 0, Math.PI * 2)
    ctx.stroke()
  }

  const penaltyDepth = 16.5 * pxPerMeter
  const penaltyWidth = 40.3 * pxPerMeter
  const goalAreaDepth = 5.5 * pxPerMeter
  const goalAreaWidth = 18.3 * pxPerMeter
  const goalPostWidth = 7.32 * pxPerMeter
  const goalPostDepth = 0.5 * pxPerMeter

  const ends = half ? [1] : [0, 1]

  for (const end of ends) {
    if (isH) {
      // Penalty box
      const boxX = end === 0 ? fieldPxX : fieldPxX + lengthPx - penaltyDepth
      const boxY = fieldPxY + (widthPx - penaltyWidth) / 2
      ctx.strokeRect(boxX, boxY, penaltyDepth, penaltyWidth)

      // Goal area
      const gaX = end === 0 ? fieldPxX : fieldPxX + lengthPx - goalAreaDepth
      const gaY = fieldPxY + (widthPx - goalAreaWidth) / 2
      ctx.strokeRect(gaX, gaY, goalAreaDepth, goalAreaWidth)

      // Goal posts
      const gX = end === 0 ? fieldPxX - goalPostDepth : fieldPxX + lengthPx
      const gY = fieldPxY + (widthPx - goalPostWidth) / 2
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(gX, gY, goalPostDepth, goalPostWidth)
    } else {
      // Penalty box
      const boxY = end === 0 ? fieldPxY : fieldPxY + lengthPx - penaltyDepth
      const boxX = fieldPxX + (widthPx - penaltyWidth) / 2
      ctx.strokeRect(boxX, boxY, penaltyWidth, penaltyDepth)

      // Goal area
      const gaY = end === 0 ? fieldPxY : fieldPxY + lengthPx - goalAreaDepth
      const gaX = fieldPxX + (widthPx - goalAreaWidth) / 2
      ctx.strokeRect(gaX, gaY, goalAreaWidth, goalAreaDepth)

      // Goal posts
      const gY = end === 0 ? fieldPxY - goalPostDepth : fieldPxY + lengthPx
      const gX = fieldPxX + (widthPx - goalPostWidth) / 2
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(gX, gY, goalPostWidth, goalPostDepth)
    }
  }
}

// ─── Object drawing ───────────────────────────────────────────────────────────

function drawObjects(ctx: SKRSContext2D, field: Field, objects: BoardObject[], W: number, H: number) {
  const layout = computeLayout(field, W, H)

  for (const obj of objects) {
    if (obj.hidden) continue

    switch (obj.type) {
      case 'zone':
        drawZone(ctx, obj, layout)
        break
      case 'zone-line':
        drawZoneLine(ctx, obj, layout)
        break
      case 'cone':
        drawCone(ctx, obj, layout)
        break
      case 'goal':
        drawGoal(ctx, obj, layout)
        break
      case 'ball':
        drawBall(ctx, obj, layout)
        break
      case 'player':
        drawPlayer(ctx, obj, layout)
        break
      case 'arrow':
        drawArrow(ctx, obj, layout)
        break
    }
  }
}

type ZoneObj = Extract<BoardObject, { type: 'zone' }>
function drawZone(ctx: SKRSContext2D, obj: ZoneObj, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, layout)
  const w = mLen(obj.width, layout)
  const h = mLen(obj.height, layout)
  ctx.save()
  ctx.globalAlpha = obj.opacity
  ctx.fillStyle = obj.color
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
  ctx.setLineDash([])
  ctx.strokeStyle = obj.color
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
  if (obj.label) {
    const fontSize = Math.max(10, mLen(1.5, layout))
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = '#000000'
    ctx.shadowBlur = 3
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(obj.label, x + w / 2, y + h / 2)
    ctx.shadowBlur = 0
  }
  ctx.restore()
}

type ZoneLineObj = Extract<BoardObject, { type: 'zone-line' }>
function drawZoneLine(ctx: SKRSContext2D, obj: ZoneLineObj, layout: FieldLayout) {
  const p0 = mToPx(obj.points[0], obj.points[1], layout)
  const p1 = mToPx(obj.points[2], obj.points[3], layout)
  ctx.save()
  ctx.strokeStyle = obj.color
  ctx.lineWidth = 2
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  ctx.lineTo(p1.x, p1.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

type ConeObj = Extract<BoardObject, { type: 'cone' }>
function drawCone(ctx: SKRSContext2D, obj: ConeObj, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, layout)
  const radius = mLen(0.8, layout)
  const fill = CONE_COLORS[obj.color] ?? obj.color
  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = '#00000044'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  // Equilateral triangle (RegularPolygon with 3 sides)
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2
    const px = x + radius * Math.cos(angle)
    const py = y + radius * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

type GoalObj = Extract<BoardObject, { type: 'goal' }>
function drawGoal(ctx: SKRSContext2D, obj: GoalObj, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, layout)
  const size = GOAL_SIZES[obj.variant] ?? GOAL_SIZES['full']
  const w = mLen(size.w, layout)
  const h = mLen(size.h, layout)
  const rotation = (obj.rotation ?? 0) * (Math.PI / 180)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#222222'
  ctx.lineWidth = 2
  ctx.setLineDash([])
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

type BallObj = Extract<BoardObject, { type: 'ball' }>
function drawBall(ctx: SKRSContext2D, obj: BallObj, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, layout)
  const radius = mLen(0.4, layout)
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // Center dot
  ctx.fillStyle = '#111111'
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

type PlayerObj = Extract<BoardObject, { type: 'player' }>
function drawPlayer(ctx: SKRSContext2D, obj: PlayerObj, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, layout)
  const radius = mLen(1.2, layout)
  const fill = PLAYER_COLORS[obj.role] ?? '#9CA3AF'
  const label = obj.number != null ? String(obj.number) : (obj.position ?? '')
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = fill
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  if (label !== '') {
    const fontSize = Math.max(8, radius * 0.9)
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }
  ctx.restore()
}

type ArrowObj = Extract<BoardObject, { type: 'arrow' }>
function drawArrow(ctx: SKRSContext2D, obj: ArrowObj, layout: FieldLayout) {
  if (obj.points.length < 4) return

  const pxPoints: Array<{ x: number; y: number }> = []
  for (let i = 0; i < obj.points.length - 1; i += 2) {
    pxPoints.push(mToPx(obj.points[i], obj.points[i + 1], layout))
  }
  if (pxPoints.length < 2) return

  const style = ARROW_STYLES[obj.style] ?? ARROW_STYLES['pass']
  const strokeWidth = obj.thickness ?? 3

  ctx.save()
  ctx.strokeStyle = style.stroke
  ctx.fillStyle = style.stroke
  ctx.lineWidth = strokeWidth
  ctx.setLineDash(style.dash ?? [])

  ctx.beginPath()
  ctx.moveTo(pxPoints[0].x, pxPoints[0].y)
  for (let i = 1; i < pxPoints.length; i++) {
    ctx.lineTo(pxPoints[i].x, pxPoints[i].y)
  }
  ctx.stroke()

  // Arrowhead at tip
  const last = pxPoints[pxPoints.length - 1]
  const prev = pxPoints[pxPoints.length - 2]
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
  const headLen = 10
  const headAngle = Math.PI / 6

  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(
    last.x - headLen * Math.cos(angle - headAngle),
    last.y - headLen * Math.sin(angle - headAngle),
  )
  ctx.lineTo(
    last.x - headLen * Math.cos(angle + headAngle),
    last.y - headLen * Math.sin(angle + headAngle),
  )
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function renderThumbnailPng(field: Field, objects: BoardObject[]): Promise<Buffer> {
  const W = 640, H = 400
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  drawField(ctx, field, W, H)
  drawObjects(ctx, field, objects, W, H)
  return canvas.toBuffer('image/png')
}
