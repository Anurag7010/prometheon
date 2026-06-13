'use client'

import { useCallback, useState } from 'react'
import {
  type OnboardingStep,
  getLocalOnboardingState,
  setLocalOnboardingState,
  completeOnboarding,
  skipOnboarding,
} from '@/lib/onboarding'
import { WelcomeStep } from './WelcomeStep'
import { UploadStep } from './UploadStep'
import { AskStep } from './AskStep'

interface OnboardingFlowProps {
  onDone: () => void
}

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(() => {
    const saved = getLocalOnboardingState()
    return saved.step !== 'complete' ? saved.step : 'welcome'
  })
  const [documentId, setDocumentId] = useState(() => {
    const saved = getLocalOnboardingState()
    return saved.documentId ?? ''
  })
  const [documentName, setDocumentName] = useState(() => {
    const saved = getLocalOnboardingState()
    return saved.documentName ?? ''
  })

  const handleSkip = useCallback(async () => {
    await skipOnboarding()
    onDone()
  }, [onDone])

  const handleComplete = useCallback(async () => {
    await completeOnboarding()
    onDone()
  }, [onDone])

  const goTo = (s: OnboardingStep) => {
    setStep(s)
    setLocalOnboardingState({ step: s })
  }

  return (
    /* Full-screen overlay — covers the app until onboarding is done */
    <div
      className="fixed inset-0 z-50 bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to PrometheonAI"
    >
      {/* Skip button — always accessible */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 z-10 text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        aria-label="Skip onboarding setup"
      >
        Skip setup
      </button>

      {/* Step content with smooth crossfade */}
      <div className="h-full">
        {step === 'welcome' && (
          <WelcomeStep
            onNext={() => goTo('upload')}
            onSkip={handleSkip}
          />
        )}

        {step === 'upload' && (
          <UploadStep
            onComplete={(id, name) => {
              setDocumentId(id)
              setDocumentName(name)
              setLocalOnboardingState({ documentId: id, documentName: name })
              goTo('ask')
            }}
            onSkip={handleSkip}
            onBack={() => goTo('welcome')}
          />
        )}

        {step === 'ask' && (
          <AskStep
            documentId={documentId}
            documentName={documentName}
            onBack={() => goTo('upload')}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  )
}
