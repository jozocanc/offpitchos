import type { BoardObject, Field } from '@/lib/tactics/object-schema'
import type { DrillCategory, Visibility } from '@/lib/tactics/drill-categories'

export type Tool = 'select' | 'player' | 'cone' | 'ball' | 'goal' | 'arrow' | 'zone'

export interface EditorState {
  field: Field
  objects: BoardObject[]
  selectedIds: string[]
  tool: Tool
  toolOption: string
  nextPlaceScale: number
  arrowDraftTail?: { x: number; y: number }
  zoneDraftCorner?: { x: number; y: number }
  title: string
  description: string
  category: DrillCategory
  visibility: Visibility
  past: Array<{ field: Field; objects: BoardObject[] }>
  future: Array<{ field: Field; objects: BoardObject[] }>
}

export type Action =
  | { type: 'SET_TOOL'; tool: Tool; option?: string }
  | { type: 'PLACE_OBJECT'; obj: BoardObject }
  | { type: 'BULK_PLACE'; objs: BoardObject[] }
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
  | { type: 'SET_NEXT_PLACE_SCALE'; scale: number }
  | { type: 'SET_ARROW_DRAFT'; tail?: { x: number; y: number } }
  | { type: 'SET_ZONE_DRAFT'; corner?: { x: number; y: number } }
  | { type: 'LOAD_FORMATION'; objects: BoardObject[] }
  | { type: 'ROTATE_FIELD'; direction: 'cw' | 'ccw' }
  | { type: 'RESTORE_SNAPSHOT'; field: Field; objects: BoardObject[] }

export const ZONE_COLOR_PRESETS = [
  '#2C7BE5', '#E63946', '#FFD500', '#00FF87',
  '#9333EA', '#F97316', '#06B6D4', '#F472B6',
]

export const PLAYER_ROLE_OPTIONS = [
  { value: 'red', color: '#E63946', label: 'Red' },
  { value: 'blue', color: '#2C7BE5', label: 'Blue' },
  { value: 'neutral', color: '#9CA3AF', label: 'Neutral' },
  { value: 'outside', color: '#6B7280', label: 'Outside' },
  { value: 'gk', color: '#FFD500', label: 'GK' },
  { value: 'coach', color: '#111111', label: 'Coach' },
]

export const CONE_COLOR_OPTIONS = [
  { value: 'orange', color: '#FF8C00', label: 'Orange' },
  { value: 'yellow', color: '#FFD500', label: 'Yellow' },
  { value: 'red', color: '#E63946', label: 'Red' },
  { value: 'blue', color: '#2C7BE5', label: 'Blue' },
  { value: 'white', color: '#F3F4F6', label: 'White' },
]
