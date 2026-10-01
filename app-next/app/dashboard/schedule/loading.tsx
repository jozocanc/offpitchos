import { Skeleton, SkeletonCard, SkeletonPage } from '@/components/skeleton'

// Mirrors schedule-client: header with Past / view toggle, filters, then
// day groups of event cards (badges, title, time, venue, right-side action).
export default function ScheduleLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-28 mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-10 w-36 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      <div className="space-y-8">
        {[3, 2].map((count, g) => (
          <div key={g}>
            <Skeleton className="h-4 w-28 mb-3" />
            <div className="space-y-3">
              {Array.from({ length: count }, (_, i) => (
                <SkeletonCard key={i} className="rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="h-5 w-12 rounded-full" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-5 w-48 max-w-full" />
                      <Skeleton className="h-3.5 w-32 mt-2" />
                      <Skeleton className="h-3.5 w-40 mt-2" />
                    </div>
                    <Skeleton className="h-8 w-28 rounded-full shrink-0" />
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                </SkeletonCard>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  )
}
