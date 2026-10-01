import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function AnalyticsLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-4 w-56 rounded-lg mt-2 max-w-full" />
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-10 w-20 rounded-lg" />
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <Skeleton className="h-3 w-16 rounded mb-3" />
            <Skeleton className="h-8 w-12 rounded" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <Skeleton className="h-4 w-40 rounded mb-4" />
            <Skeleton className="h-[220px] rounded" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  )
}
