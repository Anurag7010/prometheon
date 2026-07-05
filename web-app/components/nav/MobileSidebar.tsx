'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from './SignOutButton'
import { cn } from '@/lib/cn'

function IconMenu() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="size-5">
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="size-5">
      <line x1="4" y1="4" x2="16" y2="16" />
      <line x1="16" y1="4" x2="4" y2="16" />
    </svg>
  )
}

function FlameLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-6 shrink-0" style={{ color: '#D4572A' }}>
      <path
        d="M12 2c0 0-4.5 4.5-4.5 9 0 3 1.5 4.5 1.5 4.5s-.5-2.2 1.2-3.8c.5 2.2 2 3.8 2 6 1-1 1.5-2.5 1.5-4.2 1 1.5 1 3.5 1 3.5s2.3-2.3 2.3-4.5c0-3-2-5.5-2-5.5s.5 3.5-1.5 4.5C13.5 8 12 2 12 2z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/chat',      label: 'Neuro AI'  },
  { href: '/documents', label: 'Documents' },
  { href: '/agent',     label: 'Agent'     },
  { href: '/search',    label: 'Search'    },
  { href: '/settings',  label: 'Settings'  },
]

function UserAvatar({ email }: { email: string }) {
  const initials = (email.split('@')[0] ?? email).slice(0, 2).toUpperCase()
  return (
    <div
      className="size-7 rounded-full flex items-center justify-center text-xs font-semibold text-ember bg-ember/20 shrink-0"
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

export function MobileSidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0)
    return () => clearTimeout(t)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      {/* Top bar — visible on mobile */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-stone-mid/30 bg-forge-dark px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <FlameLogo />
          <div className="flex items-baseline gap-1">
            <span className="font-cormorant text-base font-light tracking-tight text-parchment">Prometheon</span>
            <sup className="text-ember text-[10px] font-sans">AI</sup>
          </div>
        </div>

        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          className="flex items-center justify-center size-9 rounded-md text-ash-gray hover:text-parchment hover:bg-parchment/5 transition-colors"
        >
          <IconMenu />
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ember-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-forge-dark border-r border-stone-mid/30',
          'flex flex-col transition-transform duration-300 ease-out',
          'lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal={open || undefined}
        aria-hidden={!open}
        aria-label="Navigation menu"
        inert={!open || undefined}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-stone-mid/30 px-4">
          <div className="flex items-center gap-2">
            <FlameLogo />
            <div className="flex items-baseline gap-1">
              <span className="font-cormorant text-base font-light tracking-tight text-parchment">Prometheon</span>
              <sup className="text-ember text-[10px] font-sans">AI</sup>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="flex items-center justify-center size-8 rounded-md text-ash-gray hover:text-parchment hover:bg-parchment/5 transition-colors"
          >
            <IconClose />
          </button>
        </div>

        {/* Back to landing */}
        <div className="px-3 pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 liquid-glass rounded-full px-3 py-1 text-xs text-parchment/50 hover:text-parchment/90 transition-colors duration-150"
          >
            ← Prometheon
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-1">
          {navItems.map(({ href, label }) => {
            const isActive = href === '/'
              ? pathname === '/'
              : pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-[150ms]',
                  isActive
                    ? 'bg-ember/12 text-parchment'
                    : 'text-ash-gray hover:bg-stone-mid/15 hover:text-parchment/80',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-stone-mid/30 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <UserAvatar email={email} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-parchment truncate">{email}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </div>
    </>
  )
}
