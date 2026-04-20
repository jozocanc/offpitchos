'use client'

import React, {
  useReducer, useEffect, useRef, useCallback, useState,
} from 'react'
import Link from 'next/link'
import Konva from 'konva'
import FieldRenderer, { useFieldLayout } from '@/lib/tactics/field-renderer'
import type { BoardObject, DrillRow, Field } from '@/lib/tactics/object-schema'
import {
  DRILL_CATEGORIES, DRILL_CATEGORY_LABELS, VISIBILITIES,
} from '@/lib/tactics/drill-categories'
import type { DrillCategory, Visibility } from '@/lib/tactics/drill-categories'
import { saveDrill } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'player' | 'cone' | 'ball' | 'goal' | 'arrow' | 'zone'

interface EditorState {
  field: Field
  objects: BoardObject[]
  selectedIds: string[]
  tool: Tool
  toolOption: string
  arrowDraftTail?: { x: number; y: number }
  zoneDraftCorner?: { x: number; y: number }
  title: string
  description: string
  category: DrillCategory
  visibility: Visibility
  past: Array<{ field: Field; objects: BoardObject[] }>
  future: Array<{ field: Field; objects: BoardObject[] }>
}

type Action =
  | { type: 'SET_TOOL'; tool: Tool; option?: string }
  | { type: 'PLACE_OBJECT'; obj: BoardObject }
  | { type: 'MOVE_OBJECT'; id: string; x: number; y: number }
  | { type: 'UPDATE_OBJECT'; id: string; patch: Partial<BoardObject> }
  | { type: 'DELETE_SELECTED' }
  | { type: 'CLEAR_ALL' }
  | { type: 'SELECT'; ids: string[]; additive?: boolean }
  | { type: 'SET_FIELD'; patch: Partial<Field> }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SET_CATEGORY'; category: DrillCategory }
  | { type: 'SET_VISIBILITY'; visibility: Visibility }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_ARROW_DRAFT'; tail?: { x: number; y: number } }
  | { type: 'SET_ZONE_DRAFT'; corner?: { x: number; y: number } }

const MAX_HISTORY = 100

function snapshot(s: EditorState) {
  return { field: s.field, objects: s.objects }
}

function withHistory(
  s: EditorState,
  next: Pick<EditorState, 'field' | 'objects'>
): EditorState {
  const past = [...s.past, snapshot(s)].slice(-MAX_HISTORY)
  return { ...s, ...next, past, future: [] }
}

function reducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case 'SET_TOOL':
      return {
        ...s,
        tool: a.tool,
        toolOption: a.option ?? s.toolOption,
        selectedIds: [],
        arrowDraftTail: undefined,
        zoneDraftCorner: undefined,
      }

    case 'PLACE_OBJECT':
      return withHistory(s, { field: s.field, objects: [...s.objects, a.obj] })

    case 'MOVE_OBJECT': {
      const objects = s.objects.map(o => {
        if (o.id !== a.id) return o
        if (o.type === 'arrow') return o // arrows not draggable via this action
        return { ...o, x: a.x, y: a.y } as BoardObject
      })
      return withHistory(s, { field: s.field, objects })
    }

    case 'UPDATE_OBJECT': {
      const objects = s.objects.map(o =>
        o.id === a.id ? ({ ...o, ...a.patch } as BoardObject) : o
      )
      return withHistory(s, { field: s.field, objects })
    }

    case 'DELETE_SELECTED': {
      if (s.selectedIds.length === 0) return s
      const sel = new Set(s.selectedIds)
      const objects = s.objects.filter(o => !sel.has(o.id))
      return withHistory(s, { field: s.field, objects: objects })
    }

    case 'CLEAR_ALL':
      return withHistory(s, { field: s.field, objects: [] })

    case 'SELECT': {
      if (a.additive) {
        const existing = new Set(s.selectedIds)
        a.ids.forEach(id => {
          if (existing.has(id)) existing.delete(id)
          else existing.add(id)
        })
        return { ...s, selectedIds: [...existing] }
      }
      return { ...s, selectedIds: a.ids }
    }

    case 'SET_FIELD': {
      const field = { ...s.field, ...a.patch }
      return withHistory(s, { field, objects: s.objects })
    }

    case 'SET_TITLE':
      return { ...s, title: a.title }

    case 'SET_DESCRIPTION':
      return { ...s, description: a.description }

    case 'SET_CATEGORY':
      return { ...s, category: a.category }

    case 'SET_VISIBILITY':
      return { ...s, visibility: a.visibility }

    case 'UNDO': {
      if (s.past.length === 0) return s
      const past = [...s.past]
      const prev = past.pop()!
      const future = [snapshot(s), ...s.future]
      return { ...s, ...prev, past, future }
    }

    case 'REDO': {
      if (s.future.length === 0) return s
      const future = [...s.future]
      const next = future.shift()!
      const past = [...s.past, snapshot(s)]
      return { ...s, ...next, past, future }
    }

    case 'SET_ARROW_DRAFT':
      return { ...s, arrowDraftTail: a.tail }

    case 'SET_ZONE_DRAFT':
      return { ...s, zoneDraftCorner: a.corner }

    default:
      return s
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'drill'
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── Palette Tool Button ──────────────────────────────────────────────────────

const ZONE_COLOR_PRESETS = [
  '#2C7BE5', '#E63946', '#FFD500', '#00FF87',
  '#FF8C00', '#9333EA', '#06B6D4', '#ffffff',
]

interface ToolBtnProps {
  label: string
  shortcut: string
  active: boolean
  onClick: () => void
  onShiftClick?: () => void
  children: React.ReactNode
}

function ToolBtn({ label, shortcut, active, onClick, onShiftClick, children }: ToolBtnProps) {
  return (
    <button
      title={`${label} (${shortcut})${onShiftClick ? ' | Shift+click for options' : ''}`}
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onShiftClick?.() }}
      className={[
        'w-12 h-12 flex items-center justify-center rounded-lg text-xl transition-all relative',
        active
          ? 'bg-dark border-l-2 border-green text-green'
          : 'text-gray hover:text-white hover:bg-dark/60',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── Small swatch picker popover ─────────────────────────────────────────────

interface SwatchPickerProps {
  options: { value: string; color: string; label: string }[]
  current: string
  onPick: (value: string) => void
  onClose: () => void
}

function SwatchPicker({ options, current, onPick, onClose }: SwatchPickerProps) {
  return (
    <div
      className="absolute left-14 top-0 z-50 bg-dark-secondary border border-white/10 rounded-lg p-2 flex flex-col gap-1 shadow-xl"
      onMouseLeave={onClose}
    >
      {options.map(o => (
        <button
          key={o.value}
          title={o.label}
          onClick={() => { onPick(o.value); onClose() }}
          className={[
            'flex items-center gap-2 px-2 py-1 rounded text-sm text-left hover:bg-dark/60',
            current === o.value ? 'ring-1 ring-green' : '',
          ].join(' ')}
        >
          <span
            className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0"
            style={{ background: o.color }}
          />
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Props Panel ──────────────────────────────────────────────────────────────

interface PropsPanelProps {
  state: EditorState
  dispatch: React.Dispatch<Action>
  collapsed: boolean
  onToggleCollapse: () => void
}

const PLAYER_ROLE_OPTIONS = [
  { value: 'red', color: '#E63946', label: 'Red' },
  { value: 'blue', color: '#2C7BE5', label: 'Blue' },
  { value: 'neutral', color: '#9CA3AF', label: 'Neutral' },
  { value: 'outside', color: '#6B7280', label: 'Outside' },
  { value: 'gk', color: '#FFD500', label: 'GK' },
  { value: 'coach', color: '#111111', label: 'Coach' },
]

const CONE_COLOR_OPTIONS = [
  { value: 'orange', color: '#FF8C00', label: 'Orange' },
  { value: 'yellow', color: '#FFD500', label: 'Yellow' },
  { value: 'red', color: '#E63946', label: 'Red' },
  { value: 'blue', color: '#2C7BE5', label: 'Blue' },
  { value: 'white', color: '#F3F4F6', label: 'White' },
]

function PropsPanel({ state, dispatch, collapsed, onToggleCollapse }: PropsPanelProps) {
  const { selectedIds, objects, field } = state

  const selectedObjs = objects.filter(o => selectedIds.includes(o.id))
  const single = selectedObjs.length === 1 ? selectedObjs[0] : null

  function label(text: string) {
    return <span className="text-xs text-gray">{text}</span>
  }

  function renderFieldEditor() {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray uppercase tracking-wide">Field</p>

        <div className="flex gap-2">
          <div className="flex-1">
            {label('Width (m)')}
            <input
              type="number" min={5} max={120}
              value={field.width_m}
              onChange={e => dispatch({ type: 'SET_FIELD', patch: { width_m: Number(e.target.value) } })}
              className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
          </div>
          <div className="flex-1">
            {label('Length (m)')}
            <input
              type="number" min={5} max={120}
              value={field.length_m}
              onChange={e => dispatch({ type: 'SET_FIELD', patch: { length_m: Number(e.target.value) } })}
              className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
          </div>
        </div>

        <div>
          {label('Units')}
          <div className="flex gap-2 mt-1">
            {(['m', 'yd'] as const).map(u => (
              <button key={u}
                onClick={() => dispatch({ type: 'SET_FIELD', patch: { units: u } })}
                className={`px-3 py-1 rounded text-sm border ${field.units === u ? 'border-green text-green' : 'border-white/10 text-gray'}`}
              >{u}</button>
            ))}
          </div>
        </div>

        <div>
          {label('Orientation')}
          <select
            value={field.orientation}
            onChange={e => dispatch({ type: 'SET_FIELD', patch: { orientation: e.target.value as 'horizontal' | 'vertical' } })}
            className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>

        <div>
          {label('Style')}
          <div className="flex gap-2 mt-1">
            {(['schematic', 'realistic'] as const).map(s => (
              <button key={s}
                onClick={() => dispatch({ type: 'SET_FIELD', patch: { style: s } })}
                className={`px-3 py-1 rounded text-sm border ${field.style === s ? 'border-green text-green' : 'border-white/10 text-gray'}`}
              >{s}</button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={field.half_field}
            onChange={e => dispatch({ type: 'SET_FIELD', patch: { half_field: e.target.checked } })}
            className="accent-green"
          />
          <span className="text-sm text-gray">Half field</span>
        </label>
      </div>
    )
  }

  function renderObjectEditor() {
    if (!single) return null

    if (single.type === 'player') {
      const p = single
      return (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray uppercase tracking-wide">Player</p>
          <div>
            {label('Role')}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PLAYER_ROLE_OPTIONS.map(o => (
                <button key={o.value}
                  title={o.label}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { role: o.value as typeof p.role } })}
                  className={`w-6 h-6 rounded-full border-2 ${p.role === o.value ? 'border-green' : 'border-transparent'}`}
                  style={{ background: o.color }}
                />
              ))}
            </div>
          </div>
          <div>
            {label('Number')}
            <input
              type="number" min={0} max={99}
              value={p.number ?? ''}
              onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { number: e.target.value ? Number(e.target.value) : undefined } })}
              className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
          </div>
          <div>
            {label('Position')}
            <input
              type="text" maxLength={8}
              value={p.position ?? ''}
              onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: p.id, patch: { position: e.target.value || undefined } })}
              className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
          </div>
        </div>
      )
    }

    if (single.type === 'cone') {
      const c = single
      return (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray uppercase tracking-wide">Cone</p>
          <div>
            {label('Color')}
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {CONE_COLOR_OPTIONS.map(o => (
                <button key={o.value}
                  title={o.label}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: c.id, patch: { color: o.value as typeof c.color } })}
                  className={`w-6 h-6 rounded-full border-2 ${c.color === o.value ? 'border-green' : 'border-transparent'}`}
                  style={{ background: o.color }}
                />
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (single.type === 'arrow') {
      const ar = single
      return (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray uppercase tracking-wide">Arrow</p>
          <div>
            {label('Style')}
            <div className="flex gap-2 mt-1">
              {(['pass', 'run', 'free'] as const).map(s => (
                <button key={s}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: ar.id, patch: { style: s } })}
                  className={`px-2 py-1 rounded text-sm border ${ar.style === s ? 'border-green text-green' : 'border-white/10 text-gray'}`}
                >{s}</button>
              ))}
            </div>
          </div>
          <div>
            {label('Thickness')}
            <input
              type="range" min={1} max={8}
              value={ar.thickness ?? 3}
              onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: ar.id, patch: { thickness: Number(e.target.value) } })}
              className="w-full mt-1 accent-green"
            />
          </div>
        </div>
      )
    }

    if (single.type === 'zone') {
      const z = single
      return (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray uppercase tracking-wide">Zone</p>
          <div>
            {label('Color')}
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {ZONE_COLOR_PRESETS.map(hex => (
                <button key={hex}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { color: hex } })}
                  className={`w-6 h-6 rounded border-2 ${z.color === hex ? 'border-green' : 'border-transparent'}`}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </div>
          <div>
            {label('Opacity')}
            <input
              type="range" min={0} max={1} step={0.05}
              value={z.opacity}
              onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { opacity: Number(e.target.value) } })}
              className="w-full mt-1 accent-green"
            />
          </div>
          <div>
            {label('Label')}
            <input
              type="text" maxLength={40}
              value={z.label ?? ''}
              onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: z.id, patch: { label: e.target.value || undefined } })}
              className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
          </div>
        </div>
      )
    }

    if (single.type === 'goal') {
      const g = single
      return (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray uppercase tracking-wide">Goal</p>
          <div>
            {label('Variant')}
            <div className="flex gap-2 mt-1">
              {(['mini-h', 'mini-v', 'full'] as const).map(v => (
                <button key={v}
                  onClick={() => dispatch({ type: 'UPDATE_OBJECT', id: g.id, patch: { variant: v } })}
                  className={`px-2 py-1 rounded text-sm border ${g.variant === v ? 'border-green text-green' : 'border-white/10 text-gray'}`}
                >{v}</button>
              ))}
            </div>
          </div>
          <div>
            {label('Rotation (°)')}
            <input
              type="number" min={0} max={360}
              value={g.rotation ?? 0}
              onChange={e => dispatch({ type: 'UPDATE_OBJECT', id: g.id, patch: { rotation: Number(e.target.value) } })}
              className="w-full mt-1 bg-dark border border-white/10 rounded px-2 py-1 text-sm text-white"
            />
          </div>
        </div>
      )
    }

    return (
      <div className="text-gray text-sm">
        <p className="font-semibold capitalize">{single.type}</p>
      </div>
    )
  }

  function renderMultiSelect() {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray uppercase tracking-wide">
          {selectedObjs.length} items selected
        </p>
        <button
          onClick={() => dispatch({ type: 'DELETE_SELECTED' })}
          className="w-full py-2 rounded bg-red/20 text-red text-sm border border-red/30 hover:bg-red/30 transition-colors"
        >
          Delete Selected
        </button>
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="w-11 bg-dark-secondary border-l border-white/5 flex flex-col items-center pt-2">
        <button
          onClick={onToggleCollapse}
          title="Expand panel"
          className="text-gray hover:text-white text-lg"
        >
          ‹
        </button>
      </div>
    )
  }

  return (
    <div className="w-[280px] bg-dark-secondary border-l border-white/5 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-semibold text-gray uppercase tracking-wide">Properties</span>
        <button onClick={onToggleCollapse} title="Collapse panel" className="text-gray hover:text-white">
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
            className="w-full py-1.5 rounded bg-red/20 text-red text-sm border border-red/30 hover:bg-red/30 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

export default function EditorClient({
  drill,
  teams,
}: {
  drill: DrillRow
  teams: { id: string; name: string }[]
  role: string
}) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 })
  const [propsPanelCollapsed, setPropsPanelCollapsed] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('saved')
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const isMounted = useRef(false)

  const initState: EditorState = {
    field: drill.field,
    objects: drill.objects,
    selectedIds: [],
    tool: 'select',
    toolOption: 'red',
    title: drill.title,
    description: drill.description,
    category: drill.category,
    visibility: drill.visibility,
    past: [],
    future: [],
  }
  const [state, dispatch] = useReducer(reducer, initState)

  // ── Canvas resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Auto-save (debounced 2000ms) ─────────────────────────────────────────────
  const savePayload = {
    field: state.field,
    objects: state.objects,
    title: state.title,
    description: state.description,
    category: state.category,
    visibility: state.visibility,
  }
  const debouncedPayload = useDebounce(savePayload, 2000)

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    setSaveStatus('saving')
    saveDrill(drill.id, {
      doc: { field: debouncedPayload.field, objects: debouncedPayload.objects },
      title: debouncedPayload.title,
      description: debouncedPayload.description,
      category: debouncedPayload.category,
      visibility: debouncedPayload.visibility,
    })
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPayload])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
        return
      }

      switch (e.key) {
        case 'v': case 'V': dispatch({ type: 'SET_TOOL', tool: 'select' }); break
        case 'p': case 'P': dispatch({ type: 'SET_TOOL', tool: 'player' }); break
        case 'c': case 'C': dispatch({ type: 'SET_TOOL', tool: 'cone' }); break
        case 'b': case 'B': dispatch({ type: 'SET_TOOL', tool: 'ball' }); break
        case 'g': case 'G': dispatch({ type: 'SET_TOOL', tool: 'goal' }); break
        case 'a': case 'A': dispatch({ type: 'SET_TOOL', tool: 'arrow' }); break
        case 'z': case 'Z':
          if (!ctrl) dispatch({ type: 'SET_TOOL', tool: 'zone' })
          break
        case 'Delete':
        case 'Backspace':
          dispatch({ type: 'DELETE_SELECTED' })
          break
        case 'Escape':
          dispatch({ type: 'SELECT', ids: [] })
          dispatch({ type: 'SET_ARROW_DRAFT', tail: undefined })
          dispatch({ type: 'SET_ZONE_DRAFT', corner: undefined })
          dispatch({ type: 'SET_TOOL', tool: 'select' })
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Canvas click handler (placement) ────────────────────────────────────────
  const layout = useFieldLayout(state.field, canvasSize.w, canvasSize.h)

  const handleStageClick = useCallback((stageX: number, stageY: number) => {
    const xM = (stageX - layout.fieldPxX) / layout.pxPerMeter
    const yM = (stageY - layout.fieldPxY) / layout.pxPerMeter

    switch (state.tool) {
      case 'player':
        dispatch({
          type: 'PLACE_OBJECT',
          obj: {
            id: crypto.randomUUID(),
            type: 'player',
            x: xM, y: yM,
            role: state.toolOption as 'red' | 'blue' | 'neutral' | 'outside' | 'gk' | 'coach',
          },
        })
        break

      case 'cone':
        dispatch({
          type: 'PLACE_OBJECT',
          obj: {
            id: crypto.randomUUID(),
            type: 'cone',
            x: xM, y: yM,
            color: state.toolOption as 'orange' | 'yellow' | 'red' | 'blue' | 'white',
          },
        })
        break

      case 'ball':
        dispatch({
          type: 'PLACE_OBJECT',
          obj: { id: crypto.randomUUID(), type: 'ball', x: xM, y: yM },
        })
        break

      case 'goal':
        dispatch({
          type: 'PLACE_OBJECT',
          obj: {
            id: crypto.randomUUID(),
            type: 'goal',
            x: xM, y: yM,
            variant: (state.toolOption || 'full') as 'mini-h' | 'mini-v' | 'full',
          },
        })
        break

      case 'arrow':
        if (!state.arrowDraftTail) {
          dispatch({ type: 'SET_ARROW_DRAFT', tail: { x: xM, y: yM } })
        } else {
          dispatch({
            type: 'PLACE_OBJECT',
            obj: {
              id: crypto.randomUUID(),
              type: 'arrow',
              points: [state.arrowDraftTail.x, state.arrowDraftTail.y, xM, yM],
              style: (state.toolOption || 'pass') as 'pass' | 'run' | 'free',
              thickness: 3,
            },
          })
          dispatch({ type: 'SET_ARROW_DRAFT', tail: undefined })
        }
        break

      case 'zone':
        if (!state.zoneDraftCorner) {
          dispatch({ type: 'SET_ZONE_DRAFT', corner: { x: xM, y: yM } })
        } else {
          const x = Math.min(state.zoneDraftCorner.x, xM)
          const y = Math.min(state.zoneDraftCorner.y, yM)
          const width = Math.abs(xM - state.zoneDraftCorner.x)
          const height = Math.abs(yM - state.zoneDraftCorner.y)
          if (width > 0.1 && height > 0.1) {
            dispatch({
              type: 'PLACE_OBJECT',
              obj: {
                id: crypto.randomUUID(),
                type: 'zone',
                x, y, width, height,
                color: '#2C7BE5',
                opacity: 0.25,
              },
            })
          }
          dispatch({ type: 'SET_ZONE_DRAFT', corner: undefined })
        }
        break

      default:
        break
    }
  }, [state.tool, state.toolOption, state.arrowDraftTail, state.zoneDraftCorner, layout])

  // We attach a click listener on the stage container div for placement tools
  // (FieldRenderer handles select-mode clicks internally)
  const handleCanvasAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (state.tool === 'select') return
    const rect = e.currentTarget.getBoundingClientRect()
    const stageX = e.clientX - rect.left
    const stageY = e.clientY - rect.top
    handleStageClick(stageX, stageY)
  }, [state.tool, handleStageClick])

  // ── Export PNG ───────────────────────────────────────────────────────────────
  function exportPng() {
    const stage = stageRef.current
    if (!stage) return
    const url = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' })
    const a = document.createElement('a')
    a.href = url
    a.download = slugify(state.title) + '.png'
    a.click()
  }

  // ── Tool palette definitions ─────────────────────────────────────────────────
  const playerOptions = PLAYER_ROLE_OPTIONS.map(o => ({ ...o }))
  const coneOptions = CONE_COLOR_OPTIONS.map(o => ({ ...o }))
  const goalOptions = [
    { value: 'mini-h', color: '#ffffff', label: 'Mini H' },
    { value: 'mini-v', color: '#dddddd', label: 'Mini V' },
    { value: 'full', color: '#aaaaaa', label: 'Full' },
  ]
  const arrowOptions = [
    { value: 'pass', color: '#E63946', label: 'Pass' },
    { value: 'run', color: '#2C7BE5', label: 'Run' },
    { value: 'free', color: '#FFD500', label: 'Free' },
  ]

  const teamName = drill.team_id
    ? (teams.find(t => t.id === drill.team_id)?.name ?? 'Team')
    : 'Club-wide'

  // ── Narrow screen guard ──────────────────────────────────────────────────────
  const [isWide, setIsWide] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsWide(mq.matches)
    const listener = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  if (!isWide) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-8 text-center">
        <p className="text-gray text-sm">
          Open on a tablet or computer to edit this drill. Use the read-only view link to view on phones.
        </p>
        <Link
          href="?readonly=1"
          className="px-4 py-2 rounded bg-green text-dark text-sm font-semibold"
        >
          View read-only
        </Link>
      </div>
    )
  }

  // ── Cursor style for placement tools ─────────────────────────────────────────
  const cursorStyle =
    state.tool === 'select' ? 'default' :
    state.tool === 'arrow' && state.arrowDraftTail ? 'crosshair' :
    state.tool === 'zone' && state.zoneDraftCorner ? 'crosshair' :
    'copy'

  return (
    <div className="flex flex-col h-screen bg-dark overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center gap-3 px-3 bg-dark-secondary border-b border-white/5 flex-shrink-0">
        <Link href="/dashboard/tactics" className="text-gray hover:text-white text-sm flex-shrink-0">
          ← Library
        </Link>

        <input
          type="text"
          value={state.title}
          placeholder="Untitled drill"
          onChange={e => dispatch({ type: 'SET_TITLE', title: e.target.value })}
          className="bg-transparent border-b border-white/10 focus:border-green outline-none text-white text-sm px-1 py-0.5 max-w-[200px] flex-shrink-0"
        />

        <span className="text-xs text-gray bg-dark px-2 py-0.5 rounded flex-shrink-0">
          {teamName}
        </span>

        <select
          value={state.visibility}
          onChange={e => dispatch({ type: 'SET_VISIBILITY', visibility: e.target.value as Visibility })}
          className="bg-dark border border-white/10 rounded px-2 py-0.5 text-xs text-gray flex-shrink-0"
        >
          {VISIBILITIES.map(v => (
            <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
          ))}
        </select>

        <select
          value={state.category}
          onChange={e => dispatch({ type: 'SET_CATEGORY', category: e.target.value as DrillCategory })}
          className="bg-dark border border-white/10 rounded px-2 py-0.5 text-xs text-gray flex-shrink-0"
        >
          {DRILL_CATEGORIES.map(c => (
            <option key={c} value={c}>{DRILL_CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Save status */}
        <span className={[
          'text-xs flex-shrink-0 transition-opacity',
          saveStatus === 'saved' ? 'text-green' :
          saveStatus === 'saving' ? 'text-gray animate-pulse' :
          saveStatus === 'error' ? 'text-red' : 'opacity-0',
        ].join(' ')}>
          {saveStatus === 'saved' ? 'Saved' :
           saveStatus === 'saving' ? 'Saving…' :
           saveStatus === 'error' ? 'Error saving' : ''}
        </span>

        <button
          onClick={exportPng}
          className="px-3 py-1 rounded bg-dark border border-white/10 text-xs text-gray hover:text-white flex-shrink-0"
        >
          Export PNG
        </button>
      </header>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left palette ─────────────────────────────────────────────────── */}
        <aside className="w-16 bg-dark-secondary border-r border-white/5 flex flex-col items-center py-2 gap-1 flex-shrink-0 relative">

          {/* Select */}
          <ToolBtn label="Select" shortcut="V" active={state.tool === 'select'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'select' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 0l16 12-7 1.5L9 20z"/></svg>
          </ToolBtn>

          {/* Player */}
          <div className="relative">
            <ToolBtn
              label="Player" shortcut="P"
              active={state.tool === 'player'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'player', option: state.toolOption })}
              onShiftClick={() => setOpenPicker(openPicker === 'player' ? null : 'player')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7z"/></svg>
            </ToolBtn>
            {openPicker === 'player' && (
              <SwatchPicker
                options={playerOptions}
                current={state.toolOption}
                onPick={v => dispatch({ type: 'SET_TOOL', tool: 'player', option: v })}
                onClose={() => setOpenPicker(null)}
              />
            )}
          </div>

          {/* Cone */}
          <div className="relative">
            <ToolBtn
              label="Cone" shortcut="C"
              active={state.tool === 'cone'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'cone', option: state.tool === 'cone' ? state.toolOption : 'orange' })}
              onShiftClick={() => setOpenPicker(openPicker === 'cone' ? null : 'cone')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 20h20z"/></svg>
            </ToolBtn>
            {openPicker === 'cone' && (
              <SwatchPicker
                options={coneOptions}
                current={state.toolOption}
                onPick={v => dispatch({ type: 'SET_TOOL', tool: 'cone', option: v })}
                onClose={() => setOpenPicker(null)}
              />
            )}
          </div>

          {/* Ball */}
          <ToolBtn label="Ball" shortcut="B" active={state.tool === 'ball'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'ball' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="12" cy="12" r="3"/></svg>
          </ToolBtn>

          {/* Goal */}
          <div className="relative">
            <ToolBtn
              label="Goal" shortcut="G"
              active={state.tool === 'goal'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'goal', option: state.tool === 'goal' ? state.toolOption : 'full' })}
              onShiftClick={() => setOpenPicker(openPicker === 'goal' ? null : 'goal')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="10"/></svg>
            </ToolBtn>
            {openPicker === 'goal' && (
              <SwatchPicker
                options={goalOptions}
                current={state.toolOption}
                onPick={v => dispatch({ type: 'SET_TOOL', tool: 'goal', option: v })}
                onClose={() => setOpenPicker(null)}
              />
            )}
          </div>

          {/* Arrow */}
          <div className="relative">
            <ToolBtn
              label="Arrow" shortcut="A"
              active={state.tool === 'arrow'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'arrow', option: state.tool === 'arrow' ? state.toolOption : 'pass' })}
              onShiftClick={() => setOpenPicker(openPicker === 'arrow' ? null : 'arrow')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12h12M14 8l4 4-4 4"/><line x1="4" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2"/><polyline points="12 8 16 12 12 16" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
            </ToolBtn>
            {openPicker === 'arrow' && (
              <SwatchPicker
                options={arrowOptions}
                current={state.toolOption}
                onPick={v => dispatch({ type: 'SET_TOOL', tool: 'arrow', option: v })}
                onClose={() => setOpenPicker(null)}
              />
            )}
          </div>

          {/* Zone */}
          <ToolBtn label="Zone" shortcut="Z" active={state.tool === 'zone'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'zone' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>
          </ToolBtn>

          {/* Divider */}
          <div className="w-8 h-px bg-white/10 my-1" />

          {/* Undo */}
          <ToolBtn label="Undo" shortcut="⌘Z" active={false} onClick={() => dispatch({ type: 'UNDO' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h10a5 5 0 0 1 0 10H3"/><polyline points="7 3 3 7 7 11" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
          </ToolBtn>

          {/* Redo */}
          <ToolBtn label="Redo" shortcut="⌘⇧Z" active={false} onClick={() => dispatch({ type: 'REDO' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7H11a5 5 0 0 0 0 10h10"/><polyline points="17 3 21 7 17 11" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
          </ToolBtn>

          {/* Clear */}
          {clearConfirm ? (
            <div className="absolute bottom-2 left-0 z-50 bg-dark-secondary border border-white/10 rounded-lg p-2 shadow-xl w-32 text-xs text-gray">
              <p className="mb-1">Clear all?</p>
              <div className="flex gap-1">
                <button
                  onClick={() => { dispatch({ type: 'CLEAR_ALL' }); setClearConfirm(false) }}
                  className="px-2 py-0.5 bg-red/20 text-red rounded border border-red/30 text-xs"
                >Yes</button>
                <button
                  onClick={() => setClearConfirm(false)}
                  className="px-2 py-0.5 bg-dark rounded border border-white/10 text-xs"
                >No</button>
              </div>
            </div>
          ) : (
            <ToolBtn label="Clear all" shortcut="" active={false} onClick={() => setClearConfirm(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </ToolBtn>
          )}

          {/* Draft indicators */}
          {state.arrowDraftTail && (
            <div className="absolute bottom-14 left-0 w-full px-1 text-center">
              <span className="text-[10px] text-green bg-dark-secondary rounded px-1 py-0.5">
                Click head
              </span>
            </div>
          )}
          {state.zoneDraftCorner && (
            <div className="absolute bottom-14 left-0 w-full px-1 text-center">
              <span className="text-[10px] text-green bg-dark-secondary rounded px-1 py-0.5">
                Click corner
              </span>
            </div>
          )}
        </aside>

        {/* ── Canvas area ───────────────────────────────────────────────────── */}
        <main
          ref={wrapRef}
          className="flex-1 overflow-hidden relative"
          style={{ cursor: cursorStyle }}
          onClick={handleCanvasAreaClick}
        >
          {canvasSize.w > 0 && canvasSize.h > 0 && (
            <FieldRenderer
              field={state.field}
              objects={state.objects}
              width={canvasSize.w}
              height={canvasSize.h}
              interactive={state.tool === 'select'}
              selectedIds={state.selectedIds}
              stageRef={stageRef}
              onSelect={(id, additive) => {
                if (id === null) {
                  dispatch({ type: 'SELECT', ids: [] })
                } else {
                  dispatch({ type: 'SELECT', ids: [id], additive })
                }
              }}
              onDragEnd={(id, x, y) => dispatch({ type: 'MOVE_OBJECT', id, x, y })}
            />
          )}

          {/* Arrow draft tail indicator */}
          {state.tool === 'arrow' && state.arrowDraftTail && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-dark-secondary/90 text-green text-xs px-3 py-1 rounded-full border border-green/30 pointer-events-none">
              Arrow: tail placed — click to place head
            </div>
          )}

          {/* Zone draft corner indicator */}
          {state.tool === 'zone' && state.zoneDraftCorner && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-dark-secondary/90 text-green text-xs px-3 py-1 rounded-full border border-green/30 pointer-events-none">
              Zone: first corner placed — click opposite corner
            </div>
          )}
        </main>

        {/* ── Right properties panel ────────────────────────────────────────── */}
        <PropsPanel
          state={state}
          dispatch={dispatch}
          collapsed={propsPanelCollapsed}
          onToggleCollapse={() => setPropsPanelCollapsed(v => !v)}
        />
      </div>
    </div>
  )
}
