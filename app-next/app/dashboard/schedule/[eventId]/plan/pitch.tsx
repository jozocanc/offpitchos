'use client'

import { useRef } from 'react'
import { BOX_VIEW } from '@/lib/game-plan'

// Plain SVG markings for the game plan. The tactics board's FieldMarkings are
// Konva shapes; the lineup builder is plain DOM (pointer events, works on
// touch) so it draws its own lines with the same colours.

export const PITCH_GREEN = '#2d6e42'
export const PITCH_GREEN_DARK = '#1f5a36'
export const PITCH_LINE = '#f5f5f0'

const W = 68
const L = 105

/**
 * Green surround for a board. The markings used to paint grass a few metres
 * past the viewBox with overflow visible, which spilled out of the card over
 * the text below. The padding here holds the goals and edge labels instead.
 */
export const PITCH_FRAME_CLASS = 'rounded-xl p-3 sm:p-4'
export const PITCH_FRAME_STYLE = { background: `linear-gradient(180deg, ${'#2d6e42'}, ${'#1f5a36'})` }

/** Portrait full pitch, our goal at the bottom. viewBox in metres. */
export function FullPitchMarkings() {
  const box = { x: (W - 40.32) / 2, w: 40.32, d: 16.5 }
  const six = { x: (W - 18.32) / 2, w: 18.32, d: 5.5 }
  const goal = { x: (W - 7.32) / 2, w: 7.32 }
  return (
    <svg viewBox={`0 0 ${W} ${L}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="gp-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={PITCH_GREEN} />
          <stop offset="1" stopColor={PITCH_GREEN_DARK} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={L} fill="url(#gp-grass)" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={0} y={i * 15} width={W} height={7.5} fill="#ffffff" opacity={0.035} />
      ))}
      <g fill="none" stroke={PITCH_LINE} strokeWidth={0.45} strokeLinecap="round">
        <rect x={0} y={0} width={W} height={L} />
        <line x1={0} y1={L / 2} x2={W} y2={L / 2} />
        <circle cx={W / 2} cy={L / 2} r={9.15} />
        {/* Top (opponent) end */}
        <rect x={box.x} y={0} width={box.w} height={box.d} />
        <rect x={six.x} y={0} width={six.w} height={six.d} />
        <path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" />
        <rect x={goal.x} y={-1.6} width={goal.w} height={1.6} />
        {/* Bottom (our) end */}
        <rect x={box.x} y={L - box.d} width={box.w} height={box.d} />
        <rect x={six.x} y={L - six.d} width={six.w} height={six.d} />
        <path d={`M 26.69 ${L - 16.5} A 9.15 9.15 0 0 1 41.31 ${L - 16.5}`} />
        <rect x={goal.x} y={L} width={goal.w} height={1.6} />
        {/* Corner arcs */}
        <path d="M 1 0 A 1 1 0 0 1 0 1" />
        <path d={`M ${W - 1} 0 A 1 1 0 0 0 ${W} 1`} />
        <path d={`M 0 ${L - 1} A 1 1 0 0 1 1 ${L}`} />
        <path d={`M ${W} ${L - 1} A 1 1 0 0 0 ${W - 1} ${L}`} />
      </g>
      <g fill={PITCH_LINE}>
        <circle cx={W / 2} cy={L / 2} r={0.45} />
        <circle cx={W / 2} cy={11} r={0.4} />
        <circle cx={W / 2} cy={L - 11} r={0.4} />
      </g>
    </svg>
  )
}

/** Half-pitch box view, goal line along the top. viewBox in metres. */
export function BoxMarkings() {
  const D = BOX_VIEW.depthM
  const box = { x: (W - 40.32) / 2, w: 40.32, d: 16.5 }
  const six = { x: (W - 18.32) / 2, w: 18.32, d: 5.5 }
  const goal = { x: (W - 7.32) / 2, w: 7.32 }
  return (
    <svg viewBox={`0 0 ${W} ${D}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="gp-box-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={PITCH_GREEN} />
          <stop offset="1" stopColor={PITCH_GREEN_DARK} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={D} fill="url(#gp-box-grass)" />
      <g fill="none" stroke={PITCH_LINE} strokeWidth={0.3} strokeLinecap="round">
        <line x1={0} y1={0} x2={W} y2={0} />
        <line x1={0} y1={0} x2={0} y2={D} />
        <line x1={W} y1={0} x2={W} y2={D} />
        <rect x={box.x} y={0} width={box.w} height={box.d} />
        <rect x={six.x} y={0} width={six.w} height={six.d} />
        <path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" />
        <rect x={goal.x} y={-1.8} width={goal.w} height={1.8} />
        <path d="M 1 0 A 1 1 0 0 1 0 1" />
        <path d={`M ${W - 1} 0 A 1 1 0 0 0 ${W} 1`} />
      </g>
      <circle cx={W / 2} cy={11} r={0.35} fill={PITCH_LINE} />
    </svg>
  )
}

/**
 * Pointer-event drag for a token on a board: works with mouse, pen and touch.
 * A press that moves less than 6px is a tap (onTap); otherwise every move
 * reports the normalized 0..1 position inside the board (onMove).
 */
export function useBoardDrag(boardRef: React.RefObject<HTMLElement | null>) {
  const state = useRef<{ id: number; sx: number; sy: number; moved: boolean } | null>(null)

  return function handlers(opts: {
    onMove?: (x: number, y: number) => void
    onTap?: () => void
    disabled?: boolean
  }) {
    if (opts.disabled) return { onClick: opts.onTap }
    return {
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        state.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false }
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        const s = state.current
        if (!s || s.id !== e.pointerId) return
        if (!s.moved && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 6) return
        s.moved = true
        const rect = boardRef.current?.getBoundingClientRect()
        if (!rect || !opts.onMove) return
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        opts.onMove(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000)
      },
      onPointerUp(e: React.PointerEvent<HTMLElement>) {
        const s = state.current
        state.current = null
        if (!s || s.id !== e.pointerId) return
        e.stopPropagation()
        if (!s.moved) opts.onTap?.()
      },
      onPointerCancel() {
        state.current = null
      },
      onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          opts.onTap?.()
        }
      },
    }
  }
}

/** Jersey-number circle + last name under it, on the green board. */
export function PlayerToken({
  number,
  name,
  label,
  empty,
  captain,
  keeper,
  status,
  size = 'md',
}: {
  number: number | null
  name: string
  /** Shown under an empty token (slot label) or above a corner marker (role). */
  label?: string
  empty?: boolean
  captain?: boolean
  keeper?: boolean
  /** Availability warning dot for staff. */
  status?: 'limited' | 'out' | null
  size?: 'sm' | 'md'
}) {
  const circle = size === 'sm' ? 'h-7 w-7 text-[11px] sm:h-8 sm:w-8 sm:text-xs' : 'h-10 w-10 text-sm sm:h-11 sm:w-11 sm:text-base'
  const initials = name ? name.slice(0, 2).toUpperCase() : '?'
  return (
    <span className="flex flex-col items-center gap-0.5 select-none">
      <span className="relative">
        {empty ? (
          <span
            className={`${circle} flex items-center justify-center rounded-full border-2 border-dashed font-bold`}
            style={{ borderColor: 'rgba(255,255,255,0.75)', color: '#ffffff', background: 'rgba(0,0,0,0.12)' }}
          >
            +
          </span>
        ) : (
          <span
            className={`${circle} flex items-center justify-center rounded-full font-extrabold shadow-md`}
            style={{
              background: keeper ? '#f2c94c' : '#ffffff',
              color: '#0f1510',
              border: '2px solid rgba(15,21,16,0.85)',
            }}
          >
            {number ?? initials}
          </span>
        )}
        {captain && !empty && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black"
            style={{ background: '#0f1510', color: '#f2c94c', border: '1px solid #f2c94c' }}
            aria-label="Captain"
          >
            C
          </span>
        )}
        {status && !empty && (
          <span
            className="absolute -left-1 -top-1 h-3 w-3 rounded-full"
            style={{ background: status === 'out' ? '#e53e3e' : '#f6ad55', border: '1.5px solid #ffffff' }}
            aria-label={status === 'out' ? 'Out' : 'Limited'}
          />
        )}
      </span>
      <span
        className={`max-w-[84px] truncate rounded-md px-1.5 py-px text-center font-semibold leading-tight ${size === 'sm' ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-[11px]'}`}
        style={{ color: '#ffffff', background: 'rgba(10, 28, 18, 0.55)' }}
      >
        {empty ? (label ?? '') : name}
      </span>
      {label && !empty && size === 'sm' && (
        <span
          className="max-w-[84px] truncate rounded px-1 py-px text-center text-[8px] font-medium uppercase leading-none tracking-wide sm:text-[9px]"
          style={{ color: 'rgba(255,255,255,0.9)', background: 'rgba(10, 28, 18, 0.45)' }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
