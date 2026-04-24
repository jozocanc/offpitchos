'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { seedDemoData, clearDemoData, type DemoSeedState } from './demo-seed-actions'
import { useToast } from '@/components/toast'

interface Props {
  state: DemoSeedState
}

// Three visual states:
//   - hidden (env flag off OR user not a DOC)
//   - "Load demo data" button (env on, empty-enough club, not loaded)
//   - "Demo data loaded — [Clear]" banner (env on, already loaded)
// Nothing renders when the DOC has built real data but not seeded —
// we stay out of their way unless they explicitly want the demo path.
export default function DemoSeedButton({ state }: Props) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState<'seed' | 'clear' | null>(null)

  if (!state.enabled) return null

  if (state.loaded) {
    return (
      <div className="mb-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-yellow-400">Demo data loaded</p>
          <p className="text-xs text-gray mt-0.5">
            This club has seeded players, parents, coaches, and events for demo purposes.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!confirm('Clear all seeded demo data from this club?')) return
            setLoading('clear')
            startTransition(async () => {
              try {
                const result = await clearDemoData()
                toast(`Demo data cleared · ${result.rowsCleared} rows`, 'success')
                router.refresh()
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed to clear', 'error')
              } finally {
                setLoading(null)
              }
            })
          }}
          className="text-xs font-bold text-yellow-400 hover:opacity-80 transition-opacity shrink-0 disabled:opacity-50"
        >
          {loading === 'clear' ? 'Clearing…' : 'Clear demo data'}
        </button>
      </div>
    )
  }

  if (!state.emptyEnough) return null

  return (
    <div className="mb-6 rounded-2xl bg-dark-secondary border border-white/10 border-dashed p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold">Try it with a sample club</p>
        <p className="text-xs text-gray mt-0.5">
          Loads 12 players, 3 parents, 2 coaches, and a week of events so you can explore.
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setLoading('seed')
          startTransition(async () => {
            try {
              const result = await seedDemoData()
              toast(
                `Loaded ${result.playersAdded} players, ${result.parentsAdded} parents, ${result.coachesAdded} coaches, ${result.eventsAdded} events`,
                'success',
              )
              router.refresh()
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Failed to seed', 'error')
            } finally {
              setLoading(null)
            }
          })
        }}
        className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-xs shrink-0 disabled:opacity-50"
      >
        {loading === 'seed' ? 'Loading…' : 'Load demo data'}
      </button>
    </div>
  )
}
