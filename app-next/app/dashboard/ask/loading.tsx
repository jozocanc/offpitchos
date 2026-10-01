import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function AskLoading() {
  return (
    <SkeletonPage className="flex flex-col h-[100dvh] max-w-3xl mx-auto p-6 md:px-10 md:py-8">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-4 w-80 rounded-lg mt-2 max-w-full" />
      </div>

      {/* Welcome state placeholder */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full mb-4" />
        <Skeleton className="h-5 w-56 rounded-lg mb-2 max-w-full" />
        <Skeleton className="h-3 w-72 rounded-lg mb-6 max-w-full" />
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-8 w-36 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="pt-4 border-t border-white/5">
        <div className="flex gap-3">
          <Skeleton className="flex-1 h-12 rounded-xl" />
          <Skeleton className="h-12 w-16 rounded-xl" />
        </div>
      </div>
    </SkeletonPage>
  )
}
