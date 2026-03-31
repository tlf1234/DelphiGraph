'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface NDADialogProps {
  isOpen: boolean
  onClose: () => void
  onAccept: () => Promise<void>
  ndaText: string
  marketTitle: string
}

export function NDADialog({ 
  isOpen, 
  onClose, 
  onAccept, 
  ndaText, 
  marketTitle 
}: NDADialogProps) {
  const [agreed, setAgreed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleAccept = async () => {
    if (!agreed) {
      setError('请先阅读并同意保密协议')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onAccept()
      // Success - parent component will handle closing
    } catch (err) {
      setError(err instanceof Error ? err.message : '签署失败，请重试')
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setAgreed(false)
      setError(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-zinc-900 border border-red-500/30 rounded-lg shadow-2xl shadow-red-500/20 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-red-500/30 p-6 z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <span className="text-4xl">⚠️</span>
              <div>
                <h2 className="text-2xl font-bold text-red-400">
                  保密协议 (NDA Required)
                </h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {marketTitle}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              aria-label="关闭"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* NDA Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          <div className="bg-zinc-800 p-6 rounded-lg border border-zinc-700">
            <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
              {ndaText}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-900 border-t border-red-500/30 p-6 z-10">
          {/* Agreement Checkbox */}
          <label className="flex items-start gap-3 mb-4 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked)
                setError(null)
              }}
              disabled={isSubmitting}
              className="mt-1 w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-0 disabled:opacity-50"
            />
            <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
              我已仔细阅读并完全理解上述保密协议的所有条款，同意遵守协议中的所有规定，并承诺对任务相关信息严格保密。
            </span>
          </label>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            <button
              onClick={handleAccept}
              disabled={!agreed || isSubmitting}
              className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  签署中...
                </span>
              ) : (
                '签署并接受任务'
              )}
            </button>
          </div>

          {/* Legal Notice */}
          <p className="text-xs text-zinc-500 mt-4 text-center">
            签署此协议即表示您同意受其法律约束。违反协议可能导致法律责任。
          </p>
        </div>
      </div>
    </div>
  )
}
