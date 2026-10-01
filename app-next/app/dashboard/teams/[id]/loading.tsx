import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function TeamDetailLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-4 w-24 rounded-lg mb-4" />
        <div className="flex items-center gap-3 mt-1">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-7 w-14 rounded-full" />
        </div>
        <Skeleton className="h-4 w-24 rounded-lg mt-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Members */}
        <div className="space-y-6">
          {/* Coaches section */}
          <div>
            <Skeleton className="h-5 w-20 rounded-lg mb-3" />
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div
                  key={i}
                  className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3"
                >
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-28 rounded-lg" />
                    <Skeleton className="h-3 w-14 rounded-lg mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Player accounts section */}
          <div>
            <Skeleton className="h-5 w-20 rounded-lg mb-3" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3"
                >
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-28 rounded-lg" />
                    <Skeleton className="h-3 w-14 rounded-lg mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Invite links */}
        <div>
          <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <Skeleton className="h-9 w-36 rounded-xl" />
            </div>
            <Skeleton className="h-4 w-full rounded-lg mb-5" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-28 rounded-lg" />
                <Skeleton className="h-7 w-16 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  )
}
