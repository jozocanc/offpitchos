import 'server-only'
import { createCanvas } from '@napi-rs/canvas'
import type { SKRSContext2D } from '@napi-rs/canvas'
import type { BoardObject, Field } from './object-schema'

// ─── Color maps (mirrors field-renderer.tsx) ──────────────────────────────────

const FIELD_GRADIENT: Record<string, { top: string; bottom: string }> = {
  schematic: { top: '#2d6e42', bottom: '#2d6e42' },
  realistic: { top: '#2d6e42', bottom: '#1f5a36' },
}

const MARK_LINE = '#f5f5f0'
const MARK_SHADOW = '#123823'

const PLAYER_GRADIENTS: Record<string, { top: string; bottom: string }> = {
  red:     { top: '#ef4557', bottom: '#c62032' },
  blue:    { top: '#3b82f6', bottom: '#1e40af' },
  neutral: { top: '#a1a1aa', bottom: '#71717a' },
  outside: { top: '#9ca3af', bottom: '#4b5563' },
  gk:      { top: '#fde047', bottom: '#eab308' },
  coach:   { top: '#374151', bottom: '#111111' },
}

const CONE_GRADIENTS: Record<string, { top: string; bottom: string }> = {
  orange: { top: '#ffb366', bottom: '#e06a00' },
  yellow: { top: '#ffe066', bottom: '#e6b800' },
  red:    { top: '#ef4557', bottom: '#b8192b' },
  blue:   { top: '#60a5fa', bottom: '#1e40af' },
  white:  { top: '#ffffff', bottom: '#cbd5e1' },
}

const ARROW_STYLES: Record<string, { stroke: string; dash?: number[]; curved?: boolean }> = {
  pass: { stroke: '#ef4557' },
  run:  { stroke: '#3b82f6', dash: [10, 6], curved: true },
  free: { stroke: '#fde047' },
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

function mLen(meters: number, layout: FieldLayout) {
  return meters * layout.pxPerMeter
}

// ─── Line helper: dark-green shadow under off-white main stroke ──────────────

function strokeMarking(
  ctx: SKRSContext2D,
  path: () => void,
) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Shadow underlay
  ctx.strokeStyle = MARK_SHADOW
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 2.5
  path()
  ctx.stroke()
  // Main line
  ctx.globalAlpha = 1
  ctx.strokeStyle = MARK_LINE
  ctx.lineWidth = 1.5
  path()
  ctx.stroke()
  ctx.restore()
}

// ─── Field drawing ────────────────────────────────────────────────────────────

function drawField(ctx: SKRSContext2D, field: Field, W: number, H: number) {
  const layout = computeLayout(field, W, H)
  const { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH } = layout
  const isH = field.orientation === 'horizontal'
  const half = field.half_field

  const lengthPx = field.length_m * pxPerMeter
  const widthPx = field.width_m * pxPerMeter

  // Field background: vertical gradient for realistic, flat for schematic
  const grad = FIELD_GRADIENT[field.style] ?? FIELD_GRADIENT.schematic
  if (field.style === 'realistic') {
    const g = ctx.createLinearGradient(0, fieldPxY, 0, fieldPxY + fieldPxH)
    g.addColorStop(0, grad.top)
    g.addColorStop(1, grad.bottom)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = grad.top
  }
  ctx.fillRect(fieldPxX, fieldPxY, fieldPxW, fieldPxH)

  // Diagonal mow stripes (realistic only)
  if (field.style === 'realistic') {
    const step = 5 * pxPerMeter
    ctx.save()
    // Clip to field
    ctx.beginPath()
    ctx.rect(fieldPxX, fieldPxY, fieldPxW, fieldPxH)
    ctx.clip()

    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    // Draw rotated bands — translate to field origin, rotate 45°, draw bands
    ctx.translate(fieldPxX + fieldPxW / 2, fieldPxY + fieldPxH / 2)
    ctx.rotate(Math.PI / 4)
    // After rotation, draw horizontal alternating bands — length must cover
    // the diagonal of the field
    const diag = Math.sqrt(fieldPxW * fieldPxW + fieldPxH * fieldPxH)
    const bandCount = Math.ceil(diag / step) + 2
    for (let i = -bandCount; i < bandCount; i++) {
      if (i % 2 === 0) continue
      ctx.fillRect(-diag, i * step, diag * 2, step)
    }
    ctx.restore()
  }

  // Outline
  strokeMarking(ctx, () => {
    ctx.beginPath()
    ctx.rect(fieldPxX, fieldPxY, fieldPxW, fieldPxH)
  })

  // Center line (full-field only)
  if (!half) {
    strokeMarking(ctx, () => {
      ctx.beginPath()
      if (isH) {
        ctx.moveTo(fieldPxX + lengthPx / 2, fieldPxY)
        ctx.lineTo(fieldPxX + lengthPx / 2, fieldPxY + widthPx)
      } else {
        ctx.moveTo(fieldPxX, fieldPxY + lengthPx / 2)
        ctx.lineTo(fieldPxX + widthPx, fieldPxY + lengthPx / 2)
      }
    })
  }

  // Center circle + spot (full-field only)
  if (!half) {
    const centerCircleR = 9.15 * pxPerMeter
    const cx = isH ? fieldPxX + lengthPx / 2 : fieldPxX + widthPx / 2
    const cy = isH ? fieldPxY + widthPx / 2 : fieldPxY + lengthPx / 2
    strokeMarking(ctx, () => {
      ctx.beginPath()
      ctx.arc(cx, cy, centerCircleR, 0, Math.PI * 2)
    })
    // Center spot
    ctx.fillStyle = MARK_LINE
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1.5, 0.3 * pxPerMeter), 0, Math.PI * 2)
    ctx.fill()
  }

  // Cap box dimensions to fit inside small fields (see field-renderer.tsx).
  const penaltyWidthM = Math.min(40.3, Math.max(field.width_m - 2, field.width_m * 0.5))
  const penaltyDepthM = Math.min(16.5, field.length_m * 0.3)
  const goalAreaWidthM = Math.min(18.3, field.width_m * 0.4)
  const goalAreaDepthM = Math.min(5.5, field.length_m * 0.12)
  const goalPostWidthM = Math.min(7.32, field.width_m * 0.18)
  const penaltyDepth = penaltyDepthM * pxPerMeter
  const penaltyWidth = penaltyWidthM * pxPerMeter
  const goalAreaDepth = goalAreaDepthM * pxPerMeter
  const goalAreaWidth = goalAreaWidthM * pxPerMeter
  const goalPostWidth = goalPostWidthM * pxPerMeter
  const goalPostDepth = Math.max(3, 0.9 * pxPerMeter)

  // Penalty spot + D
  const penaltySpotDistM = Math.min(11, penaltyDepthM * 0.66)
  const penaltySpotDist = penaltySpotDistM * pxPerMeter
  const penaltyDRadius = 9.15 * pxPerMeter

  const ends = half ? [1] : [0, 1]

  for (const end of ends) {
    let penBoxX: number, penBoxY: number, penBoxW: number, penBoxH: number
    let gaBoxX: number, gaBoxY: number, gaBoxW: number, gaBoxH: number
    let penSpotX: number, penSpotY: number
    let goalX: number, goalY: number, goalW: number, goalH: number
    let dArcStart: number, dArcEnd: number

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

      // Arc span in radians (0° = right). Canvas uses radians.
      if (end === 0) {
        dArcStart = -53 * Math.PI / 180
        dArcEnd   =  53 * Math.PI / 180
      } else {
        dArcStart = 127 * Math.PI / 180
        dArcEnd   = 233 * Math.PI / 180
      }

      goalW = goalPostDepth
      goalH = goalPostWidth
      goalX = end === 0 ? fieldPxX - goalPostDepth : fieldPxX + lengthPx
      goalY = fieldPxY + (widthPx - goalPostWidth) / 2
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

      if (end === 0) {
        dArcStart = 37 * Math.PI / 180
        dArcEnd   = 143 * Math.PI / 180
      } else {
        dArcStart = 217 * Math.PI / 180
        dArcEnd   = 323 * Math.PI / 180
      }

      goalW = goalPostWidth
      goalH = goalPostDepth
      goalY = end === 0 ? fieldPxY - goalPostDepth : fieldPxY + lengthPx
      goalX = fieldPxX + (widthPx - goalPostWidth) / 2
    }

    // Boxes
    strokeMarking(ctx, () => {
      ctx.beginPath()
      ctx.rect(penBoxX, penBoxY, penBoxW, penBoxH)
    })
    strokeMarking(ctx, () => {
      ctx.beginPath()
      ctx.rect(gaBoxX, gaBoxY, gaBoxW, gaBoxH)
    })

    // Penalty spot
    ctx.fillStyle = MARK_LINE
    ctx.beginPath()
    ctx.arc(penSpotX, penSpotY, Math.max(1.5, 0.3 * pxPerMeter), 0, Math.PI * 2)
    ctx.fill()

    // Penalty D
    strokeMarking(ctx, () => {
      ctx.beginPath()
      ctx.arc(penSpotX, penSpotY, penaltyDRadius, dArcStart, dArcEnd)
    })

    // Goal with net pattern
    drawGoalFrame(ctx, goalX, goalY, goalW, goalH)
  }

  // Corner arcs
  const cornerR = Math.max(3, 1 * pxPerMeter)
  const corners: Array<{ cx: number; cy: number; start: number; end: number }> = []
  if (!half) {
    corners.push({ cx: fieldPxX,              cy: fieldPxY,              start: 0,               end: Math.PI / 2 })
    corners.push({ cx: fieldPxX + fieldPxW,   cy: fieldPxY,              start: Math.PI / 2,     end: Math.PI })
    corners.push({ cx: fieldPxX + fieldPxW,   cy: fieldPxY + fieldPxH,   start: Math.PI,         end: 3 * Math.PI / 2 })
    corners.push({ cx: fieldPxX,              cy: fieldPxY + fieldPxH,   start: 3 * Math.PI / 2, end: 2 * Math.PI })
  } else {
    if (isH) {
      corners.push({ cx: fieldPxX + fieldPxW, cy: fieldPxY,             start: Math.PI / 2, end: Math.PI })
      corners.push({ cx: fieldPxX + fieldPxW, cy: fieldPxY + fieldPxH,  start: Math.PI,     end: 3 * Math.PI / 2 })
    } else {
      corners.push({ cx: fieldPxX + fieldPxW, cy: fieldPxY + fieldPxH, start: Math.PI,         end: 3 * Math.PI / 2 })
      corners.push({ cx: fieldPxX,            cy: fieldPxY + fieldPxH, start: 3 * Math.PI / 2, end: 2 * Math.PI })
    }
  }
  for (const c of corners) {
    strokeMarking(ctx, () => {
      ctx.beginPath()
      ctx.arc(c.cx, c.cy, cornerR, c.start, c.end)
    })
  }
}

function drawGoalFrame(ctx: SKRSContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  // Net backdrop
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(x, y, w, h)
  // Net crosshatch
  const step = Math.max(3, Math.min(w, h) / 4)
  ctx.strokeStyle = 'rgba(120,120,120,0.35)'
  ctx.lineWidth = 0.5
  for (let vx = x + step; vx < x + w; vx += step) {
    ctx.beginPath()
    ctx.moveTo(vx, y); ctx.lineTo(vx, y + h)
    ctx.stroke()
  }
  for (let vy = y + step; vy < y + h; vy += step) {
    ctx.beginPath()
    ctx.moveTo(x, vy); ctx.lineTo(x + w, vy)
    ctx.stroke()
  }
  // Frame
  ctx.strokeStyle = '#c8c8c8'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
  ctx.restore()
}

// ─── Object drawing ───────────────────────────────────────────────────────────

function drawObjects(ctx: SKRSContext2D, field: Field, objects: BoardObject[], W: number, H: number) {
  const layout = computeLayout(field, W, H)

  for (const obj of objects) {
    if (obj.hidden) continue

    switch (obj.type) {
      case 'zone':
        drawZone(ctx, obj, field, layout)
        break
      case 'zone-line':
        drawZoneLine(ctx, obj, field, layout)
        break
      case 'cone':
        drawCone(ctx, obj, field, layout)
        break
      case 'goal':
        drawGoalObj(ctx, obj, field, layout)
        break
      case 'ball':
        drawBall(ctx, obj, field, layout)
        break
      case 'player':
        drawPlayer(ctx, obj, field, layout)
        break
      case 'arrow':
        drawArrow(ctx, obj, field, layout)
        break
    }
  }
}

type ZoneObj = Extract<BoardObject, { type: 'zone' }>
function drawZone(ctx: SKRSContext2D, obj: ZoneObj, field: Field, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const w = field.orientation === 'horizontal' ? mLen(obj.width, layout) : mLen(obj.height, layout)
  const h = field.orientation === 'horizontal' ? mLen(obj.height, layout) : mLen(obj.width, layout)
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
    const fontSize = Math.max(10, mLen(1.5, layout)) * (obj.scale ?? 1)
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
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
function drawZoneLine(ctx: SKRSContext2D, obj: ZoneLineObj, field: Field, layout: FieldLayout) {
  const p0 = mToPx(obj.points[0], obj.points[1], field, layout)
  const p1 = mToPx(obj.points[2], obj.points[3], field, layout)
  ctx.save()
  ctx.strokeStyle = obj.color
  ctx.lineWidth = 2 * (obj.scale ?? 1)
  ctx.lineCap = 'round'
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  ctx.lineTo(p1.x, p1.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

type ConeObj = Extract<BoardObject, { type: 'cone' }>
function drawCone(ctx: SKRSContext2D, obj: ConeObj, field: Field, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(0.8, layout) * (obj.scale ?? 1)
  const grad = CONE_GRADIENTS[obj.color] ?? { top: '#ffb366', bottom: '#e06a00' }
  ctx.save()
  ctx.setLineDash([])

  // Base shadow ellipse
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(x, y + radius * 0.85, radius * 0.75, radius * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()

  // Drop shadow for the cone body
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  // Triangle path
  const pts: Array<{ px: number; py: number }> = []
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2
    pts.push({ px: x + radius * Math.cos(angle), py: y + radius * Math.sin(angle) })
  }

  const g = ctx.createLinearGradient(x, y - radius, x, y + radius)
  g.addColorStop(0, grad.top)
  g.addColorStop(1, grad.bottom)
  ctx.fillStyle = g
  ctx.strokeStyle = '#00000055'
  ctx.lineWidth = 0.75

  ctx.beginPath()
  ctx.moveTo(pts[0].px, pts[0].py)
  ctx.lineTo(pts[1].px, pts[1].py)
  ctx.lineTo(pts[2].px, pts[2].py)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.stroke()

  // Highlight streak on upper-right face
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - radius * 0.15, y - radius * 0.55)
  ctx.lineTo(x + radius * 0.35, y + radius * 0.1)
  ctx.stroke()

  ctx.restore()
}

type GoalObj = Extract<BoardObject, { type: 'goal' }>
function drawGoalObj(ctx: SKRSContext2D, obj: GoalObj, field: Field, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const size = GOAL_SIZES[obj.variant] ?? GOAL_SIZES['full']
  const scaleFactor = obj.scale ?? 1
  const w = mLen(size.w, layout) * scaleFactor
  const h = mLen(size.h, layout) * scaleFactor
  const rotation = (obj.rotation ?? 0) * (Math.PI / 180)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)

  // Net + frame (drawn centered)
  const gx = -w / 2
  const gy = -h / 2
  // Net backdrop
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(gx, gy, w, h)
  // Net crosshatch
  const step = Math.max(3, Math.min(w, h) / 4)
  ctx.strokeStyle = 'rgba(120,120,120,0.35)'
  ctx.lineWidth = 0.5
  for (let vx = gx + step; vx < gx + w; vx += step) {
    ctx.beginPath(); ctx.moveTo(vx, gy); ctx.lineTo(vx, gy + h); ctx.stroke()
  }
  for (let vy = gy + step; vy < gy + h; vy += step) {
    ctx.beginPath(); ctx.moveTo(gx, vy); ctx.lineTo(gx + w, vy); ctx.stroke()
  }
  // Posts
  const postT = Math.max(2, Math.min(w, h) * 0.08)
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(gx, gy, postT, h)               // left
  ctx.fillRect(gx + w - postT, gy, postT, h)    // right
  ctx.fillRect(gx, gy, w, postT)                // top crossbar
  // Outer stroke
  ctx.strokeStyle = '#222222'
  ctx.lineWidth = 0.75
  ctx.strokeRect(gx, gy, w, h)

  ctx.restore()
}

type BallObj = Extract<BoardObject, { type: 'ball' }>
function drawBall(ctx: SKRSContext2D, obj: BallObj, field: Field, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(0.4, layout) * (obj.scale ?? 1)
  ctx.save()
  ctx.setLineDash([])

  // Drop shadow for the whole ball
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  // Ball body — radial gradient for 3D look
  const g = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#d8d8d8')
  ctx.fillStyle = g
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 0.75
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.stroke()

  // Pentagon pattern
  const centerPentR = radius * 0.32
  const satPentR = radius * 0.2
  const satDist = radius * 0.58

  ctx.fillStyle = '#1a1a1a'
  // Center pentagon
  drawPentagon(ctx, x, y, centerPentR, 0)
  // 5 surrounding pentagons
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * (Math.PI / 180)
    const cx = x + Math.cos(a) * satDist
    const cy = y + Math.sin(a) * satDist
    drawPentagon(ctx, cx, cy, satPentR, i * 72 + 180)
  }

  ctx.restore()
}

function drawPentagon(ctx: SKRSContext2D, cx: number, cy: number, r: number, rotationDeg: number) {
  const rot = (rotationDeg - 90) * Math.PI / 180
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * 2 * Math.PI) / 5
    const px = cx + r * Math.cos(a)
    const py = cy + r * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

type PlayerObj = Extract<BoardObject, { type: 'player' }>
function drawPlayer(ctx: SKRSContext2D, obj: PlayerObj, field: Field, layout: FieldLayout) {
  const { x, y } = mToPx(obj.x, obj.y, field, layout)
  const radius = mLen(1.2, layout) * (obj.scale ?? 1)
  const grad = PLAYER_GRADIENTS[obj.role] ?? PLAYER_GRADIENTS.neutral
  const label = obj.number != null ? String(obj.number) : (obj.position ?? '')
  const ringColor = obj.role === 'coach' ? '#f5f5f0' : '#ffffff'

  ctx.save()
  ctx.setLineDash([])

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  // Body gradient
  const g = ctx.createLinearGradient(x, y - radius, x, y + radius)
  g.addColorStop(0, grad.top)
  g.addColorStop(1, grad.bottom)
  ctx.fillStyle = g
  ctx.strokeStyle = ringColor
  ctx.lineWidth = Math.max(1.5, radius * 0.12)
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  // Clear shadow before stroking ring
  ctx.shadowBlur = 0
  ctx.stroke()

  // Rim highlight (top half arc)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = Math.max(1, radius * 0.07)
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.91, Math.PI, 2 * Math.PI)
  ctx.stroke()

  // Label
  if (label !== '') {
    const fontSize = Math.max(9, radius * 0.95)
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 0.5
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText(label, x, y)
    ctx.fillText(label, x, y)
  }
  ctx.restore()
}

type ArrowObj = Extract<BoardObject, { type: 'arrow' }>
function drawArrow(ctx: SKRSContext2D, obj: ArrowObj, field: Field, layout: FieldLayout) {
  if (obj.points.length < 4) return

  const pxPoints: Array<{ x: number; y: number }> = []
  for (let i = 0; i < obj.points.length - 1; i += 2) {
    pxPoints.push(mToPx(obj.points[i], obj.points[i + 1], field, layout))
  }
  if (pxPoints.length < 2) return

  const style = ARROW_STYLES[obj.style] ?? ARROW_STYLES['pass']
  const scaleFactor = obj.scale ?? 1
  const strokeWidth = (obj.thickness ?? 3.5) * scaleFactor

  ctx.save()
  ctx.strokeStyle = style.stroke
  ctx.fillStyle = style.stroke
  ctx.lineWidth = strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(style.dash ?? [])

  const p0 = pxPoints[0]
  const pN = pxPoints[pxPoints.length - 1]

  if (style.curved && pxPoints.length === 2) {
    // Quadratic curve with perpendicular offset
    const mx = (p0.x + pN.x) / 2
    const my = (p0.y + pN.y) / 2
    const dx = pN.x - p0.x
    const dy = pN.y - p0.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const off = len * 0.08
    const cx = mx + (-dy / len) * off
    const cy = my + (dx / len) * off
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.quadraticCurveTo(cx, cy, pN.x, pN.y)
    ctx.stroke()
    // Head uses tangent at tip = (pN - control)
    drawArrowhead(ctx, pN.x - cx, pN.y - cy, pN.x, pN.y, strokeWidth, scaleFactor, style.stroke)
  } else {
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < pxPoints.length; i++) {
      ctx.lineTo(pxPoints[i].x, pxPoints[i].y)
    }
    ctx.stroke()
    const prev = pxPoints[pxPoints.length - 2]
    drawArrowhead(ctx, pN.x - prev.x, pN.y - prev.y, pN.x, pN.y, strokeWidth, scaleFactor, style.stroke)
  }

  ctx.restore()
}

function drawArrowhead(
  ctx: SKRSContext2D,
  dirX: number, dirY: number,
  tipX: number, tipY: number,
  _strokeWidth: number,
  scaleFactor: number,
  color: string,
) {
  const angle = Math.atan2(dirY, dirX)
  const headLen = 12 * scaleFactor
  const headAngle = Math.PI / 6

  ctx.setLineDash([])
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(
    tipX - headLen * Math.cos(angle - headAngle),
    tipY - headLen * Math.sin(angle - headAngle),
  )
  ctx.lineTo(
    tipX - headLen * Math.cos(angle + headAngle),
    tipY - headLen * Math.sin(angle + headAngle),
  )
  ctx.closePath()
  ctx.fill()
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
