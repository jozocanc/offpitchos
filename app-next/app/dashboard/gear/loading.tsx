import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function GearLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-7 w-24 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-lg mt-2 max-w-full" />
      </div>

      {/* Club-wide stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <Skeleton className="h-3 w-20 rounded mb-3" />
            <Skeleton className="h-8 w-12 rounded" />
          </div>
        ))}
      </div>

      {/* Completion bar */}
      <div className="bg-dark-secondary border border-white/5 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="h-4 w-10 rounded" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      {/* Size breakdowns */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {[1, 2].map(i => (
          <div key={i} className="bg-dark rounded-lg p-3 border border-white/5">
            <Skeleton className="h-3 w-24 rounded mb-3" />
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map(j => (
                <Skeleton key={j} className="h-6 w-12 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Per-team rows */}
      <Skeleton className="h-5 w-24 rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Skeleton className="h-5 w-40 rounded-lg mb-2" />
                <Skeleton className="h-3 w-56 rounded-lg mb-2 max-w-full" />
                <Skeleton className="h-1.5 w-full max-w-md rounded-full" />
              </div>
              <Skeleton className="h-4 w-4 rounded shrink-0 ml-4" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  )
}
