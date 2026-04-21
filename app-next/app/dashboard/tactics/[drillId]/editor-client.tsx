'use client'

import React, {
  useReducer, useEffect, useRef, useCallback, useState,
} from 'react'
import Link from 'next/link'
import Konva from 'konva'
import FieldRenderer, { useFieldLayout, pxToM } from '@/lib/tactics/field-renderer'
import type { PreviewArrow, MarqueeRect, AlignmentGuide } from '@/lib/tactics/field-renderer'
import type { BoardObject, DrillRow, Field } from '@/lib/tactics/object-schema'
import {
  DRILL_CATEGORIES, DRILL_CATEGORY_LABELS, VISIBILITIES,
} from '@/lib/tactics/drill-categories'
import type { DrillCategory, Visibility } from '@/lib/tactics/drill-categories'
import { saveDrill, regenerateThumbnail } from './actions'
import { generateFormation, FORMATION_NAMES } from '@/lib/tactics/field-templates'
import type { FormationName } from '@/lib/tactics/field-templates'
import { PropsPanel } from './props-panel'
import {
  type EditorState,
  type Action,
  ZONE_COLOR_PRESETS,
  PLAYER_ROLE_OPTIONS,
  CONE_COLOR_OPTIONS,
} from './editor-types'

// ─── Module-level clipboard (Phase A: in-memory only) ─────────────────────────
let clipboard: BoardObject[] = []

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

    case 'BULK_PLACE':
      return withHistory(s, { field: s.field, objects: [...s.objects, ...a.objs] })

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

    case 'ROTATE_FIELD': {
      // Rotate field + all objects 90°. Swap width_m ↔ length_m, flip
      // orientation, and remap every (x, y) on the board.
      // CW: (x, y) → (width_m - y, x)      CCW: (x, y) → (y, length_m - x)
      const oldW = s.field.width_m
      const oldL = s.field.length_m
      const field: Field = {
        ...s.field,
        width_m: oldL,
        length_m: oldW,
        orientation: s.field.orientation === 'horizontal' ? 'vertical' : 'horizontal',
      }
      const cw = a.direction === 'cw'
      const mapPoint = (x: number, y: number): [number, number] =>
        cw ? [oldW - y, x] : [y, oldL - x]
      const objects: BoardObject[] = s.objects.map(o => {
        switch (o.type) {
          case 'arrow': {
            const pts: number[] = []
            for (let i = 0; i < o.points.length; i += 2) {
              const [nx, ny] = mapPoint(o.points[i], o.points[i + 1])
              pts.push(nx, ny)
            }
            return { ...o, points: pts }
          }
          case 'zone-line': {
            const [nx1, ny1] = mapPoint(o.points[0], o.points[1])
            const [nx2, ny2] = mapPoint(o.points[2], o.points[3])
            return { ...o, points: [nx1, ny1, nx2, ny2] }
          }
          case 'zone': {
            // Zone is axis-aligned; rotating swaps width/height and relocates top-left
            const [nx, ny] = mapPoint(o.x, o.y)
            const w = o.height
            const h = o.width
            return cw
              ? { ...o, x: nx - w, y: ny, width: w, height: h }
              : { ...o, x: nx, y: ny - h, width: w, height: h }
          }
          default: {
            const [nx, ny] = mapPoint(o.x, o.y)
            return { ...o, x: nx, y: ny }
          }
        }
      })
      return withHistory(s, { field, objects })
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

    case 'SET_NEXT_PLACE_SCALE':
      return { ...s, nextPlaceScale: a.scale }

    case 'SET_ARROW_DRAFT':
      return { ...s, arrowDraftTail: a.tail }

    case 'SET_ZONE_DRAFT':
      return { ...s, zoneDraftCorner: a.corner }

    case 'LOAD_FORMATION':
      return withHistory(s, { field: s.field, objects: a.objects })

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
      title={`${label}${shortcut ? ` (${shortcut})` : ''}${onShiftClick ? ' · right-click for options' : ''}`}
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onShiftClick?.() }}
      className={[
        'group relative w-12 h-12 flex items-center justify-center rounded-lg',
        'transition-all duration-150 ease-out',
        active
          ? 'bg-green/12 text-green ring-1 ring-green/30 shadow-[0_1px_2px_rgba(31,78,61,0.12)]'
          : 'text-gray hover:text-white hover:bg-dark hover:shadow-sm active:translate-y-[0.5px]',
      ].join(' ')}
    >
      {/* Green accent bar on active */}
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-green" />
      )}
      {children}
      {shortcut && (
        <span className="absolute bottom-0.5 right-1 text-[9px] text-gray/70 leading-none pointer-events-none select-none">
          {shortcut}
        </span>
      )}
      {onShiftClick && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green/40 pointer-events-none" />
      )}
    </button>
  )
}

// Palette section header — tiny uppercase label + thin divider
function PaletteSection({ label }: { label: string }) {
  return (
    <div className="w-full px-2 pt-2 pb-1 first:pt-0">
      <div className="text-[9px] font-semibold tracking-[0.08em] uppercase text-gray/70 text-center">
        {label}
      </div>
    </div>
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
  const [formationMenuOpen, setFormationMenuOpen] = useState(false)
  const [formationAnchor, setFormationAnchor] = useState<{ top: number; left: number } | null>(null)
  const formationBtnRef = useRef<HTMLButtonElement | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // Arrow preview: tracks current mouse position in field-meter coords
  const [previewHead, setPreviewHead] = useState<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const isMounted = useRef(false)

  // ── Marquee selection state ──────────────────────────────────────────────────
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const isMarqueeRef = useRef(false)

  // ── Snap + alignment guides ──────────────────────────────────────────────────
  const [snapEnabled, setSnapEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('tactics.snapEnabled')
    return stored === null ? true : stored === 'true'
  })
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])

  // ── Context menu ─────────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    id: string; clientX: number; clientY: number
  } | null>(null)

  const initState: EditorState = {
    field: drill.field,
    objects: drill.objects,
    selectedIds: [],
    tool: 'select',
    toolOption: 'red',
    nextPlaceScale: 1,
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

  // ── Thumbnail regen (debounced 10000ms, field/objects changes only) ──────────
  const thumbPayload = { field: state.field, objects: state.objects }
  const debouncedThumbPayload = useDebounce(thumbPayload, 10000)
  const isThumbnailMounted = useRef(false)

  useEffect(() => {
    if (!isThumbnailMounted.current) {
      isThumbnailMounted.current = true
      return
    }
    regenerateThumbnail(drill.id).catch((err) => {
      console.error('[thumbnail] regen failed:', err)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedThumbPayload])

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

      // ⌘A — select all (non-hidden)
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        // We need current objects; use a ref approach via a stateRef
        dispatch({ type: 'SELECT', ids: [] }) // trigger via reducer see below
        // We dispatch a special action — but since we can't read state here
        // directly, we use dispatchSelectAll which is set up below
        dispatchSelectAllRef.current?.()
        return
      }

      // ⌘C — copy
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelectionRef.current?.()
        return
      }

      // ⌘V — paste
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'v') {
        // Don't intercept if 'v' without ctrl would switch tool — ctrl+v = paste
        e.preventDefault()
        pasteClipboardRef.current?.()
        return
      }

      // ⌘D — duplicate
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelectionRef.current?.()
        return
      }

      if (ctrl) return // don't process ctrl-modified keys below

      switch (e.key) {
        case 'v': case 'V': dispatch({ type: 'SET_TOOL', tool: 'select' }); break
        case 'p': case 'P': dispatch({ type: 'SET_TOOL', tool: 'player' }); break
        case 'c': case 'C': dispatch({ type: 'SET_TOOL', tool: 'cone' }); break
        case 'b': case 'B': dispatch({ type: 'SET_TOOL', tool: 'ball' }); break
        case 'g': case 'G': dispatch({ type: 'SET_TOOL', tool: 'goal' }); break
        case 'a': case 'A': dispatch({ type: 'SET_TOOL', tool: 'arrow' }); break
        case 'z': case 'Z':
          dispatch({ type: 'SET_TOOL', tool: 'zone' })
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
          setContextMenu(null)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Callback refs for keyboard shortcuts (avoid stale closure) ───────────────
  const dispatchSelectAllRef = useRef<(() => void) | null>(null)
  const copySelectionRef = useRef<(() => void) | null>(null)
  const pasteClipboardRef = useRef<(() => void) | null>(null)
  const duplicateSelectionRef = useRef<(() => void) | null>(null)

  // ── Canvas click handler (placement) ────────────────────────────────────────
  const layout = useFieldLayout(state.field, canvasSize.w, canvasSize.h)

  // ── Arrow preview mouse tracking ────────────────────────────────────────────
  // Clear preview head when tool changes away from arrow or draft is cancelled
  useEffect(() => {
    if (state.tool !== 'arrow' || !state.arrowDraftTail) {
      setPreviewHead(null)
    }
  }, [state.tool, state.arrowDraftTail])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (state.tool !== 'arrow' || !state.arrowDraftTail) return
    const rect = e.currentTarget.getBoundingClientRect()
    const stageX = e.clientX - rect.left
    const stageY = e.clientY - rect.top
    if (rafRef.current !== null) return // throttle via RAF
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const { xM, yM } = pxToM(stageX, stageY, state.field, layout)
      setPreviewHead({ x: xM, y: yM })
    })
  }, [state.tool, state.arrowDraftTail, layout])

  const handleStageClick = useCallback((stageX: number, stageY: number) => {
    const { xM, yM } = pxToM(stageX, stageY, state.field, layout)

    switch (state.tool) {
      case 'player':
        dispatch({
          type: 'PLACE_OBJECT',
          obj: {
            id: crypto.randomUUID(),
            type: 'player',
            x: xM, y: yM,
            role: state.toolOption as 'red' | 'blue' | 'neutral' | 'outside' | 'gk' | 'coach',
            ...(state.nextPlaceScale !== 1 ? { scale: state.nextPlaceScale } : {}),
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
            ...(state.nextPlaceScale !== 1 ? { scale: state.nextPlaceScale } : {}),
          },
        })
        break

      case 'ball':
        dispatch({
          type: 'PLACE_OBJECT',
          obj: {
            id: crypto.randomUUID(),
            type: 'ball',
            x: xM, y: yM,
            ...(state.nextPlaceScale !== 1 ? { scale: state.nextPlaceScale } : {}),
          },
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
            ...(state.nextPlaceScale !== 1 ? { scale: state.nextPlaceScale } : {}),
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
              ...(state.nextPlaceScale !== 1 ? { scale: state.nextPlaceScale } : {}),
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
                color: state.toolOption || '#2C7BE5',
                opacity: 0.25,
                ...(state.nextPlaceScale !== 1 ? { scale: state.nextPlaceScale } : {}),
              },
            })
          }
          dispatch({ type: 'SET_ZONE_DRAFT', corner: undefined })
        }
        break

      default:
        break
    }
  }, [state.tool, state.toolOption, state.nextPlaceScale, state.arrowDraftTail, state.zoneDraftCorner, layout])

  // We attach a click listener on the stage container div for placement tools
  // (FieldRenderer handles select-mode clicks internally)
  const handleCanvasAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (state.tool === 'select') return
    const rect = e.currentTarget.getBoundingClientRect()
    const stageX = e.clientX - rect.left
    const stageY = e.clientY - rect.top
    handleStageClick(stageX, stageY)
  }, [state.tool, handleStageClick])

  // ── Copy / Paste / Duplicate ──────────────────────────────────────────────────
  // These use a stateRef pattern — the refs are updated each render so keyboard
  // shortcut handlers (which close over stale state) always get fresh values.
  const stateRef = useRef(state)
  stateRef.current = state

  dispatchSelectAllRef.current = useCallback(() => {
    const nonHidden = stateRef.current.objects
      .filter(o => !o.hidden)
      .map(o => o.id)
    dispatch({ type: 'SELECT', ids: nonHidden })
  }, [])

  copySelectionRef.current = useCallback(() => {
    const { objects, selectedIds } = stateRef.current
    const sel = new Set(selectedIds)
    clipboard = objects.filter(o => sel.has(o.id))
  }, [])

  function cloneWithOffset(o: BoardObject): BoardObject {
    const id = crypto.randomUUID()
    if (o.type === 'arrow') {
      return { ...o, id, points: o.points.map((v, i) => v + (i % 2 === 0 ? 2 : 2)) }
    }
    if (o.type === 'zone-line') {
      return { ...o, id, points: [o.points[0] + 2, o.points[1] + 2, o.points[2] + 2, o.points[3] + 2] as [number, number, number, number] }
    }
    return { ...o, id, x: o.x + 2, y: o.y + 2 }
  }

  pasteClipboardRef.current = useCallback(() => {
    if (clipboard.length === 0) return
    const cloned = clipboard.map(cloneWithOffset)
    dispatch({ type: 'BULK_PLACE', objs: cloned })
    dispatch({ type: 'SELECT', ids: cloned.map(o => o.id) })
  }, [])

  duplicateSelectionRef.current = useCallback(() => {
    const { objects, selectedIds } = stateRef.current
    if (selectedIds.length === 0) return
    const sel = new Set(selectedIds)
    clipboard = objects.filter(o => sel.has(o.id))
    const cloned = clipboard.map(cloneWithOffset)
    dispatch({ type: 'BULK_PLACE', objs: cloned })
    dispatch({ type: 'SELECT', ids: cloned.map(o => o.id) })
  }, [])

  // ── Snap helpers ──────────────────────────────────────────────────────────────
  function getSnapTargets(field: Field, objects: BoardObject[], excludeId: string) {
    const { length_m, width_m, orientation } = field
    const isH = orientation === 'horizontal'
    // In field-meter space:
    // x axis = length axis (if horizontal), width axis (if vertical)
    // y axis = width axis (if horizontal), length axis (if vertical)
    const lm = isH ? length_m : width_m
    const wm = isH ? width_m : length_m

    const snapX: number[] = []
    const snapY: number[] = []

    // Center line
    snapX.push(lm / 2)
    snapY.push(wm / 2)

    // 5m grid
    for (let v = 0; v <= lm; v += 5) snapX.push(v)
    for (let v = 0; v <= wm; v += 5) snapY.push(v)

    // Penalty area edges: 16.5m from each goal line
    snapX.push(16.5)
    snapX.push(lm - 16.5)
    // Penalty area width edges: (wm - 40.3)/2 and (wm + 40.3)/2
    const penHalfW = 40.3 / 2
    snapY.push(wm / 2 - penHalfW)
    snapY.push(wm / 2 + penHalfW)

    // Other objects' centers
    for (const o of objects) {
      if (o.id === excludeId || o.hidden) continue
      if (o.type === 'arrow' || o.type === 'zone-line') continue
      snapX.push(o.x)
      snapY.push(o.y)
    }

    return { snapX, snapY }
  }

  function computeSnap(
    xM: number, yM: number,
    field: Field, objects: BoardObject[], excludeId: string,
    pxPerMeter: number,
    fieldPxX: number, fieldPxY: number,
    fieldPxW: number, fieldPxH: number,
  ): { xM: number; yM: number; guides: AlignmentGuide[] } {
    if (!snapEnabled) return { xM, yM, guides: [] }
    const TOL_GRID = 0.3
    const TOL_OTHER = 0.5

    const { snapX, snapY } = getSnapTargets(field, objects, excludeId)

    let bestX = xM, bestXDist = TOL_OTHER
    for (const sx of snapX) {
      const d = Math.abs(xM - sx)
      const tol = (sx % 5 === 0) ? TOL_GRID : TOL_OTHER
      if (d < tol && d < bestXDist) { bestX = sx; bestXDist = d }
    }

    let bestY = yM, bestYDist = TOL_OTHER
    for (const sy of snapY) {
      const d = Math.abs(yM - sy)
      const tol = (sy % 5 === 0) ? TOL_GRID : TOL_OTHER
      if (d < tol && d < bestYDist) { bestY = sy; bestYDist = d }
    }

    const isH = field.orientation === 'horizontal'
    const guides: AlignmentGuide[] = []
    if (bestX !== xM) {
      if (isH) {
        // xM is a constant on the x-pixel axis → vertical guide line
        const px = fieldPxX + bestX * pxPerMeter
        guides.push({ points: [px, fieldPxY, px, fieldPxY + fieldPxH] })
      } else {
        // in vertical orientation, xM maps to pixel-y → horizontal guide line
        const py = fieldPxY + bestX * pxPerMeter
        guides.push({ points: [fieldPxX, py, fieldPxX + fieldPxW, py] })
      }
    }
    if (bestY !== yM) {
      if (isH) {
        // yM is a constant on the y-pixel axis → horizontal guide line
        const py = fieldPxY + bestY * pxPerMeter
        guides.push({ points: [fieldPxX, py, fieldPxX + fieldPxW, py] })
      } else {
        // in vertical orientation, yM maps to pixel-x → vertical guide line
        const px = fieldPxX + bestY * pxPerMeter
        guides.push({ points: [px, fieldPxY, px, fieldPxY + fieldPxH] })
      }
    }

    return { xM: bestX, yM: bestY, guides }
  }

  // ── Marquee pointer handlers ──────────────────────────────────────────────────
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (stateRef.current.tool !== 'select') return
    // Only start marquee on primary button on empty canvas (not on a Konva child)
    const target = e.target as HTMLElement
    // If the pointer is on the canvas element itself (stage background) start marquee
    if (target.tagName !== 'CANVAS') return
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    marqueeStartRef.current = { x: sx, y: sy }
    isMarqueeRef.current = false
    setMarquee(null)
  }, [])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!marqueeStartRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const start = marqueeStartRef.current
    const dx = sx - start.x
    const dy = sy - start.y
    if (!isMarqueeRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    isMarqueeRef.current = true
    setMarquee({
      x: Math.min(start.x, sx),
      y: Math.min(start.y, sy),
      width: Math.abs(dx),
      height: Math.abs(dy),
    })
  }, [])

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = marqueeStartRef.current
    if (!start || !isMarqueeRef.current) {
      marqueeStartRef.current = null
      isMarqueeRef.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const mRect = {
      x: Math.min(start.x, sx),
      y: Math.min(start.y, sy),
      width: Math.abs(sx - start.x),
      height: Math.abs(sy - start.y),
    }

    // Convert marquee px to field-meter and find intersecting objects
    const lay = layout
    const field = stateRef.current.field
    const topLeft = pxToM(mRect.x, mRect.y, field, lay)
    const bottomRight = pxToM(mRect.x + mRect.width, mRect.y + mRect.height, field, lay)
    // In vertical orientation pxToM swaps axes, so we need min/max to get proper bounds
    const marqX1 = Math.min(topLeft.xM, bottomRight.xM)
    const marqY1 = Math.min(topLeft.yM, bottomRight.yM)
    const marqX2 = Math.max(topLeft.xM, bottomRight.xM)
    const marqY2 = Math.max(topLeft.yM, bottomRight.yM)

    const hit: string[] = []
    for (const o of stateRef.current.objects) {
      if (o.hidden) continue
      let cx: number, cy: number
      if (o.type === 'arrow' || o.type === 'zone-line') {
        cx = (o.points[0] + o.points[2]) / 2
        cy = (o.points[1] + o.points[3]) / 2
      } else {
        cx = o.x; cy = o.y
      }
      if (cx >= marqX1 && cx <= marqX2 && cy >= marqY1 && cy <= marqY2) {
        hit.push(o.id)
      }
    }

    dispatch({ type: 'SELECT', ids: hit, additive: e.shiftKey })
    setMarquee(null)
    marqueeStartRef.current = null
    isMarqueeRef.current = false
  }, [layout])

  // ── Snap-on-drag handler (passed to FieldRenderer via onDragMove) ─────────────
  // We use a DOM approach: listen for Konva dragmove events on the stage
  const handleSnapDragMove = useCallback((id: string, stageX: number, stageY: number) => {
    const lay = layout
    const { xM, yM } = pxToM(stageX, stageY, stateRef.current.field, lay)
    const result = computeSnap(
      xM, yM,
      stateRef.current.field, stateRef.current.objects, id,
      lay.pxPerMeter, lay.fieldPxX, lay.fieldPxY, lay.fieldPxW, lay.fieldPxH,
    )
    setAlignmentGuides(result.guides)
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, snapEnabled])

  // Wire up Konva stage dragmove for snap via effect
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    function onDragMove(e: Konva.KonvaEventObject<DragEvent>) {
      const node = e.target
      // Only snap plain objects (not stage or layer)
      if (node === stage || node instanceof Konva.Layer) return
      const id = node.id()
      if (!id) return
      const result = handleSnapDragMove(id, node.x(), node.y())
      const { xM: curXM, yM: curYM } = pxToM(node.x(), node.y(), stateRef.current.field, layout)
      if (snapEnabled && (result.xM !== curXM || result.yM !== curYM)) {
        // Convert snapped meter coords back to pixel using mToPx logic inline
        // (we inline rather than import mToPx to avoid circular complexity)
        const { fieldPxX, fieldPxY, pxPerMeter } = layout
        const field = stateRef.current.field
        if (field.orientation === 'horizontal') {
          node.x(fieldPxX + result.xM * pxPerMeter)
          node.y(fieldPxY + result.yM * pxPerMeter)
        } else {
          node.x(fieldPxX + result.yM * pxPerMeter)
          node.y(fieldPxY + result.xM * pxPerMeter)
        }
      }
    }
    function onDragEnd() {
      setAlignmentGuides([])
    }
    stage.on('dragmove', onDragMove)
    stage.on('dragend', onDragEnd)
    return () => {
      stage.off('dragmove', onDragMove)
      stage.off('dragend', onDragEnd)
    }
  }, [layout, snapEnabled, handleSnapDragMove])

  // ── Context menu actions ──────────────────────────────────────────────────────
  const handleContextMenuAction = useCallback((action: string) => {
    const id = contextMenu?.id
    if (!id) return
    setContextMenu(null)
    const obj = stateRef.current.objects.find(o => o.id === id)
    if (!obj) return

    switch (action) {
      case 'lock':
        dispatch({ type: 'UPDATE_OBJECT', id, patch: { locked: !obj.locked } as Partial<BoardObject> })
        break
      case 'hide':
        dispatch({ type: 'UPDATE_OBJECT', id, patch: { hidden: !obj.hidden } as Partial<BoardObject> })
        dispatch({ type: 'SELECT', ids: [] })
        break
      case 'duplicate': {
        const newObj = cloneWithOffset(obj)
        dispatch({ type: 'PLACE_OBJECT', obj: newObj })
        dispatch({ type: 'SELECT', ids: [newObj.id] })
        break
      }
      case 'delete':
        dispatch({ type: 'SELECT', ids: [id] })
        dispatch({ type: 'DELETE_SELECTED' })
        break
    }
  }, [contextMenu])

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
  const zoneOptions = ZONE_COLOR_PRESETS.map(hex => ({
    value: hex,
    color: hex,
    label: hex,
  }))

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
      <header className="flex-shrink-0 bg-dark-secondary border-b border-white/5">
        <div className="px-4 py-2.5 flex items-center gap-3">
          {/* Library link */}
          <Link
            href="/dashboard/tactics"
            className="group flex items-center gap-1 text-gray hover:text-white text-sm flex-shrink-0 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover:-translate-x-0.5">
              <polyline points="15 6 9 12 15 18"/>
            </svg>
            <span>Library</span>
          </Link>

          <span className="w-px h-5 bg-white/10" />

          {/* Title */}
          <input
            type="text"
            value={state.title}
            placeholder="Untitled drill"
            onChange={e => dispatch({ type: 'SET_TITLE', title: e.target.value })}
            className="bg-transparent border-b border-transparent hover:border-white/15 focus:border-green outline-none text-white text-lg font-bold px-1 py-0.5 min-w-[160px] max-w-[360px] flex-shrink transition-colors placeholder:text-gray/40"
            style={{ width: `${Math.max(16, Math.min(36, state.title.length + 2))}ch` }}
          />

          {/* Metadata chips */}
          <div className="hidden md:flex items-center gap-1.5 text-xs flex-shrink-0">
            {/* Team chip */}
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-dark text-gray border border-white/5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="8" r="3"/>
                <circle cx="17" cy="9" r="2.5"/>
                <path d="M3 20c0-3 2.8-5 6-5s6 2 6 5"/>
                <path d="M14 18c.3-2 2-3.5 4-3.5s3.5 1.5 4 3.5"/>
              </svg>
              {teamName}
            </span>

            {/* Category chip (select styled as chip) */}
            <span className="inline-flex items-center rounded-md bg-dark border border-white/5">
              <span className="pl-2 py-1 text-gray">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
                </svg>
              </span>
              <select
                value={state.category}
                onChange={e => dispatch({ type: 'SET_CATEGORY', category: e.target.value as DrillCategory })}
                className="bg-transparent pr-2 py-1 text-gray hover:text-white text-xs outline-none cursor-pointer"
              >
                {DRILL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{DRILL_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </span>

            {/* Visibility chip */}
            <span className="inline-flex items-center rounded-md bg-dark border border-white/5">
              <span className="pl-2 py-1 text-gray">
                {state.visibility === 'private' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>
                ) : state.visibility === 'team' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 2.8-5 6-5s6 2 6 5"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
                )}
              </span>
              <select
                value={state.visibility}
                onChange={e => dispatch({ type: 'SET_VISIBILITY', visibility: e.target.value as Visibility })}
                className="bg-transparent pr-2 py-1 text-gray hover:text-white text-xs outline-none cursor-pointer capitalize"
              >
                {VISIBILITIES.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </span>

            {/* Notes toggle */}
            <button
              onClick={() => setNotesOpen(v => !v)}
              title="Toggle notes"
              className={[
                'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors',
                notesOpen
                  ? 'border-green/40 text-green bg-green/10'
                  : 'border-white/5 text-gray bg-dark hover:text-white',
              ].join(' ')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 5h16M4 10h16M4 15h10"/>
              </svg>
              Notes
            </button>
          </div>

          <div className="flex-1" />

          {/* Save status: dot + text */}
          <div className="flex items-center gap-1.5 flex-shrink-0" aria-live="polite">
            <span
              className={[
                'inline-block w-2 h-2 rounded-full transition-all',
                saveStatus === 'saved'  ? 'bg-green shadow-[0_0_6px_rgba(31,78,61,0.5)]' :
                saveStatus === 'saving' ? 'bg-gray animate-pulse' :
                saveStatus === 'error'  ? 'bg-red' : 'bg-transparent',
              ].join(' ')}
            />
            <span className={[
              'text-xs tabular-nums',
              saveStatus === 'saved'  ? 'text-white' :
              saveStatus === 'saving' ? 'text-white' :
              saveStatus === 'error'  ? 'text-red font-medium' : 'opacity-0',
            ].join(' ')}>
              {saveStatus === 'saved'  ? 'Saved' :
               saveStatus === 'saving' ? 'Saving…' :
               saveStatus === 'error'  ? 'Save failed' : ''}
            </span>
          </div>

          {/* Export menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setExportOpen(v => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-green text-[#ffffff] text-xs font-semibold hover:brightness-110 transition shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 3v12"/><polyline points="7 8 12 3 17 8"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
              </svg>
              Export
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={exportOpen ? 'rotate-180 transition-transform' : 'transition-transform'}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 w-44 bg-dark-secondary border border-white/10 rounded-lg shadow-xl py-1"
                onMouseLeave={() => setExportOpen(false)}
              >
                <button
                  onClick={() => { exportPng(); setExportOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray hover:text-white hover:bg-dark/60 flex items-center gap-2 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8" cy="9" r="1.5" fill="currentColor"/>
                    <path d="M21 16l-5-5-8 8"/>
                  </svg>
                  <span>Export PNG</span>
                  <span className="ml-auto text-[10px] text-gray/60">image</span>
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false)
                    window.open(`/api/tactics/pdf/drill/${drill.id}`, '_blank')
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray hover:text-white hover:bg-dark/60 flex items-center gap-2 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 3h8l4 4v14H7z"/><path d="M14 3v5h5"/>
                  </svg>
                  <span>Export PDF</span>
                  <span className="ml-auto text-[10px] text-gray/60">pdf</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Notes row */}
        {notesOpen && (
          <div className="px-4 pb-3">
            <textarea
              value={state.description}
              placeholder="Add notes about this drill…"
              rows={2}
              onChange={e => dispatch({ type: 'SET_DESCRIPTION', description: e.target.value })}
              className="w-full bg-dark border border-white/10 focus:border-green/50 outline-none rounded px-3 py-2 text-sm text-white resize-none placeholder:text-gray/50 transition-colors"
            />
          </div>
        )}
      </header>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left palette ─────────────────────────────────────────────────── */}
        <aside className="w-20 bg-dark-secondary border-r border-white/5 flex flex-col items-center py-1 flex-shrink-0 relative overflow-y-auto">

          {/* ── People ────────────────────────────────────────────────── */}
          <PaletteSection label="People" />

          {/* Select */}
          <ToolBtn label="Select" shortcut="V" active={state.tool === 'select'} onClick={() => dispatch({ type: 'SET_TOOL', tool: 'select' })}>
            {/* Cursor arrow */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"><path d="M6 3l13 10-6 1.2-1.2 6z"/></svg>
          </ToolBtn>

          {/* Player */}
          <div className="relative">
            <ToolBtn
              label="Player" shortcut="P"
              active={state.tool === 'player'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'player', option: state.toolOption })}
              onShiftClick={() => setOpenPicker(openPicker === 'player' ? null : 'player')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.2-6 7-6s7 2 7 6z"/></svg>
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

          {/* ── Equipment ─────────────────────────────────────────────── */}
          <PaletteSection label="Kit" />

          {/* Cone */}
          <div className="relative">
            <ToolBtn
              label="Cone" shortcut="C"
              active={state.tool === 'cone'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'cone', option: state.tool === 'cone' ? state.toolOption : 'orange' })}
              onShiftClick={() => setOpenPicker(openPicker === 'cone' ? null : 'cone')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="palConeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.95"/>
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0.7"/>
                  </linearGradient>
                </defs>
                <path d="M12 3L4 20h16z" fill="url(#palConeGrad)"/>
              </svg>
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="9" />
              <polygon points="12,7.5 15,10 14,13.5 10,13.5 9,10" fill="currentColor"/>
            </svg>
          </ToolBtn>

          {/* Goal */}
          <div className="relative">
            <ToolBtn
              label="Goal" shortcut="G"
              active={state.tool === 'goal'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'goal', option: state.tool === 'goal' ? state.toolOption : 'full' })}
              onShiftClick={() => setOpenPicker(openPicker === 'goal' ? null : 'goal')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="7" width="18" height="11"/>
                <line x1="7" y1="7" x2="7" y2="18"/>
                <line x1="17" y1="7" x2="17" y2="18"/>
                <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.35"/>
              </svg>
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

          {/* ── Movement ──────────────────────────────────────────────── */}
          <PaletteSection label="Move" />

          {/* Arrow */}
          <div className="relative">
            <ToolBtn
              label="Arrow" shortcut="A"
              active={state.tool === 'arrow'}
              onClick={() => dispatch({ type: 'SET_TOOL', tool: 'arrow', option: state.tool === 'arrow' ? state.toolOption : 'pass' })}
              onShiftClick={() => setOpenPicker(openPicker === 'arrow' ? null : 'arrow')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="14" x2="18" y2="14"/>
                <polyline points="13,9 18,14 13,19"/>
              </svg>
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

          {/* ── Zones ─────────────────────────────────────────────────── */}
          <PaletteSection label="Zones" />

          {/* Zone */}
          <div className="relative">
            <ToolBtn
              label="Zone" shortcut="Z"
              active={state.tool === 'zone'}
              onClick={() => dispatch({
                type: 'SET_TOOL', tool: 'zone',
                option: state.tool === 'zone' ? state.toolOption : (ZONE_COLOR_PRESETS[0]),
              })}
              onShiftClick={() => setOpenPicker(openPicker === 'zone' ? null : 'zone')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2">
                <rect x="3" y="5" width="18" height="14" rx="1"/>
              </svg>
            </ToolBtn>
            {openPicker === 'zone' && (
              <SwatchPicker
                options={zoneOptions}
                current={state.toolOption}
                onPick={v => dispatch({ type: 'SET_TOOL', tool: 'zone', option: v })}
                onClose={() => setOpenPicker(null)}
              />
            )}
          </div>

          {/* ── Formation ─────────────────────────────────────────────── */}
          <PaletteSection label="Squad" />

          <div className="relative" ref={el => {
            const btn = el?.querySelector('button') as HTMLButtonElement | null
            formationBtnRef.current = btn
          }}>
            <ToolBtn
              label="Formation" shortcut=""
              active={formationMenuOpen}
              onClick={() => {
                const rect = formationBtnRef.current?.getBoundingClientRect()
                if (rect) setFormationAnchor({ top: rect.top, left: rect.right + 4 })
                setFormationMenuOpen(v => !v)
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="4"  cy="12" r="1.8" />
                <circle cx="10" cy="6"  r="1.8" />
                <circle cx="10" cy="12" r="1.8" />
                <circle cx="10" cy="18" r="1.8" />
                <circle cx="16" cy="9"  r="1.8" />
                <circle cx="16" cy="15" r="1.8" />
                <circle cx="21" cy="12" r="1.8" />
              </svg>
            </ToolBtn>
            {formationMenuOpen && formationAnchor && (() => {
              // popover height estimate: header (~22px) + 8 items × 26px + padding ≈ 240
              const estimatedH = 240
              const bottomOverflow = formationAnchor.top + estimatedH - (typeof window !== 'undefined' ? window.innerHeight : 800) + 12
              const top = bottomOverflow > 0 ? Math.max(12, formationAnchor.top - bottomOverflow) : formationAnchor.top
              return (
                <>
                  <div className="fixed inset-0 z-[99]" onClick={() => setFormationMenuOpen(false)} />
                  <div
                    className="fixed z-[100] bg-[#0f1622] border border-white/15 rounded-lg py-1 shadow-2xl w-40"
                    style={{ top, left: formationAnchor.left }}
                  >
                    <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-white/60 font-semibold">Formations</div>
                    {FORMATION_NAMES.map((name: FormationName) => (
                      <button
                        key={name}
                        onClick={() => {
                          dispatch({
                            type: 'LOAD_FORMATION',
                            objects: generateFormation(name, state.field),
                          })
                          setFormationMenuOpen(false)
                        }}
                        className="w-full text-left px-3 py-1 text-sm text-white hover:bg-white/10 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>

          {/* ── Size slider (next-placement + selection) ─────────────── */}
          <div className="w-full px-2 pt-2 pb-1 mt-1 border-t border-white/5" title="Drag to resize selection. Release value becomes default size for new placements.">
            <div className="text-[9px] text-gray/80 text-center mb-1 font-semibold uppercase tracking-wider">Size</div>
            <input
              type="range" min="0.5" max="2.5" step="0.1"
              value={state.nextPlaceScale}
              onChange={e => {
                const s = Number(e.target.value)
                dispatch({ type: 'SET_NEXT_PLACE_SCALE', scale: s })
                state.selectedIds.forEach(id => dispatch({ type: 'UPDATE_OBJECT', id, patch: { scale: s } }))
              }}
              className="w-full h-1.5 accent-green"
            />
            <div className="text-[10px] text-gray text-center mt-0.5 tabular-nums">
              {state.nextPlaceScale.toFixed(1)}×
              {state.selectedIds.length > 0 && (
                <span className="block text-[9px] text-green/80">· {state.selectedIds.length} sel ·</span>
              )}
            </div>
          </div>

          {/* ── History ───────────────────────────────────────────────── */}
          <PaletteSection label="History" />

          <ToolBtn label="Undo" shortcut="⌘Z" active={false} onClick={() => dispatch({ type: 'UNDO' })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11a5 5 0 0 1 0 10H6"/><polyline points="7 3 3 7 7 11"/></svg>
          </ToolBtn>

          <ToolBtn label="Redo" shortcut="⌘⇧Z" active={false} onClick={() => dispatch({ type: 'REDO' })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7H10a5 5 0 0 0 0 10h8"/><polyline points="17 3 21 7 17 11"/></svg>
          </ToolBtn>

          {clearConfirm ? (
            <div className="relative w-full px-2 mt-1">
              <div className="bg-dark-secondary border border-white/10 rounded-lg p-2 shadow-xl text-xs text-gray">
                <p className="mb-1.5 text-center">Clear all?</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => { dispatch({ type: 'CLEAR_ALL' }); setClearConfirm(false) }}
                    className="flex-1 py-1 bg-red/20 text-red rounded border border-red/30 text-xs hover:bg-red/30 transition-colors"
                  >Yes</button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="flex-1 py-1 bg-dark rounded border border-white/10 text-xs hover:border-white/20 transition-colors"
                  >No</button>
                </div>
              </div>
            </div>
          ) : (
            <ToolBtn label="Clear all" shortcut="" active={false} onClick={() => setClearConfirm(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </ToolBtn>
          )}
        </aside>

        {/* ── Canvas area ───────────────────────────────────────────────────── */}
        <main
          ref={wrapRef}
          className="flex-1 overflow-hidden relative bg-dark"
          style={{
            cursor: cursorStyle,
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.08)',
          }}
          onClick={handleCanvasAreaClick}
          onMouseMove={handleCanvasMouseMove}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
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
                  if (!isMarqueeRef.current) dispatch({ type: 'SELECT', ids: [] })
                } else {
                  dispatch({ type: 'SELECT', ids: [id], additive })
                }
              }}
              onDragEnd={(id, x, y) => dispatch({ type: 'MOVE_OBJECT', id, x, y })}
              onContextMenu={(id, clientX, clientY) => setContextMenu({ id, clientX, clientY })}
              previewArrow={
                state.tool === 'arrow' && state.arrowDraftTail && previewHead
                  ? {
                      tail: state.arrowDraftTail,
                      head: previewHead,
                      style: state.toolOption || 'pass',
                    } as PreviewArrow
                  : undefined
              }
              marquee={marquee}
              alignmentGuides={alignmentGuides}
            />
          )}

          {/* ── Snap toggle pill ────────────────────────────────────────────── */}
          <button
            onClick={() => setSnapEnabled(v => {
              const next = !v
              localStorage.setItem('tactics.snapEnabled', String(next))
              return next
            })}
            title="Toggle snap to grid / objects"
            className={[
              'absolute bottom-4 right-4 inline-flex items-center gap-1.5',
              'rounded-full pl-3 pr-3.5 py-1.5 text-xs font-medium',
              'border transition-all shadow-sm select-none',
              snapEnabled
                ? 'bg-green/10 text-green border-green/30 hover:bg-green/15'
                : 'bg-dark-secondary text-gray border-white/10 hover:text-white hover:border-white/20',
            ].join(' ')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {snapEnabled ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="1"/>
                  <path d="M3 8h18M3 13h18M3 18h18M8 3v18M13 3v18M18 3v18" strokeOpacity="0.6"/>
                </>
              ) : (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="1"/>
                  <line x1="3" y1="21" x2="21" y2="3"/>
                </>
              )}
            </svg>
            {snapEnabled ? 'Snap on' : 'Snap off'}
          </button>

          {/* Bottom-left: arrow/zone draft indicator */}
          {(state.arrowDraftTail || state.zoneDraftCorner) && (
            <div className="absolute bottom-4 left-4 bg-dark-secondary/95 border border-green/30 text-green rounded-full text-xs px-3 py-1.5 font-medium shadow-sm pointer-events-none">
              {state.arrowDraftTail ? 'Click to place arrow head' : 'Click opposite corner'}
            </div>
          )}

          {/* ── Context menu ────────────────────────────────────────────────── */}
          {contextMenu && (() => {
            const obj = state.objects.find(o => o.id === contextMenu.id)
            if (!obj) return null
            // Position relative to main element
            const mainRect = wrapRef.current?.getBoundingClientRect()
            const menuX = mainRect ? contextMenu.clientX - mainRect.left : contextMenu.clientX
            const menuY = mainRect ? contextMenu.clientY - mainRect.top : contextMenu.clientY
            return (
              <div
                style={{ position: 'absolute', left: menuX, top: menuY, zIndex: 100 }}
                className="bg-dark-secondary border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px] text-sm"
                onMouseLeave={() => setContextMenu(null)}
              >
                <button
                  onClick={() => handleContextMenuAction('lock')}
                  className="w-full text-left px-3 py-1.5 text-gray hover:text-white hover:bg-dark/60 transition-colors"
                >
                  {obj.locked ? '🔓 Unlock' : '🔒 Lock'}
                </button>
                <button
                  onClick={() => handleContextMenuAction('hide')}
                  className="w-full text-left px-3 py-1.5 text-gray hover:text-white hover:bg-dark/60 transition-colors"
                >
                  {obj.hidden ? '👁 Show' : '🙈 Hide'}
                </button>
                <div className="h-px bg-white/10 my-1" />
                <button
                  onClick={() => handleContextMenuAction('duplicate')}
                  className="w-full text-left px-3 py-1.5 text-gray hover:text-white hover:bg-dark/60 transition-colors"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => handleContextMenuAction('delete')}
                  className="w-full text-left px-3 py-1.5 text-red hover:bg-red/10 transition-colors"
                >
                  Delete
                </button>
              </div>
            )
          })()}
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
