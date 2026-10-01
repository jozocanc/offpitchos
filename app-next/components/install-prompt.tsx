'use client'

import { useEffect, useState } from 'react'
import { enablePushNotifications, isPushSupported } from '@/lib/push-client'

// Per-device dismissals. v2 resets the old one-line card's dismissals so every
// player sees the new step-by-step iPhone guide once.
const INSTALL_DISMISS_KEY = 'offpitchos_install_dismissed_v2'
const PUSH_DISMISS_KEY = 'offpitchos_push_card_dismissed_v1'

// localStorage throws in some private modes and when site data is blocked.
function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, '1') } catch { /* storage unavailable: dismissal lasts this visit only */ }
}

// Chrome/Edge fire this event when the page meets installability criteria.
// It isn't in lib.dom.d.ts so we type it locally.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Card = 'hidden' | 'chrome' | 'ios' | 'push' | 'push-done' | 'push-denied'

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone/iPad in a browser that can Add to Home Screen from the Share sheet. */
function detectIOS(): { ios: boolean; pushCapable: boolean } {
  const ua = navigator.userAgent
  // iPadOS 13+ reports a Mac user agent; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  // Safari, plus Chrome/Edge on iOS, which also expose Add to Home Screen.
  // In-app webviews (Instagram, Facebook, Google app) cannot install.
  const installable = /Safari/.test(ua) && !/Instagram|FBAN|FBAV|GSA\//.test(ua)
  // Web push on iPhone needs iOS 16.4+ AND the installed app.
  const m = ua.match(/OS (\d+)_(\d+)/)
  const major = m ? Number(m[1]) : 99
  const minor = m ? Number(m[2]) : 99
  return { ios: ios && installable, pushCapable: major > 16 || (major === 16 && minor >= 4) }
}

function ShareGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function AddGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function BellGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 -mr-2 -mt-2 w-11 h-11 flex items-center justify-center text-gray hover:text-white transition-colors"
      aria-label={label}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

/**
 * Dashboard card that gets a player from "opened the link" to "push is on":
 *
 * - iPhone, in the browser: iOS has no install prompt event, so a step-by-step
 *   Add to Home Screen guide (push on iPhone only works from the installed app).
 * - Chrome / Edge / Android: captures `beforeinstallprompt` and fires the
 *   browser's native installer on tap.
 * - Installed (standalone) with notification permission still "default": a
 *   one-tap "Turn on notifications" card. Never shown once granted or denied.
 *
 * Each card remembers its dismissal per device. Renders nothing on SSR.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [card, setCard] = useState<Card>('hidden')
  const [iosPushCapable, setIosPushCapable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Installed: the only thing left to offer is notifications.
    if (isStandalone()) {
      if (isPushSupported() && Notification.permission === 'default' && !readFlag(PUSH_DISMISS_KEY)) {
        // One-shot client-only detection (no window on SSR); never cascades.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCard('push')
      }
      return
    }

    if (readFlag(INSTALL_DISMISS_KEY)) return

    const { ios, pushCapable } = detectIOS()
    if (ios) {
      setIosPushCapable(pushCapable)
      setCard('ios')
      return
    }

    // Chrome/Edge/Android: the browser will show its own installer on demand,
    // as long as .prompt() runs inside a user gesture.
    function handler(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setCard('chrome')
    }
    // Installed through the browser's own menu instead of our button.
    function installed() {
      setCard('hidden')
      writeFlag(INSTALL_DISMISS_KEY)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  function dismissInstall() {
    writeFlag(INSTALL_DISMISS_KEY)
    setCard('hidden')
  }

  function dismissPush() {
    writeFlag(PUSH_DISMISS_KEY)
    setCard('hidden')
  }

  async function handleChromeInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null)
      dismissInstall()
    }
  }

  async function handleEnablePush() {
    setBusy(true)
    setError(null)
    // No await before this call: iOS only shows the permission sheet from a
    // live tap.
    const res = await enablePushNotifications()
    setBusy(false)
    if (res.ok) {
      setCard('push-done')
      setTimeout(() => setCard(c => (c === 'push-done' ? 'hidden' : c)), 4000)
    } else if (res.permission === 'denied') {
      setCard('push-denied')
    } else {
      setError(res.error)
    }
  }

  if (card === 'hidden') return null

  if (card === 'chrome') {
    return (
      <div className="mb-6 bg-green/5 border border-green/20 rounded-2xl p-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apple-touch-icon.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Install OffPitchOS</p>
          <p className="text-xs text-gray mt-0.5 leading-snug">
            Home-screen app with notifications for bus times and schedule changes.
          </p>
        </div>
        <button
          onClick={handleChromeInstall}
          className="shrink-0 text-sm font-bold bg-green text-dark px-4 min-h-[44px] rounded-xl hover:opacity-90 transition-opacity"
        >
          Install
        </button>
        <button
          onClick={dismissInstall}
          className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center text-gray hover:text-white transition-colors"
          aria-label="Dismiss install prompt"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    )
  }

  if (card === 'ios') {
    const steps: { icon: React.ReactNode; title: React.ReactNode; hint: string }[] = [
      {
        icon: <ShareGlyph />,
        title: <>Tap the <strong>Share</strong> button</>,
        hint: 'The square with an arrow pointing up. In Safari on newer iPhones, tap ••• first.',
      },
      {
        icon: <AddGlyph />,
        title: <>Choose <strong>Add to Home Screen</strong></>,
        hint: 'Scroll down the list if you don’t see it, then tap Add.',
      },
      {
        // eslint-disable-next-line @next/next/no-img-element
        icon: <img src="/apple-touch-icon.png" alt="" width={24} height={24} className="w-6 h-6 rounded-md" />,
        title: <>Open <strong>OffPitchOS</strong> from your home screen</>,
        hint: iosPushCapable
          ? 'Then tap Turn on notifications. That’s it.'
          : 'It opens full screen, like a normal app.',
      },
    ]
    return (
      <div className="mb-6 bg-dark-secondary border border-green/20 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apple-touch-icon.png" alt="" width={44} height={44} className="w-11 h-11 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white leading-snug">Add OffPitchOS to your home screen</p>
            <p className="text-sm text-gray mt-1 leading-snug">
              {iosPushCapable
                ? 'On iPhone, notifications for bus times and schedule changes only work from the home-screen app. Takes 20 seconds.'
                : 'Get a one-tap home-screen app for your schedule and team messages.'}
            </p>
          </div>
          <DismissButton onClick={dismissInstall} label="Dismiss install guide" />
        </div>

        <ol className="mt-4 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 bg-dark rounded-xl px-3 py-3">
              <span className="relative shrink-0 w-10 h-10 rounded-xl bg-dark-secondary border border-white/10 text-green flex items-center justify-center">
                {s.icon}
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-green text-dark-secondary text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-sm text-white leading-snug">{s.title}</p>
                <p className="text-xs text-gray mt-0.5 leading-snug">{s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  // Push cards (installed app only).
  return (
    <div className="mb-6 bg-green/5 border border-green/20 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-11 h-11 rounded-xl bg-green text-dark-secondary flex items-center justify-center">
          <BellGlyph />
        </span>
        <div className="flex-1 min-w-0">
          {card === 'push' && (
            <>
              <p className="text-base font-bold text-white leading-snug">Turn on notifications</p>
              <p className="text-sm text-gray mt-1 leading-snug">
                Know the second the bus time moves or practice changes.
              </p>
            </>
          )}
          {card === 'push-done' && (
            <>
              <p className="text-base font-bold text-white leading-snug">Notifications are on</p>
              <p className="text-sm text-gray mt-1 leading-snug">You&apos;ll get schedule changes and team messages on this phone.</p>
            </>
          )}
          {card === 'push-denied' && (
            <>
              <p className="text-base font-bold text-white leading-snug">Notifications are off</p>
              <p className="text-sm text-gray mt-1 leading-snug">
                To turn them on later, open your phone&apos;s Settings, then Notifications, then OffPitchOS.
              </p>
            </>
          )}
        </div>
        {card === 'push' && <DismissButton onClick={dismissPush} label="Not now" />}
        {card === 'push-denied' && <DismissButton onClick={() => setCard('hidden')} label="Close" />}
      </div>
      {card === 'push' && (
        <>
          <button
            onClick={handleEnablePush}
            disabled={busy}
            className="mt-4 w-full min-h-[48px] bg-green text-dark-secondary font-bold text-sm rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {busy ? 'Turning on...' : 'Turn on notifications'}
          </button>
          {error && <p className="text-xs text-red mt-2 leading-snug">{error}</p>}
        </>
      )}
    </div>
  )
}
