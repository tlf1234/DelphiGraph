import { cn } from '@/lib/utils'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
    xl: 'h-16 w-16 border-4',
  }

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-gray-700 border-t-blue-500',
        sizeClasses[size],
        className
      )}
    />
  )
}

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 flex flex-col items-center gap-4">
        <Spinner size="lg" />
        {message && (
          <p className="text-gray-300 text-sm">{message}</p>
        )}
      </div>
    </div>
  )
}

export function LoadingButton({ 
  isLoading, 
  children, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) {
  return (
    <button
      {...props}
      disabled={isLoading || props.disabled}
      className={cn(
        'relative',
        props.className
      )}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      )}
      <span className={cn(isLoading && 'opacity-0')}>
        {children}
      </span>
    </button>
  )
}
