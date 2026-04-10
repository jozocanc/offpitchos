'use client'

import { useEffect, useState } from 'react'

// Stored in localStorage so a user who dismisses the card doesn't see it
// on every page load. Bumping the version here (e.g. to v2) resets all
// dismissals if we ever want to re-prompt everyone — otherwise dismissals
// are permanent per-device.
const DISMISS_KEY = 'offpitchos_install_dismissed_v1'

// Chrome/Edge fire this event when the page meets installability criteria.
// It isn't in lib.dom.d.ts so we type it locally.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'chrome' | 'ios-safari' | 'hidden'

/**
 * Shows a "Install OffPitchOS" CTA at the top of the dashboard. Three branches:
 *
 * - Chrome / Edge / Android Chrome: captures `beforeinstallprompt`, fires the
 *   browser's native installer when the user clicks.
 * - iOS Safari: iOS doesn't fire the event — we can only show instructions
 *   ("Tap Share → Add to Home Screen").
 * - Already installed (standalone display mode) or dismissed: renders nothing.
 *
 * The component is self-contained and gracefully no-ops on SSR.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState<Platform>('hidden')
  const [iosModalOpen, setIosModalOpen] = useState(false)

  useEffect(() => {
    // Previously dismissed on this device — never nag.
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    // Already installed: browser is running the app in standalone mode.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isStandalone) return

    // Detect iOS Safari specifically. iOS Chrome (CriOS) and Firefox (FxiOS)
    // are both WebKit-wrapped and can't install either — we only show
    // instructions for actual Safari where the Share sheet works.
    const ua = navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/.test(ua)
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    if (isIOS && isSafari) {
      // One-shot platform detection — can't compute during render (no window
      // on SSR) and never changes afterward, so no cascade risk despite the
      // React 19 rule complaining.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlatform('ios-safari')
    }

    // Listen for the Chrome/Edge/Android installability event. If this fires,
    // the browser is willing to show its native install UI on demand — we just
    // need to call .prompt() in response to a user gesture.
    function handler(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setPlatform('chrome')
    }
    window.addEventListener('beforeinstallprompt', handler)

    // If the user installs through the browser's own UI (not our button),
    // Chrome fires `appinstalled`. Hide the card when that happens.
    function installed() {
      setPlatform('hidden')
      localStorage.setItem(DISMISS_KEY, '1')
    }
    window.addEventListener('appinstalled', installed)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setPlatform('hidden')
  }

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null)
        setPlatform('hidden')
        localStorage.setItem(DISMISS_KEY, '1')
      }
      return
    }
    if (platform === 'ios-safari') {
      setIosModalOpen(true)
    }
  }

  if (platform === 'hidden') return null

  return (
    <>
      <div className="mb-6 bg-green/5 border border-green/20 rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">Install OffPitchOS</p>
          <p className="text-xs text-gray mt-0.5 leading-snug">
            {platform === 'ios-safari'
              ? 'Add it to your home screen for push notifications and full-screen access.'
              : 'Install the app for a home-screen shortcut and push notifications.'}
          </p>
        </div>
        <button
          onClick={handleInstallClick}
          className="shrink-0 text-xs font-bold bg-green text-dark px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          className="shrink-0 text-gray hover:text-white transition-colors p-1"
          aria-label="Dismiss install prompt"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {iosModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setIosModalOpen(false) }}
        >
          <div className="bg-dark-secondary rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold mb-1">Install on iPhone</h3>
            <p className="text-gray text-sm mb-5">Three taps in Safari and you&apos;re done.</p>
            <ol className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-green/20 text-green font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                <span className="text-white leading-snug">
                  Tap the <strong>Share</strong> button at the bottom of Safari
                  <span className="text-gray"> (the square with an arrow pointing up).</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-green/20 text-green font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                <span className="text-white leading-snug">
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-green/20 text-green font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                <span className="text-white leading-snug">
                  Tap <strong>Add</strong> — OffPitchOS will appear on your home screen and
                  launch in full-screen mode with push notifications.
                </span>
              </li>
            </ol>
            <button
              onClick={() => setIosModalOpen(false)}
              className="mt-6 w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
