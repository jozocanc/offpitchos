'use client'
import { useEffect, useRef, useState } from 'react'
import FieldRenderer from '@/lib/tactics/field-renderer'
import type { DrillRow } from '@/lib/tactics/object-schema'
import CommentsPanel from './comments-panel'

export default function ReadonlyView({ drill }: { drill: DrillRow }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      setSize({ w, h: Math.round(w * 0.625) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-bold">{drill.title}</h1>
      {drill.description && (
        <p className="text-sm text-gray whitespace-pre-line">{drill.description}</p>
      )}
      <div ref={wrapRef} className="bg-dark-secondary rounded-lg overflow-hidden">
        <FieldRenderer field={drill.field} objects={drill.objects} width={size.w} height={size.h} />
      </div>
      {/* Comments */}
      <div className="bg-dark-secondary rounded-lg p-4 border border-white/5">
        <CommentsPanel
          drillId={drill.id}
          readonly
        />
      </div>
    </div>
  )
}
