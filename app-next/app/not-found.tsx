import Link from 'next/link'
import Wordmark from '@/components/wordmark'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="text-center max-w-md">
        <Wordmark size="xl" className="mb-2" />
        <p className="text-6xl font-black text-green mt-8 mb-4">404</p>
        <p className="text-gray text-lg mb-8">Page not found</p>
        <Link
          href="/dashboard"
          className="inline-block bg-green text-dark font-bold py-3 px-8 rounded-xl uppercase tracking-wider text-sm hover:opacity-90 transition-opacity"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  )
}
