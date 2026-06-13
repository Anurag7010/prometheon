'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(true)
  const [displayedPathname, setDisplayedPathname] = useState(pathname)
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    const prevPathname = prevPathnameRef.current
    prevPathnameRef.current = pathname
    if (pathname === prevPathname) return undefined

    const fadeOut = setTimeout(() => setIsVisible(false), 0)
    const fadeIn = setTimeout(() => {
      setDisplayedPathname(pathname)
      setIsVisible(true)
    }, 100)
    return () => {
      clearTimeout(fadeOut)
      clearTimeout(fadeIn)
    }
  }, [pathname])

  return (
    <div className={cn('h-full transition-opacity duration-100', isVisible ? 'opacity-100' : 'opacity-0')}>
      {displayedPathname === pathname ? children : null}
    </div>
  )
}
