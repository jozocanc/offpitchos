export default function SettingsLoading() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-36 bg-dark-secondary rounded-lg" />
        <div className="h-4 w-44 bg-dark-secondary rounded-lg mt-2" />
      </div>

      <div className="space-y-6">
        {/* Account settings card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <div className="h-5 w-36 bg-white/5 rounded-lg mb-4" />
          <div className="space-y-4">
            <div>
              <div className="h-3 w-20 bg-white/5 rounded-lg mb-2" />
              <div className="h-10 w-full bg-white/5 rounded-xl" />
            </div>
            <div>
              <div className="h-3 w-24 bg-white/5 rounded-lg mb-2" />
              <div className="h-10 w-full bg-white/5 rounded-xl" />
            </div>
            <div>
              <div className="h-3 w-16 bg-white/5 rounded-lg mb-2" />
              <div className="h-10 w-full bg-white/5 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Club link card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <div className="h-5 w-40 bg-white/5 rounded-lg mb-2" />
          <div className="h-4 w-64 bg-white/5 rounded-lg mb-4" />
          <div className="h-4 w-36 bg-white/5 rounded-lg" />
        </div>

        {/* Venues card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <div className="h-5 w-24 bg-white/5 rounded-lg mb-4" />
          <div className="space-y-2">
            <div className="h-10 w-full bg-white/5 rounded-xl" />
            <div className="h-10 w-full bg-white/5 rounded-xl" />
          </div>
        </div>

        {/* Danger zone card */}
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <div className="h-5 w-28 bg-white/5 rounded-lg mb-4" />
          <div className="h-10 w-32 bg-white/5 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
