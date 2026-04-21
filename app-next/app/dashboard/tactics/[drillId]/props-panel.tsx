'use client'

import React from 'react'
import type { BoardObject } from '@/lib/tactics/object-schema'
import {
  type EditorState,
  type Action,
  ZONE_COLOR_PRESETS,
  PLAYER_ROLE_OPTIONS,
  CONE_COLOR_OPTIONS,
} from './editor-types'

interface PropsPanelProps {
  state: EditorState
  dispatch: React.Dispatch<Action>
  collapsed: boolean
  onToggleCollapse: () => void
}

// ── Icons for section headers (14px) ────────────────────────────────────────
const SI = {
  field: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="12" y1="5" x2="12" y2="19"/><circle cx="12" cy="12" r="2"/></svg>),
  player: (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.2-6 7-6s7 2 7 6z"/></svg>),
  cone: (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L4 19h16z"/></svg>),
  ball: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><polygon points="12,7 15,10 14,14 10,14 9,10" fill="currentColor"/></svg>),
  goal: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="18" height="11"/><line x1="7" y1="7" x2="7" y2="18"/><line x1="17" y1="7" x2="17" y2="18"/></svg>),
  arrow: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="19" y2="12"/><polyline points="14,7 19,12 14,17"/></svg>),
  zone: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>),
  line: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2"><line x1="4" y1="12" x2="20" y2="12"/></svg>),
  stack: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h16M4 13h16M4 18h16"/></svg>),
}

function SectionHeader({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-gray/90 mb-2">
      <span className="text-green/70">{icon}</span>
      <span>{text}</span>
      <span className="flex-1 h-px bg-white/10 ml-1" />
    </div>
  )
}

// A labeled slider row: label + value on same line, h-2 track, green thumb.
function SliderRow({
  label, value, min, max, step, onChange, suffix = '',
}: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray">{label}</span>
        <span className="text-[11px] text-white/90 font-medium tabular-nums">
          {value.toFixed(step && step < 1 ? 1 : 0)}{suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step ?? 1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 accent-green"
        style={{ accentColor: 'var(--color-green)' }}
      />
    </div>
  )
}

// Number input with a unit suffix shown inside the input (right-aligned gray).
function NumInput({
  value, onChange, min, max, suffix,
}: {
  value: number | string
  onChange: (v: number) => void
  min?: number; max?: number
  suffix?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={min} max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-dark border border-white/10 focus:border-green/50 rounded px-2 py-1.5 text-sm text-white outline-none transition-colors pr-7 tabular-nums"
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray pointer-events-none select-none">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function PropsPanel({ state, dispatch, collapsed, onToggleCollapse }: PropsPanelProps) {
  const { selectedIds, objects, field } = state

  const selectedObjs = objects.filter(o => selectedIds.includes(o.id))
  const single = selectedObjs.length === 1 ? selectedObjs[0] : null

  function label(text: string) {
    return <span className="text-[11px] text-gray">{text}</span>
  }

  function renderFieldEditor() {
    const unit = field.units
    return (
      <div className="space-y-4">
        <SectionHeader icon={SI.field} text="Field" />

        <div className="flex gap-2">
          <div className="flex-1">
            {label('Width')}
            <div className="mt-1">
              <NumInput
                value={field.width_m}
                min={5} max={120}
                suffix={unit}
                onChange={v => dispatch({ type: 'SET_FIELD', patch: { width_m: v } })}
              />
            </div>
          </div>
          <div className="flex-1">
            {label('Length')}
            <div className="mt-1">
              <NumInput
                value={field.length_m}
                min={5} max={120}
                suffix={unit}
                onChange={v => dispatch({ type: 'SET_FIELD', patch: { length_m: v } })}
              />
            </div>
          </div>
        </div>

        <div>
          {label('Units')}
          <div className="flex gap-1.5 mt-1">
            {(['m', 'yd'] as const).map(u => (
              <button key={u}
                onClick={() => dispatch({ type: 'SET_FIELD', patch: { units: u } })}
                className={[
                  'flex-1 px-3 py-1.5 rounded text-sm border transition-colors',
                  field.units === u
                    ? 'border-green text-green bg-green/5'
                    : 'border-white/10 text-gray hover:text-white hover:border-white/20',
                ].join(' ')}
              >{u}</button>
            ))}
          </div>
        </div>

        <div>
          {label('Orientation')}
          <select
            value={field.orientation}
            onChange={e => dispatch({ type: 'SET_FIELD', patch: { orientation: e.target.value as 'horizontal' | 'vertical' } })}
            className="w-full mt-1 bg-dark border border-white/10 focus:border-green/50 rounded px-2 py-1.5 text-sm text-white outline-none"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>

        <div>
          {label('Style')}
          <div className="flex gap-1.5 mt-1">
            {(['schematic', 'realistic'] as const).map(s => (
              <button key={s}
                onClick={() => dispatch({ type: 'SET_FIELD', patch: { style: s } })}
                className={[
                  'flex-1 px-3 py-1.5 rounded text-sm border capitalize transition-colors',
                  field.style === s
                    ? 'border-green text-green bg-green/5'
                    : 'border-white/10 text-gray hover:text-white hover:border-white/20',
                ].join(' ')}
              >{s}</button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.half_field}
            onChange={e => dispatch({ type: 'SET_FIELD', patch: { half_field: e.target.checked } })}
            className="accent-green w-4 h-4"
          />
          <span className="text-sm text-gray">Half field</span>
        </label>
      </div>
    )
  }

  // Shared swatch button
  function swatch(
    on: boolean,
    style: React.CSSProperties,
    onClick: () => void,
    title?: string,
    round = true,
  ) {
    return (
      <button
        key={title}
        title={title}
        onClick={onClick}
        className={[
          'w-7 h-7 transition-all',
          round ? 'rounded-full' : 'rounded-md',
          on ? 'ring-2 ring-green ring-offset-2 ring-offset-dark-secondary scale-105'
             : 'ring-1 ring-white/15 hover:ring-white/30',
        ].join(' ')}
        style={style}
      />
    )
  }

  function renderObjectEditor() {
    if (!single) return null

    if (single.type === 'player') {
      const p = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.player} text="Player" />
          <SliderRow
            label="Size"
            value={p.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { scale: v } })}
          />
          <div>
            {label('Role')}
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PLAYER_ROLE_OPTIONS.map(o =>
                swatch(
                  p.role === o.value,
                  { background: o.color },
                  () => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { role: o.value as typeof p.role } }),
                  o.label,
                )
              )}
            </div>
          </div>
          <div>
            {label('Number')}
            <div className="mt-1">
              <input
                type="number" min={0} max={99}
                value={p.number ?? ''}
                onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { number: e.target.value ? Number(e.target.value) : undefined } })}
                className="w-full bg-dark border border-white/10 focus:border-green/50 rounded px-2 py-1.5 text-sm text-white outline-none tabular-nums"
              />
            </div>
          </div>
          <div>
            {label('Position')}
            <div className="mt-1">
              <input
                type="text" maxLength={8}
                value={p.position ?? ''}
                onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { position: e.target.value || undefined } })}
                className="w-full bg-dark border border-white/10 focus:border-green/50 rounded px-2 py-1.5 text-sm text-white outline-none"
              />
            </div>
          </div>
        </div>
      )
    }

    if (single.type === 'cone') {
      const c = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.cone} text="Cone" />
          <SliderRow
            label="Size"
            value={c.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: c.id, patch: { scale: v } })}
          />
          <div>
            {label('Color')}
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {CONE_COLOR_OPTIONS.map(o =>
                swatch(
                  c.color === o.value,
                  { background: o.color },
                  () => dispatch({ type: 'UPDATE_OBJECT', id: c.id, patch: { color: o.value as typeof c.color } }),
                  o.label,
                )
              )}
            </div>
          </div>
        </div>
      )
    }

    if (single.type === 'arrow') {
      const ar = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.arrow} text="Arrow" />
          <SliderRow
            label="Size"
            value={ar.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: ar.id, patch: { scale: v } })}
          />
          <div>
            {label('Style')}
            <div className="flex gap-1.5 mt-1">
              {(['pass', 'run', 'free'] as const).map(s => (
                <button key={s}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: ar.id, patch: { style: s } })}
                  className={[
                    'flex-1 px-2 py-1.5 rounded text-sm border capitalize transition-colors',
                    ar.style === s
                      ? 'border-green text-green bg-green/5'
                      : 'border-white/10 text-gray hover:text-white hover:border-white/20',
                  ].join(' ')}
                >{s}</button>
              ))}
            </div>
          </div>
          <SliderRow
            label="Thickness"
            value={ar.thickness ?? 3}
            min={1} max={8} step={1}
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: ar.id, patch: { thickness: v } })}
          />
        </div>
      )
    }

    if (single.type === 'ball') {
      const b = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.ball} text="Ball" />
          <SliderRow
            label="Size"
            value={b.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: b.id, patch: { scale: v } })}
          />
        </div>
      )
    }

    if (single.type === 'zone-line') {
      const zl = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.line} text="Line" />
          <SliderRow
            label="Size"
            value={zl.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: zl.id, patch: { scale: v } })}
          />
        </div>
      )
    }

    if (single.type === 'zone') {
      const z = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.zone} text="Zone" />
          <SliderRow
            label="Size"
            value={z.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { scale: v } })}
          />
          <div>
            {label('Color')}
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {ZONE_COLOR_PRESETS.map(hex =>
                swatch(
                  z.color === hex,
                  { background: hex },
                  () => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { color: hex } }),
                  hex,
                  false,
                )
              )}
            </div>
          </div>
          <SliderRow
            label="Opacity"
            value={z.opacity * 100}
            min={0} max={100} step={5} suffix="%"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { opacity: v / 100 } })}
          />
          <div>
            {label('Label')}
            <div className="mt-1">
              <input
                type="text" maxLength={40}
                value={z.label ?? ''}
                onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { label: e.target.value || undefined } })}
                className="w-full bg-dark border border-white/10 focus:border-green/50 rounded px-2 py-1.5 text-sm text-white outline-none"
              />
            </div>
          </div>
        </div>
      )
    }

    if (single.type === 'goal') {
      const g = single
      return (
        <div className="space-y-4">
          <SectionHeader icon={SI.goal} text="Goal" />
          <SliderRow
            label="Size"
            value={g.scale ?? 1}
            min={0.5} max={2.5} step={0.1} suffix="×"
            onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: g.id, patch: { scale: v } })}
          />
          <div>
            {label('Variant')}
            <div className="flex gap-1.5 mt-1">
              {(['mini-h', 'mini-v', 'full'] as const).map(v => (
                <button key={v}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: g.id, patch: { variant: v } })}
                  className={[
                    'flex-1 px-2 py-1.5 rounded text-sm border transition-colors',
                    g.variant === v
                      ? 'border-green text-green bg-green/5'
                      : 'border-white/10 text-gray hover:text-white hover:border-white/20',
                  ].join(' ')}
                >{v}</button>
              ))}
            </div>
          </div>
          <div>
            {label('Rotation')}
            <div className="mt-1">
              <NumInput
                value={g.rotation ?? 0}
                min={0} max={360}
                suffix="°"
                onChange={v => dispatch({ type: 'UPDATE_OBJECT', id: g.id, patch: { rotation: v } })}
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="text-gray text-sm">
        <p className="font-semibold capitalize">{(single as BoardObject).type}</p>
      </div>
    )
  }

  function getObjXY(o: BoardObject): { x: number; y: number } {
    if (o.type === 'arrow' || o.type === 'zone-line') {
      return { x: o.points[0], y: o.points[1] }
    }
    return { x: (o as { x: number; y: number }).x, y: (o as { x: number; y: number }).y }
  }

  function applyAlign(axis: 'x' | 'y', mode: 'min' | 'center' | 'max') {
    const vals = selectedObjs.map(o => (axis === 'x' ? getObjXY(o).x : getObjXY(o).y))
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const avg = (min + max) / 2
    const target = mode === 'min' ? min : mode === 'max' ? max : avg

    selectedObjs.forEach(o => {
      const cur = getObjXY(o)
      if (o.type === 'arrow' || o.type === 'zone-line') {
        const dx = axis === 'x' ? target - cur.x : 0
        const dy = axis === 'y' ? target - cur.y : 0
        const newPts = o.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
        dispatch({ type: 'UPDATE_OBJECT', id: o.id, patch: { points: newPts } as Partial<BoardObject> })
      } else {
        const patch = axis === 'x'
          ? { x: target } as Partial<BoardObject>
          : { y: target } as Partial<BoardObject>
        dispatch({ type: 'UPDATE_OBJECT', id: o.id, patch })
      }
    })
  }

  function renderMultiSelect() {
    const alignBtns: { label: string; title: string; action: () => void }[] = [
      { label: '⊢', title: 'Align left', action: () => applyAlign('x', 'min') },
      { label: '⊙', title: 'Align center (H)', action: () => applyAlign('x', 'center') },
      { label: '⊣', title: 'Align right', action: () => applyAlign('x', 'max') },
      { label: '⊤', title: 'Align top', action: () => applyAlign('y', 'min') },
      { label: '⊕', title: 'Align middle (V)', action: () => applyAlign('y', 'center') },
      { label: '⊥', title: 'Align bottom', action: () => applyAlign('y', 'max') },
    ]
    return (
      <div className="space-y-4">
        <SectionHeader icon={SI.stack} text={`${selectedObjs.length} Selected`} />

        <div>
          <span className="text-[11px] text-gray">Align</span>
          <div className="grid grid-cols-3 gap-1 mt-1.5">
            {alignBtns.map(btn => (
              <button
                key={btn.title}
                title={btn.title}
                onClick={btn.action}
                className="py-1.5 rounded border border-white/10 text-gray text-base hover:text-white hover:border-green/40 hover:bg-green/5 transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray">Size (all)</span>
            <span className="text-[11px] text-white/90 font-medium tabular-nums" id="multi-size-readout">1.0×</span>
          </div>
          <input
            type="range" min="0.5" max="2.5" step="0.1"
            defaultValue={1}
            onChange={e => {
              const s = Number(e.target.value)
              selectedObjs.forEach(o => dispatch({ type: 'UPDATE_OBJECT', id: o.id, patch: { scale: s } }))
              const r = document.getElementById('multi-size-readout')
              if (r) r.textContent = `${s.toFixed(1)}×`
            }}
            className="w-full h-2 accent-green"
          />
        </div>

        <button
          onClick={() => dispatch({ type: 'DELETE_SELECTED' })}
          className="w-full py-2 rounded bg-red/15 text-red text-sm border border-red/30 hover:bg-red/25 transition-colors font-medium"
        >
          Delete selected
        </button>
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="w-11 bg-dark-secondary border-l border-white/5 flex flex-col items-center pt-3 transition-[width] duration-200 ease-out">
        <button
          onClick={onToggleCollapse}
          title="Expand properties"
          className="text-gray hover:text-white text-lg rounded hover:bg-dark w-8 h-8 flex items-center justify-center transition-colors"
        >
          ‹
        </button>
        <div className="mt-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-gray/60 -rotate-90 origin-center whitespace-nowrap">
          Properties
        </div>
      </div>
    )
  }

  return (
    <div className="w-[280px] bg-dark-secondary border-l border-white/5 flex flex-col transition-[width] duration-200 ease-out">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gray/90">Properties</span>
        <button
          onClick={onToggleCollapse}
          title="Collapse properties"
          className="text-gray hover:text-white w-6 h-6 rounded flex items-center justify-center hover:bg-dark transition-colors"
        >
          ›
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {selectedObjs.length === 0 && renderFieldEditor()}
        {selectedObjs.length === 1 && renderObjectEditor()}
        {selectedObjs.length > 1 && renderMultiSelect()}
      </div>
      {selectedIds.length > 0 && selectedObjs.length === 1 && (
        <div className="p-3 border-t border-white/5">
          <button
            onClick={() => dispatch({ type: 'DELETE_SELECTED' })}
            className="w-full py-2 rounded bg-red/15 text-red text-sm border border-red/30 hover:bg-red/25 transition-colors font-medium"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
