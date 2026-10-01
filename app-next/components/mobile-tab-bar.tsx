'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import NotificationBell from './notification-bell'
import type { NavItem } from './sidebar'

/** Shared with the desktop sidebar so both navs agree on what is "current". */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
}

// The four primary tabs per audience, in order. Everything else the role can
// see lands in the "More" sheet, so the tab bar never drifts from the sidebar.
const PLAYER_TABS = ['/dashboard', '/dashboard/schedule', '/dashboard/messages', '/dashboard/check-in']
const STAFF_TABS = ['/dashboard', '/dashboard/schedule', '/dashboard/teams', '/dashboard/messages']

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  )
}

function TabIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`flex items-center justify-center w-14 h-8 rounded-full transition-colors [&_svg]:w-[22px] [&_svg]:h-[22px] ${
        active ? 'bg-green/10 text-green' : 'text-gray'
      }`}
    >
      {children}
    </span>
  )
}

interface MobileTabBarProps {
  /** Already role-filtered (and Teams/Roster relabelled) by the sidebar. */
  items: NavItem[]
  isPlayer: boolean
  userEmail: string
  canSwitchRole: boolean
  activeRole: string
  onSwitchRole: (role: string) => void
}

export default function MobileTabBar({ items, isPlayer, userEmail, canSwitchRole, activeRole, onSwitchRole }: MobileTabBarProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // Close the sheet whenever the route changes (tab tap, back swipe, push
  // deep link). Adjusting state during render beats an effect here.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setMoreOpen(false)
  }

  // While the sheet is up: lock page scroll behind it and let Escape close it.
  useEffect(() => {
    if (!moreOpen) return
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const order = isPlayer ? PLAYER_TABS : STAFF_TABS
  const tabs = order
    .map(href => items.find(i => i.href === href && !i.disabled))
    .filter((i): i is NavItem => !!i)
  const moreItems = items.filter(i => !tabs.includes(i) && !i.disabled)
  const moreActive = moreOpen || moreItems.some(i => isNavItemActive(pathname, i.href))

  const tabClass = 'flex-1 min-w-0 h-[60px] flex flex-col items-center justify-center gap-1 select-none [-webkit-tap-highlight-color:transparent] active:scale-95 transition-transform'

  return (
    <>
      {/* More sheet. No transform on the open panel (only a one-shot entry
          animation) so the bell's fixed dropdown still positions against the
          viewport. */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="More">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="toast-enter absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto bg-dark-secondary rounded-t-3xl border-t border-white/10 shadow-2xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex justify-center pt-1 pb-3">
              <span className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            <div className="flex items-center justify-between gap-3 mb-4 px-1">
              <p className="text-sm text-gray truncate min-w-0">{userEmail}</p>
              <button
                onClick={() => setMoreOpen(false)}
                className="shrink-0 text-sm font-semibold text-green px-2 py-2 -mr-2"
              >
                Done
              </button>
            </div>

            {moreItems.length > 0 && (
              <nav className="grid grid-cols-3 gap-2 mb-4" aria-label="More pages">
                {moreItems.map(item => {
                  const active = isNavItemActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex flex-col items-center justify-center gap-1.5 min-h-[76px] rounded-2xl border px-2 text-center select-none [-webkit-tap-highlight-color:transparent] active:scale-95 transition-transform [&_svg]:w-[22px] [&_svg]:h-[22px] ${
                        active ? 'bg-green/10 border-green/30 text-green' : 'bg-dark border-white/5 text-white'
                      }`}
                    >
                      <span className={active ? 'text-green' : 'text-gray'}>{item.icon}</span>
                      <span className="text-xs font-semibold leading-tight">{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            )}

            <div className="rounded-2xl bg-dark border border-white/5 divide-y divide-white/5 mb-3">
              {canSwitchRole && (
                <div className="px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray mb-2">View as</p>
                  <div className="flex gap-1 p-1 rounded-xl bg-white/5">
                    {([['doc', 'Coach'], ['player', 'Player']] as const).map(([role, label]) => (
                      <button
                        key={role}
                        onClick={() => onSwitchRole(role)}
                        className={`flex-1 h-10 text-sm rounded-lg font-semibold transition-colors ${
                          activeRole === role ? 'bg-green text-dark' : 'text-gray'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between px-4 min-h-[52px]">
                <span className="text-sm font-medium text-white">Notifications</span>
                <NotificationBell />
              </div>
            </div>

            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="w-full min-h-[52px] rounded-2xl bg-dark border border-white/5 text-sm font-semibold text-red"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      {/* The bar itself */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-dark-secondary/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <div className="flex items-stretch px-1">
          {tabs.map(item => {
            const active = !moreOpen && isNavItemActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={tabClass}
              >
                <TabIcon active={active}>{item.icon}</TabIcon>
                <span className={`text-[11px] leading-none font-semibold truncate max-w-full ${active ? 'text-green' : 'text-gray'}`}>
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={tabClass}
          >
            <TabIcon active={moreActive}><MoreIcon /></TabIcon>
            <span className={`text-[11px] leading-none font-semibold ${moreActive ? 'text-green' : 'text-gray'}`}>More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
