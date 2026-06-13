'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from '@/components/nav/Sidebar'
import { MobileSidebar } from '@/components/nav/MobileSidebar'
import { ToastContainerWrapper } from '@/components/ui/ToastContainerWrapper'
import { OnboardingFlow } from '@/components/features/onboarding/OnboardingFlow'
import { PageTransition } from '@/components/layout/PageTransition'
import { getLocalOnboardingState, shouldShowOnboarding } from '@/lib/onboarding'

interface AppShellProps {
  email: string
  children: ReactNode
}

export function AppShell({ email, children }: AppShellProps) {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const state = getLocalOnboardingState()
    return shouldShowOnboarding(state, false)
  })

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
