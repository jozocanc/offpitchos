import { getCampByCode } from './actions'
import RegisterForm from './register-form'
import Wordmark from '@/components/wordmark'

export default async function PublicCampPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const camp = await getCampByCode(code)

  if (!camp || camp.status === 'cancelled') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0A1628] px-4">
        <div className="w-full max-w-md text-center">
          <Wordmark size="xl" className="mb-2" />
          <div className="bg-[#12203A] rounded-2xl p-8 mt-8 border border-red-500/20">
            <p className="text-red-400 text-lg font-bold mb-2">Camp Not Found</p>
            <p className="text-[#94A3B8] text-sm">
              {camp?.status === 'cancelled'
                ? 'This camp has been cancelled.'
                : 'This registration link is invalid. Check with your club for the correct link.'}
            </p>
          </div>
        </div>
      </main>
    )
  }

  const fee = camp.feeCents > 0 ? `$${(camp.feeCents / 100).toFixed(2)}` : 'Free'

  return (
    <main className="min-h-screen bg-[#0A1628] px-4 py-12">
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <Wordmark size="xl" className="mb-2" />
          <p className="text-[#94A3B8] text-sm">Camp Registration</p>
        </div>

        <div className="bg-[#12203A] rounded-2xl p-8 border border-white/10 shadow-2xl mb-6">
          <h2 className="text-2xl font-black text-white mb-2">{camp.title}</h2>
          {camp.description && (
            <p className="text-[#00FF87] font-semibold text-sm mb-4">{camp.description}</p>
          )}

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8] text-sm">Dates</span>
              <span className="text-white font-semibold text-sm">{camp.date}{camp.endDate && camp.endDate !== camp.date ? ` – ${camp.endDate}` : ''}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8] text-sm">Daily Hours</span>
              <span className="text-white font-semibold text-sm">{camp.startTime} – {camp.endTime}</span>
            </div>
            {camp.team && (
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8] text-sm">Team</span>
                <span className="text-white font-semibold text-sm">
                  {camp.team}
                  {camp.ageGroup && <span className="text-[#94A3B8] ml-1">({camp.ageGroup})</span>}
                </span>
              </div>
            )}
            {camp.venue && (
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8] text-sm">Location</span>
                <span className="text-white font-semibold text-sm">{camp.venue}</span>
              </div>
            )}
            {camp.address && (
              <div className="flex justify-end">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(camp.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#00FF87] hover:opacity-80 transition-opacity"
                >
                  Open in Maps →
                </a>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8] text-sm">Fee</span>
              <span className="text-[#00FF87] font-bold text-sm">{fee}</span>
            </div>
            {camp.spotsLeft !== null && (
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8] text-sm">Spots Left</span>
                <span className={`font-bold text-sm ${camp.spotsLeft <= 5 ? 'text-red-400' : 'text-white'}`}>
                  {camp.spotsLeft} of {camp.capacity}
                </span>
              </div>
            )}
          </div>

          {camp.isFull ? (
            <div className="text-center py-6">
              <p className="text-red-400 font-bold text-lg">This camp is full</p>
              <p className="text-[#94A3B8] text-sm mt-2">Contact the club to be added to the waitlist.</p>
            </div>
          ) : (
            <RegisterForm campDetailId={camp.detailId} feeCents={camp.feeCents} />
          )}
        </div>

        <p className="text-center text-[#94A3B8] text-xs">
          Powered by <span className="text-white font-bold">OffPitchOS</span>
        </p>
      </div>
    </main>
  )
}
