import type { Field } from '@/lib/tactics/object-schema'

export interface FieldLayout {
  pxPerMeter: number
  fieldPxX: number
  fieldPxY: number
  fieldPxW: number
  fieldPxH: number
}

const MARGIN = 24

export function useFieldLayout(
  field: Field,
  width: number,
  height: number
): FieldLayout {
  const availW = width - MARGIN * 2
  const availH = height - MARGIN * 2

  const mW = field.orientation === 'horizontal' ? field.length_m : field.width_m
  const mH = field.orientation === 'horizontal' ? field.width_m : field.length_m

  const pxPerMeter = Math.min(availW / mW, availH / mH)

  const fieldPxW = mW * pxPerMeter
  const fieldPxH = mH * pxPerMeter

  const fieldPxX = (width - fieldPxW) / 2
  const fieldPxY = (height - fieldPxH) / 2

  return { pxPerMeter, fieldPxX, fieldPxY, fieldPxW, fieldPxH }
}

// helpers: convert field-meter coords to stage-pixel coords (orientation-aware)
export function mToPx(xM: number, yM: number, field: Field, layout: FieldLayout) {
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

// Inverse: stage-pixel coords → field-meter coords (orientation-aware)
export function pxToM(
  px: number, py: number, field: Field, layout: FieldLayout
): { xM: number; yM: number } {
  const dx = px - layout.fieldPxX
  const dy = py - layout.fieldPxY
  if (field.orientation === 'horizontal') {
    return { xM: dx / layout.pxPerMeter, yM: dy / layout.pxPerMeter }
  }
  // vertical: pixel-x → yM, pixel-y → xM
  return { xM: dy / layout.pxPerMeter, yM: dx / layout.pxPerMeter }
}

export function mLen(meters: number, layout: FieldLayout) {
  return meters * layout.pxPerMeter
}
