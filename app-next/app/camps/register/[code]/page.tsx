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
      <main className="min-h-screen flex items-center justify-center bg-[#FAF7F2] px-4">
        <div className="w-full max-w-md text-center">
          <Wordmark size="xl" className="mb-2 text-[#0F1510]" />
          <div className="bg-[#FFFFFF] rounded-3xl p-8 mt-8 border border-[#E8E3DC] shadow-[0_8px_24px_rgba(15,21,16,0.06)]">
            <p className="text-red-600 text-lg font-semibold mb-2 tracking-[-0.02em]">Camp Not Found</p>
            <p className="text-[#5C6660] text-sm">
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
    <main className="min-h-screen bg-[#FAF7F2] px-4 py-12">
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <Wordmark size="xl" className="mb-2 text-[#0F1510]" />
          <p className="text-[#5C6660] text-xs uppercase tracking-[0.14em] font-semibold">Camp Registration</p>
        </div>

        <div className="bg-[#FFFFFF] rounded-3xl p-8 border border-[#E8E3DC] shadow-[0_8px_24px_rgba(15,21,16,0.06)] mb-6">
          <h2 className="text-2xl font-semibold text-[#0F1510] mb-2 tracking-[-0.02em]">{camp.title}</h2>
          {camp.description && (
            <p className="text-[#1F4E3D] font-semibold text-sm mb-4">{camp.description}</p>
          )}

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-[#5C6660] text-sm">Dates</span>
              <span className="text-[#0F1510] font-semibold text-sm">{camp.date}{camp.endDate && camp.endDate !== camp.date ? ` – ${camp.endDate}` : ''}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C6660] text-sm">Daily Hours</span>
              <span className="text-[#0F1510] font-semibold text-sm">{camp.startTime} – {camp.endTime}</span>
            </div>
            {camp.team && (
              <div className="flex items-center justify-between">
                <span className="text-[#5C6660] text-sm">Team</span>
                <span className="text-[#0F1510] font-semibold text-sm">
                  {camp.team}
                  {camp.ageGroup && <span className="text-[#5C6660] ml-1">({camp.ageGroup})</span>}
                </span>
              </div>
            )}
            {camp.venue && (
              <div className="flex items-center justify-between">
                <span className="text-[#5C6660] text-sm">Location</span>
                <span className="text-[#0F1510] font-semibold text-sm">{camp.venue}</span>
              </div>
            )}
            {camp.address && (
              <div className="flex justify-end">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(camp.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#1F4E3D] hover:text-[#2D6B56] font-semibold transition-colors"
                >
                  Open in Maps →
                </a>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[#5C6660] text-sm">Fee</span>
              <span className="text-[#1F4E3D] font-semibold text-sm">{fee}</span>
            </div>
            {camp.spotsLeft !== null && (
              <div className="flex items-center justify-between">
                <span className="text-[#5C6660] text-sm">Spots Left</span>
                <span className={`font-semibold text-sm ${camp.spotsLeft <= 5 ? 'text-red-600' : 'text-[#0F1510]'}`}>
                  {camp.spotsLeft} of {camp.capacity}
                </span>
              </div>
            )}
          </div>

          {camp.isFull ? (
            <div className="text-center py-6">
              <p className="text-red-600 font-semibold text-lg tracking-[-0.02em]">This camp is full</p>
              <p className="text-[#5C6660] text-sm mt-2">Contact the club to be added to the waitlist.</p>
            </div>
          ) : (
            <RegisterForm campDetailId={camp.detailId} feeCents={camp.feeCents} />
          )}
        </div>

        <p className="text-center text-[#5C6660] text-xs">
          Powered by <span className="text-[#0F1510] font-semibold">OffPitchOS</span>
        </p>
      </div>
    </main>
  )
}
