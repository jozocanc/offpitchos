'use client'
import { formatDayKeyShort } from '@/lib/format-datetime'

import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

interface FeedbackPoint {
  id: string
  category: string
  rating: number | null
  created_at: string
}

const CATEGORY_COLORS: Record<string, string> = {
  technical: '#00FF87',
  tactical:  '#60A5FA',
  physical:  '#F472B6',
  attitude:  '#FBBF24',
  general:   '#A78BFA',
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: 'Technical',
  tactical:  'Tactical',
  physical:  'Physical',
  attitude:  'Attitude',
  general:   'General',
}

// Bucket feedback by yyyy-mm-dd so multiple notes on the same day average
// into one point. A line chart with two-points-per-day looks like noise.
function bucketByDay(rows: FeedbackPoint[]) {
  const grouped = new Map<string, Record<string, { sum: number; count: number }>>()
  for (const r of rows) {
    if (r.rating == null) continue
    const day = r.created_at.slice(0, 10)
    if (!grouped.has(day)) grouped.set(day, {})
    const bucket = grouped.get(day)!
    if (!bucket[r.category]) bucket[r.category] = { sum: 0, count: 0 }
    bucket[r.category].sum += r.rating
    bucket[r.category].count += 1
  }

  const days = Array.from(grouped.keys()).sort()
  return days.map(day => {
    const buckets = grouped.get(day)!
    const point: Record<string, number | string> = { day }
    for (const cat of Object.keys(buckets)) {
      point[cat] = Math.round((buckets[cat].sum / buckets[cat].count) * 10) / 10
    }
    return point
  })
}

function formatDay(day: string) {
  // `day` is already a calendar date, so it is formatted UTC-anchored rather
  // than parsed at local midnight (which differs on server vs client).
  return formatDayKeyShort(day)
}

export default function DevelopmentChart({ feedback }: { feedback: FeedbackPoint[] }) {
  const data = useMemo(() => bucketByDay(feedback), [feedback])
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of feedback) if (r.rating != null) set.add(r.category)
    return Array.from(set)
  }, [feedback])

  const [hidden, setHidden] = useState<Set<string>>(new Set())

  if (data.length < 2) {
    return (
      <div className="bg-dark-secondary border border-white/5 rounded-xl p-6 mb-6">
        <h3 className="font-bold text-white mb-2">Development Trend</h3>
        <p className="text-gray text-sm">
          Not enough rated feedback yet to chart progress. Add at least two ratings on different days to see the trend line.
        </p>
      </div>
    )
  }

  function toggle(cat: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-white">Development Trend</h3>
          <p className="text-xs text-gray mt-0.5">Average rating per category over time (1–5)</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {allCategories.map(cat => {
            const isHidden = hidden.has(cat)
            return (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={`text-xs font-semibold px-2 py-1 rounded-full border transition-opacity ${
                  isHidden ? 'opacity-30' : 'opacity-100'
                }`}
                style={{
                  color: CATEGORY_COLORS[cat] ?? '#fff',
                  borderColor: (CATEGORY_COLORS[cat] ?? '#fff') + '40',
                  backgroundColor: (CATEGORY_COLORS[cat] ?? '#fff') + '14',
                }}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-64 -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={formatDay}
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: '#0F172A',
                border: '1px solid #ffffff10',
                borderRadius: 12,
                color: '#fff',
                fontSize: 12,
              }}
              labelFormatter={(label) => formatDay(String(label))}
              formatter={(value, name) => [
                typeof value === 'number' ? value.toFixed(1) : String(value ?? '—'),
                CATEGORY_LABELS[String(name)] ?? String(name),
              ]}
            />
            <Legend wrapperStyle={{ display: 'none' }} />
            {allCategories.map(cat => (
              hidden.has(cat) ? null : (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={CATEGORY_COLORS[cat] ?? '#fff'}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
