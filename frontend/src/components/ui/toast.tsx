'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ToastProps {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'error' | 'success' | 'warning'
  duration?: number
  onClose: (id: string) => void
}

export function Toast({ id, title, description, variant = 'default', duration = 5000, onClose }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id)
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  const variantStyles = {
    default: 'bg-gray-800 border-gray-700',
    error: 'bg-red-900/90 border-red-700',
    success: 'bg-green-900/90 border-green-700',
    warning: 'bg-yellow-900/90 border-yellow-700',
  }

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-lg border p-4 shadow-lg',
        'animate-in slide-in-from-right-full',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {title && (
            <div className="text-sm font-semibold text-white mb-1">
              {title}
            </div>
          )}
          {description && (
            <div className="text-sm text-gray-300">
              {description}
            </div>
          )}
        </div>
        <button
          onClick={() => onClose(id)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export interface ToastContextValue {
  toasts: ToastProps[]
  addToast: (toast: Omit<ToastProps, 'id' | 'onClose'>) => void
  removeToast: (id: string) => void
  error: (title: string, description?: string) => void
  success: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = React.useCallback((toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substring(7)
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }])
  }, [removeToast])

  const error = React.useCallback((title: string, description?: string) => {
    addToast({ title, description, variant: 'error' })
  }, [addToast])

  const success = React.useCallback((title: string, description?: string) => {
    addToast({ title, description, variant: 'success' })
  }, [addToast])

  const warning = React.useCallback((title: string, description?: string) => {
    addToast({ title, description, variant: 'warning' })
  }, [addToast])

  const value = React.useMemo(
    () => ({ toasts, addToast, removeToast, error, success, warning }),
    [toasts, addToast, removeToast, error, success, warning]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
