import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ResponsiveGridProps {
  children: ReactNode
  className?: string
  cols?: {
    mobile?: number
    tablet?: number
    desktop?: number
  }
  gap?: number
}

export function ResponsiveGrid({ 
  children, 
  className,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 4
}: ResponsiveGridProps) {
  const gridCols: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }

  const gapClasses: Record<number, string> = {
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    6: 'gap-6',
    8: 'gap-8',
  }

  return (
    <div
      className={cn(
        'grid',
        gridCols[cols.mobile || 1],
        `sm:${gridCols[cols.tablet || 2]}`,
        `lg:${gridCols[cols.desktop || 3]}`,
        gapClasses[gap] || 'gap-4',
        className
      )}
    >
      {children}
    </div>
  )
}

export interface ResponsiveContainerProps {
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

export function ResponsiveContainer({ 
  children, 
  className,
  size = 'lg'
}: ResponsiveContainerProps) {
  const sizeClasses = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-full',
  }

  return (
    <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', sizeClasses[size], className)}>
      {children}
    </div>
  )
}

export interface ResponsiveStackProps {
  children: ReactNode
  className?: string
  direction?: 'vertical' | 'horizontal-mobile' | 'horizontal-tablet'
  gap?: number
}

export function ResponsiveStack({ 
  children, 
  className,
  direction = 'vertical',
  gap = 4
}: ResponsiveStackProps) {
  const gapClasses: Record<number, string> = {
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    6: 'gap-6',
    8: 'gap-8',
  }

  const directionClasses = {
    vertical: 'flex flex-col',
    'horizontal-mobile': 'flex flex-row',
    'horizontal-tablet': 'flex flex-col sm:flex-row',
  }

  return (
    <div
      className={cn(
        directionClasses[direction],
        gapClasses[gap] || 'gap-4',
        className
      )}
    >
      {children}
    </div>
  )
}
