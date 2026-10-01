'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { seedDemoData, clearDemoData, type DemoSeedState } from './demo-seed-actions'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'

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
  const { confirm, dialog } = useConfirm()
  const router = useRouter()
  const [loading, setLoading] = useState<'seed' | 'clear' | null>(null)

  if (!state.enabled) return null

  if (state.loaded) {
    return (
      <div className="mb-6 flex items-center justify-between gap-4 text-xs text-gray">
        <p>Sample schedule, trip and messages loaded so you can see a full week.</p>
        <button
          type="button"
          disabled={isPending}
          onClick={async () => {
            if (!(await confirm({
              title: 'Clear all sample data from this team?',
              confirmLabel: 'Clear',
              destructive: true,
            }))) return
            setLoading('clear')
            startTransition(async () => {
              try {
                const clrRes = await clearDemoData()
                if (!clrRes.ok) { toast(clrRes.error, 'error'); return }
                const result = clrRes.data
                toast(`Sample data cleared · ${result.rowsCleared} rows`, 'success')
                router.refresh()
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed to clear', 'error')
              } finally {
                setLoading(null)
              }
            })
          }}
          className="text-xs font-semibold text-gray underline underline-offset-2 hover:text-white transition-colors shrink-0 disabled:opacity-50"
        >
          {loading === 'clear' ? 'Clearing…' : 'Clear sample data'}
        </button>
        {dialog}
      </div>
    )
  }

  if (!state.emptyEnough) return null

  return (
    <div className="mb-6 rounded-2xl bg-dark-secondary border border-white/10 border-dashed p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold">Try it with a sample team</p>
        <p className="text-xs text-gray mt-0.5">
          Loads a 22-player college squad, 3 assistant coaches, and two weeks of training and games so you can explore.
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setLoading('seed')
          startTransition(async () => {
            try {
              const seedRes = await seedDemoData()
              if (!seedRes.ok) { toast(seedRes.error, 'error'); return }
              const result = seedRes.data
              toast(
                `Loaded ${result.playersAdded} players, ${result.coachesAdded} coaches, ${result.eventsAdded} events`,
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
        {loading === 'seed' ? 'Loading…' : 'Load sample team'}
      </button>
    </div>
  )
}
