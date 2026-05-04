'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AGE_GROUPS } from '@/lib/constants'
import { completeOnboarding } from './actions'
import Wordmark from '@/components/wordmark'
import ImportWizard from '@/app/dashboard/roster-import/import-wizard'

export default function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [clubName, setClubName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [ageGroup, setAgeGroup] = useState<string>(AGE_GROUPS[0])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleNext() {
    if (!clubName.trim()) {
      setError('Club name is required')
      return
    }
    setError(null)
    setStep(2)
  }

  function handleSubmit() {
    if (!teamName.trim()) {
      setError('Team name is required')
      return
    }
    setError(null)

    const formData = new FormData()
    formData.set('clubName', clubName)
    formData.set('teamName', teamName)
    formData.set('ageGroup', ageGroup)

    startTransition(async () => {
      try {
        const res = await completeOnboarding(formData)
        if (res?.ok) {
          setStep(3)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (step === 3) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-dark px-4">
        <ImportWizard
          variant="onboarding"
          onComplete={() => router.push('/dashboard')}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Wordmark size="xl" />
          <p className="text-gray text-sm mt-2">Let&apos;s set up your club</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-green' : 'bg-dark-secondary'}`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-green' : 'bg-dark-secondary'}`} />
        </div>

        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold mb-1">Name your club</h2>
              <p className="text-gray text-sm mb-6">This is the club you&apos;ll manage on OffPitchOS.</p>

              <label className="block text-sm font-medium text-gray mb-2" htmlFor="clubName">
                Club name
              </label>
              <input
                id="clubName"
                type="text"
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
                placeholder="e.g. Riverside FC"
                className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
                autoFocus
              />

              {error && <p className="text-red text-sm mt-3">{error}</p>}

              <button
                onClick={handleNext}
                className="mt-6 w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                Next &rarr;
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <button
                onClick={() => { setStep(1); setError(null) }}
                className="text-gray text-sm mb-4 hover:text-white transition-colors flex items-center gap-1"
              >
                &larr; Back
              </button>

              <h2 className="text-xl font-bold mb-1">Create your first team</h2>
              <p className="text-gray text-sm mb-6">You can add more teams later from the dashboard.</p>

              <label className="block text-sm font-medium text-gray mb-2" htmlFor="teamName">
                Team name
              </label>
              <input
                id="teamName"
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. U12 Boys Elite"
                className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
                autoFocus
              />

              <label className="block text-sm font-medium text-gray mb-2" htmlFor="ageGroup">
                Age group
              </label>
              <select
                id="ageGroup"
                value={ageGroup}
                onChange={e => setAgeGroup(e.target.value)}
                className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none"
              >
                {AGE_GROUPS.map(ag => (
                  <option key={ag} value={ag}>{ag}</option>
                ))}
              </select>

              {error && <p className="text-red text-sm mt-3">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="mt-6 w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? 'Creating…' : 'Create Club'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-gray text-xs mt-6">Step {step} of 2</p>
      </div>
    </main>
  )
}
