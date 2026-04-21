import { z } from 'zod'
import { DRILL_CATEGORIES, VISIBILITIES } from './drill-categories'

export const PlayerRole = z.enum(['red','blue','neutral','outside','gk','coach'])
export const ConeColor = z.enum(['orange','yellow','red','blue','white'])
export const GoalVariant = z.enum(['mini-h','mini-v','full'])
export const ArrowStyle = z.enum(['pass','run','free'])

const base = {
  id: z.string().min(1),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
}

export const PlayerObject = z.object({
  ...base, type: z.literal('player'),
  x: z.number(), y: z.number(),
  role: PlayerRole,
  number: z.number().int().min(0).max(99).optional(),
  position: z.string().max(8).optional(),
  scale: z.number().min(0.3).max(3).optional(),
})

export const ConeObject = z.object({
  ...base, type: z.literal('cone'),
  x: z.number(), y: z.number(),
  color: ConeColor,
  scale: z.number().min(0.3).max(3).optional(),
})

export const BallObject = z.object({
  ...base, type: z.literal('ball'),
  x: z.number(), y: z.number(),
  scale: z.number().min(0.3).max(3).optional(),
})

export const GoalObject = z.object({
  ...base, type: z.literal('goal'),
  x: z.number(), y: z.number(),
  variant: GoalVariant,
  rotation: z.number().optional(),
  scale: z.number().min(0.3).max(3).optional(),
})

export const ArrowObject = z.object({
  ...base, type: z.literal('arrow'),
  points: z.array(z.number()).min(4),
  style: ArrowStyle,
  thickness: z.number().min(1).max(8).optional(),
  scale: z.number().min(0.3).max(3).optional(),
})

export const ZoneObject = z.object({
  ...base, type: z.literal('zone'),
  x: z.number(), y: z.number(),
  width: z.number().positive(), height: z.number().positive(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  opacity: z.number().min(0).max(1),
  label: z.string().max(40).optional(),
  scale: z.number().min(0.3).max(3).optional(),
})

export const ZoneLineObject = z.object({
  ...base, type: z.literal('zone-line'),
  points: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  scale: z.number().min(0.3).max(3).optional(),
})

export const BoardObject = z.discriminatedUnion('type', [
  PlayerObject, ConeObject, BallObject, GoalObject,
  ArrowObject, ZoneObject, ZoneLineObject,
])
export type BoardObject = z.infer<typeof BoardObject>

export const FieldSchema = z.object({
  width_m: z.number().positive().max(120),
  length_m: z.number().positive().max(120),
  units: z.enum(['m','yd']),
  orientation: z.enum(['horizontal','vertical']),
  half_field: z.boolean(),
  style: z.enum(['schematic','realistic']),
})
export type Field = z.infer<typeof FieldSchema>

export const DrillDocSchema = z.object({
  field: FieldSchema,
  objects: z.array(BoardObject),
})
export type DrillDoc = z.infer<typeof DrillDocSchema>

export const DrillRowSchema = z.object({
  id: z.uuid(),
  club_id: z.uuid(),
  team_id: z.uuid().nullable(),
  created_by: z.uuid(),
  title: z.string(),
  description: z.string(),
  category: z.enum(DRILL_CATEGORIES),
  visibility: z.enum(VISIBILITIES),
  field: FieldSchema,
  objects: z.array(BoardObject),
  thumbnail_path: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type DrillRow = z.infer<typeof DrillRowSchema>
