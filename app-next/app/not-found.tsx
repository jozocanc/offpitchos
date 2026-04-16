import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
          OffPitch<span className="inline-block bg-green text-dark px-2 py-0.5 rounded-full text-[0.7em] font-black tracking-wide align-middle ml-1">OS</span>
        </h1>
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
