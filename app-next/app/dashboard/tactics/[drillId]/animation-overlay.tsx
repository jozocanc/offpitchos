'use client'

/**
 * AnimationOverlay
 *
 * Sits above the Konva stage (as an absolutely-positioned <canvas> overlay) and
 * animates coloured dots traveling along arrow paths.  The overlay is rendered
 * with a plain 2-D canvas API so it doesn't interfere with the Konva stage.
 *
 * Usage:
 *   <AnimationOverlay
 *     arrows={animatedArrows}   // ArrowObject[] that have animate_order >= 1
 *     field={field}
 *     layout={layout}
 *     width={w}
 *     height={h}
 *     running={isPlaying}
 *     onStop={handleStop}
 *   />
 */

import React, { useEffect, useRef, useCallback } from 'react'
import type { Field } from '@/lib/tactics/object-schema'
import { mToPx, type FieldLayout } from '@/lib/tactics/field-renderer-layout'

// Re-export the arrow subset type we use internally
export interface AnimArrow {
  id: string
  points: number[]
  style: string
  animate_order: number
}

// Color per arrow style — matches ARROW_STYLES in field-renderer
const DOT_COLORS: Record<string, string> = {
  pass: '#ef4557',
  run: '#3b82f6',
  free: '#fde047',
}

// Quadratic bezier point at parameter t
function bezierPoint(
  x1: number, y1: number,
  cx: number, cy: number,
  x2: number, y2: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  }
}

// Build the control point for the "run" curved arrow (mirrors field-renderer logic)
function curveBezierControl(
  x1: number, y1: number, x2: number, y2: number,
): { cx: number; cy: number } {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const off = len * 0.08
  return {
    cx: mx + (-dy / len) * off,
    cy: my + (dx / len) * off,
  }
}

// Convert an arrow's meter-coordinate points to pixel-space
function arrowToPxPoints(
  points: number[],
  field: Field,
  layout: FieldLayout,
): number[] {
  const out: number[] = []
  for (let i = 0; i < points.length - 1; i += 2) {
    const { x, y } = mToPx(points[i], points[i + 1], field, layout)
    out.push(x, y)
  }
  return out
}

interface Props {
  arrows: AnimArrow[]
  field: Field
  layout: FieldLayout
  width: number
  height: number
  running: boolean
  onStop: () => void
}

export default function AnimationOverlay({
  arrows,
  field,
  layout,
  width,
  height,
  running,
  onStop,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const stateRef = useRef<{
    step: number
    stepGroups: AnimArrow[][]
    stepStartTime: number | null
    dotPositions: Array<{ x: number; y: number; color: string } | null>
    phase: 'animating' | 'pause'
    pauseStart: number | null
  } | null>(null)

  // Build groups sorted by animate_order
  const buildGroups = useCallback((arrs: AnimArrow[]): AnimArrow[][] => {
    const orders = [...new Set(arrs.map(a => a.animate_order))].sort((a, b) => a - b)
    return orders.map(o => arrs.filter(a => a.animate_order === o))
  }, [])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const drawDots = useCallback((dots: Array<{ x: number; y: number; color: string } | null>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const dot of dots) {
      if (!dot) continue
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, 7, 0, Math.PI * 2)
      ctx.fillStyle = dot.color
      ctx.shadowColor = dot.color
      ctx.shadowBlur = 12
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }, [])

  // Main animation loop
  useEffect(() => {
    if (!running) {
      // Cancel any ongoing animation and clear canvas
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      clear()
      stateRef.current = null
      return
    }

    const groups = buildGroups(arrows)
    if (groups.length === 0) {
      onStop()
      return
    }

    // Initialize state
    stateRef.current = {
      step: 0,
      stepGroups: groups,
      stepStartTime: null,
      dotPositions: [],
      phase: 'animating',
      pauseStart: null,
    }

    const STEP_DURATION = 1200   // ms per step
    const STEP_PAUSE   = 300    // ms pause between steps
    const LOOP_PAUSE   = 2000   // ms pause before looping

    function tick(now: number) {
      const s = stateRef.current
      if (!s) return

      if (s.phase === 'pause') {
        const elapsed = now - (s.pauseStart ?? now)
        const pauseDur = s.step >= s.stepGroups.length ? LOOP_PAUSE : STEP_PAUSE
        if (elapsed >= pauseDur) {
          if (s.step >= s.stepGroups.length) {
            // Loop
            s.step = 0
          }
          s.phase = 'animating'
          s.stepStartTime = null
        }
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // animating phase
      if (s.stepStartTime === null) s.stepStartTime = now
      const elapsed = now - s.stepStartTime
      const t = Math.min(1, elapsed / STEP_DURATION)

      const group = s.stepGroups[s.step]
      const dots: Array<{ x: number; y: number; color: string } | null> = group.map(arrow => {
        const px = arrowToPxPoints(arrow.points, field, layout)
        if (px.length < 4) return null
        const x1 = px[0], y1 = px[1]
        const x2 = px[px.length - 2], y2 = px[px.length - 1]
        const color = DOT_COLORS[arrow.style] ?? '#ffffff'

        if (arrow.style === 'run') {
          const { cx, cy } = curveBezierControl(x1, y1, x2, y2)
          return { ...bezierPoint(x1, y1, cx, cy, x2, y2, t), color }
        }
        // straight
        return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, color }
      })

      s.dotPositions = dots
      drawDots(dots)

      if (t >= 1) {
        // Done with this step
        s.step += 1
        s.phase = 'pause'
        s.pauseStart = now
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  // re-run when running toggles or arrow layout changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, arrows, field, layout])

  if (!running) return null

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  )
}
