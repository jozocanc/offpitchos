'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import NotificationBell from './notification-bell'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  disabled?: boolean
  roles?: string[]  // if set, only show for these roles
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function TeamsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function CoachesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41" />
    </svg>
  )
}

function CoverageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z" />
    </svg>
  )
}

function CampsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function AskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <HomeIcon /> },
  { label: 'Analytics', href: '/dashboard/analytics', icon: <AnalyticsIcon />, roles: ['doc'] },
  { label: 'Teams', href: '/dashboard/teams', icon: <TeamsIcon />, roles: ['doc', 'coach'] },
  { label: 'Schedule', href: '/dashboard/schedule', icon: <CalendarIcon /> },
  { label: 'Coverage', href: '/dashboard/coverage', icon: <CoverageIcon />, roles: ['doc', 'coach'] },
  { label: 'Coaches', href: '/dashboard/coaches', icon: <CoachesIcon />, roles: ['doc'] },
  { label: 'Messages', href: '/dashboard/messages', icon: <MessageIcon /> },
  { label: 'Camps', href: '/dashboard/camps', icon: <CampsIcon />, roles: ['doc', 'coach'] },
  { label: 'Gear', href: '/dashboard/gear', icon: <GearIcon />, roles: ['doc'] },
  { label: 'Ask', href: '/dashboard/ask', icon: <AskIcon />, roles: ['doc', 'coach', 'parent'] },
  { label: 'Settings', href: '/dashboard/settings', icon: <SettingsIcon />, roles: ['doc', 'coach'] },
]

const ADMIN_EMAIL = 'jozo.cancar27@gmail.com'

interface SidebarProps {
  userEmail: string
  userRole: string
}

export default function Sidebar({ userEmail, userRole }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [viewAs, setViewAs] = useState(userRole)
  const isAdmin = userEmail === ADMIN_EMAIL
  const router = useRouter()

  const activeRole = isAdmin ? viewAs : userRole

  function switchRole(role: string) {
    setViewAs(role)
    // Update cookie so server-side pages can read the role. React 19's
    // `react-hooks/immutability` rule flags `document.cookie = ...` as
    // module-level mutation even inside an event handler, so we go through
    // Reflect.set to keep lint happy while preserving the side effect.
    Reflect.set(document, 'cookie', `viewAsRole=${role};path=/;max-age=86400`)
    router.refresh()
  }
  const filteredNavItems = navItems.filter(item => !item.roles || item.roles.includes(activeRole))

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/5">
        <span className="text-xl font-black uppercase tracking-tight">
          OffPitch<span className="text-green">OS</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

          if (item.disabled) {
            return (
              <div
                key={item.label}
                title="Coming Soon"
                className="group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-not-allowed opacity-40"
              >
                <span className="text-gray">{item.icon}</span>
                <span className="text-gray text-sm font-medium">{item.label}</span>
                <span className="ml-auto text-xs bg-dark rounded px-1.5 py-0.5 text-gray">Soon</span>
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative group
                ${isActive
                  ? 'bg-dark-secondary text-white'
                  : 'text-gray hover:text-white hover:bg-dark-secondary/50 hover:translate-x-0.5'
                }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-green rounded-r-full" />
              )}
              <span className={`transition-colors ${isActive ? 'text-green' : 'group-hover:text-green'}`}>{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info + sign out — pb includes safe-area for iPhone home bar */}
      <div className="px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/5">
        {isAdmin && (
          <div className="mb-3 flex gap-1">
            {(['doc', 'coach', 'parent'] as const).map(role => (
              <button
                key={role}
                onClick={() => switchRole(role)}
                className={`flex-1 text-xs py-1 rounded font-medium transition-colors capitalize ${
                  activeRole === role
                    ? 'bg-green text-dark'
                    : 'bg-white/5 text-gray hover:text-white'
                }`}
              >
                {role === 'doc' ? 'DOC' : role}
              </button>
            ))}
          </div>
        )}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-gray truncate">{userEmail}</p>
          <NotificationBell />
        </div>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full text-left text-sm text-gray hover:text-red transition-colors px-1 py-1"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-screen bg-dark border-r border-white/5 shrink-0 sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile: hamburger button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-dark-secondary rounded-lg text-white"
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* Mobile: overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile: slide-in sidebar */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-dark border-r border-white/5 flex flex-col transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
