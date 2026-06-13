'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Announces route changes to screen readers via an aria-live region.
// Without this, screen reader users have no indication that navigation occurred
// on client-side transitions — they remain on the old page conceptually.
export function AccessibilityWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const announceRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (announceRef.current) {
      // Brief timeout lets the new page render its title before we announce
      const id = setTimeout(() => {
        if (announceRef.current) {
          announceRef.current.textContent = `Navigated to ${document.title || pathname}`
        }
      }, 100)
      return () => clearTimeout(id)
    }
    return undefined
  }, [pathname])

  return (
    <>
      {/* aria-live="polite" announces after the current speech finishes — not mid-sentence */}
      {/* aria-atomic="true" reads the full region text, not just the changed portion */}
      <p
        ref={announceRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      {children}
    </>
  )
}
