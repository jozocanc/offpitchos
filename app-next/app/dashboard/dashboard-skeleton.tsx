import { Skeleton, SkeletonCard } from '@/components/skeleton'

// Placeholder for the dashboard home body (attention panel, stat cards,
// upcoming schedule). Shared by app/dashboard/loading.tsx and the Suspense
// fallback in app/dashboard/page.tsx so both look the same.
export default function DashboardBodySkeleton({ userRole }: { userRole?: string }) {
  const isDoc = userRole === 'doc'
  const statCount = userRole === undefined || isDoc ? 3 : 2
  return (
    <div aria-hidden="true">
      {/* attention panel */}
      <SkeletonCard className="p-5 sm:p-6 mb-10">
        <div className="flex items-center justify-between mb-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className={`h-4 ${i === 1 ? 'w-2/3' : 'w-3/4'}`} />
                <Skeleton className="h-3 w-1/3 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* stat cards */}
      <div className={`grid grid-cols-1 ${statCount === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'} gap-3 sm:gap-4 mb-10`}>
        {Array.from({ length: statCount }, (_, i) => (
          <SkeletonCard key={i} className="p-4 sm:p-6">
            <Skeleton className="h-3.5 w-24 mb-4" />
            <Skeleton className="h-9 w-14" />
          </SkeletonCard>
        ))}
      </div>

      {/* upcoming schedule */}
      <Skeleton className="h-5 w-36 mb-4" />
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <SkeletonCard key={i} className="rounded-xl p-4 flex items-center gap-4">
            <div className="w-14 shrink-0 flex flex-col items-center gap-1.5">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-9" />
            </div>
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28 mt-2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full shrink-0" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
