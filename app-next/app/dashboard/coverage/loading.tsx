import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function CoverageLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-lg mt-2" />
        </div>
      </div>

      {/* Section label */}
      <Skeleton className="h-3 w-28 rounded-lg mb-3" />

      {/* Request list */}
      <div className="space-y-3 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Skeleton className="h-5 w-44 rounded-lg" />
                <div className="flex items-center gap-3 mt-2">
                  <Skeleton className="h-3 w-24 rounded-lg" />
                  <Skeleton className="h-3 w-20 rounded-lg" />
                </div>
                <Skeleton className="h-3 w-36 rounded-lg mt-2" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resolved section label */}
      <Skeleton className="h-3 w-32 rounded-lg mb-3" />

      {/* Resolved list */}
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Skeleton className="h-5 w-40 rounded-lg" />
                <Skeleton className="h-3 w-28 rounded-lg mt-2" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  )
}
