'use client'

import { useState, useEffect } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide'

export function useResponsive() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop')
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth

      if (width < 640) {
        setBreakpoint('mobile')
        setIsMobile(true)
        setIsTablet(false)
        setIsDesktop(false)
      } else if (width < 1024) {
        setBreakpoint('tablet')
        setIsMobile(false)
        setIsTablet(true)
        setIsDesktop(false)
      } else if (width < 1536) {
        setBreakpoint('desktop')
        setIsMobile(false)
        setIsTablet(false)
        setIsDesktop(true)
      } else {
        setBreakpoint('wide')
        setIsMobile(false)
        setIsTablet(false)
        setIsDesktop(true)
      }
    }

    // Initial check
    handleResize()

    // Add event listener
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isWide: breakpoint === 'wide',
  }
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    
    if (media.matches !== matches) {
      setMatches(media.matches)
    }

    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)

    return () => media.removeEventListener('change', listener)
  }, [matches, query])

  return matches
}
