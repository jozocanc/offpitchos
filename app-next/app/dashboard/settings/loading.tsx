import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function SettingsLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-4 w-44 rounded-lg mt-2" />
      </div>

      <div className="space-y-6">
        {/* Account settings card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <Skeleton className="h-5 w-36 rounded-lg mb-4" />
          <div className="space-y-4">
            <div>
              <Skeleton className="h-3 w-20 rounded-lg mb-2" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <div>
              <Skeleton className="h-3 w-24 rounded-lg mb-2" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <div>
              <Skeleton className="h-3 w-16 rounded-lg mb-2" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>
        </div>

        {/* Club link card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <Skeleton className="h-5 w-40 rounded-lg mb-2" />
          <Skeleton className="h-4 w-64 rounded-lg mb-4 max-w-full" />
          <Skeleton className="h-4 w-36 rounded-lg" />
        </div>

        {/* Venues card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <Skeleton className="h-5 w-24 rounded-lg mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>

        {/* Danger zone card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <Skeleton className="h-5 w-28 rounded-lg mb-4" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </SkeletonPage>
  )
}
