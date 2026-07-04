'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from '@/components/nav/Sidebar'
import { MobileSidebar } from '@/components/nav/MobileSidebar'
import { ToastContainerWrapper } from '@/components/ui/ToastContainerWrapper'
import { OnboardingFlow } from '@/components/features/onboarding/OnboardingFlow'
import { PageTransition } from '@/components/layout/PageTransition'
import { getLocalOnboardingState, shouldShowOnboarding } from '@/lib/onboarding'
import { useAuth, getAccessToken } from '@/hooks/useAuth'

interface AppShellProps {
  email: string
  children: ReactNode
}

export function AppShell({ email, children }: AppShellProps) {
  // Restores _accessToken from the refresh cookie on mount.
  // isLoading is true until the first token refresh resolves.
  const { isLoading: authLoading } = useAuth()

  // Start false so SSR and initial hydration match — localStorage is client-only.
  // After mount (and after auth is ready), read real state and show onboarding if needed.
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    // Wait for auth to restore the token before checking onboarding state,
    // so the server call includes a valid Bearer header.
    if (authLoading) return

    const localState = getLocalOnboardingState()
    // Fast path: localStorage says complete — no need to hit the server.
    // State already starts false, so no setState needed here.
    if (localState.step === 'complete') {
      return
    }
    // Verify server state — catches the case where localStorage was cleared
    const token = getAccessToken()
    fetch('/api/onboarding/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { completed: boolean } | null) => {
        setShowOnboarding(shouldShowOnboarding(localState, data?.completed ?? false))
      })
      .catch(() => {
        setShowOnboarding(shouldShowOnboarding(localState, false))
      })
  }, [authLoading])

  return (
    <div className="flex h-screen overflow-hidden bg-ember-black">
      {/* Desktop sidebar — hidden on small screens */}
      <div className="hidden lg:flex h-full shrink-0">
        <Sidebar email={email} />
      </div>

      {/* Mobile top bar + drawer */}
      <MobileSidebar email={email} />

      {/* Page content */}
      <main className="flex-1 overflow-y-auto min-w-0 lg:pt-0 pt-14">
        <PageTransition>{children}</PageTransition>
      </main>

      <ToastContainerWrapper />

      {showOnboarding && (
        <OnboardingFlow onDone={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
