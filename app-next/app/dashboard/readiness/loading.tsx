import { Skeleton, SkeletonCard, SkeletonPage } from '@/components/skeleton'

export default function ReadinessLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-lg mt-2 max-w-full" />
      </div>
      <div className="flex gap-2 mb-6 overflow-hidden">
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[1, 2, 3, 4].map(i => (
          <SkeletonCard key={i} className="rounded-xl p-4">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-6 w-10" />
          </SkeletonCard>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <SkeletonCard key={i} className="rounded-xl p-4 flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24 mt-1.5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full shrink-0" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  )
}
