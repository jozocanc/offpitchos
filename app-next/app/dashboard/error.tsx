'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-red text-xl font-bold">!</span>
        </div>
        <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
        <p className="text-gray text-sm mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="bg-green text-dark font-bold py-2.5 px-6 rounded-xl uppercase tracking-wider text-sm hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
