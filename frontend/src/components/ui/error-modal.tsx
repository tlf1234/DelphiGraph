'use client'

import * as React from 'react'
import { AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ErrorModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  code?: string
  details?: Record<string, any>
}

export function ErrorModal({ isOpen, onClose, title = '错误', message, code, details }: ErrorModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gray-900 border border-red-700 rounded-lg shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-white flex-1">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-gray-300">{message}</p>
          
          {code && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">错误代码</p>
              <p className="text-sm font-mono text-red-400">{code}</p>
            </div>
          )}

          {details && Object.keys(details).length > 0 && (
            <div className="bg-gray-800/50 rounded p-3 border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">详细信息</p>
              <div className="space-y-1">
                {Object.entries(details).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-400">{key}:</span>
                    <span className="text-gray-300 font-mono">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export function useErrorModal() {
  const [error, setError] = React.useState<Omit<ErrorModalProps, 'isOpen' | 'onClose'> | null>(null)

  const showError = React.useCallback((errorData: Omit<ErrorModalProps, 'isOpen' | 'onClose'>) => {
    setError(errorData)
  }, [])

  const hideError = React.useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    isOpen: error !== null,
    showError,
    hideError,
  }
}
