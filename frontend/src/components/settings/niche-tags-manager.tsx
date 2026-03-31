'use client'

import { useState } from 'react'
import { NicheTagSelector } from './niche-tag-selector'
import { createClient } from '@/lib/supabase/client'

interface NicheTagsManagerProps {
  userId: string
  initialTags: string[] | null
}

export function NicheTagsManager({ userId, initialTags }: NicheTagsManagerProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags || [])
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags)
    setHasChanges(true)
    setMessage(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('profiles')
        .update({ niche_tags: selectedTags })
        .eq('id', userId)

      if (error) throw error

      setMessage({ type: 'success', text: '专业领域已保存' })
      setHasChanges(false)
    } catch (error) {
      console.error('Error saving niche tags:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : '保存失败，请重试' 
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSelectedTags(initialTags || [])
    setHasChanges(false)
    setMessage(null)
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-400 mb-1">为什么设置专业领域？</h3>
            <p className="text-sm text-blue-200/80">
              选择您擅长的专业领域后，系统会优先为您推荐匹配的高价值任务。
              专业领域匹配度越高，您获得私密任务的机会越大。
            </p>
          </div>
        </div>
      </div>

      {/* Niche Tag Selector */}
      <NicheTagSelector
        selectedTags={selectedTags}
        onChange={handleTagsChange}
        maxSelection={5}
        disabled={isSaving}
      />

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Action Buttons */}
      {hasChanges && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
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
                保存中...
              </span>
            ) : (
              '保存更改'
            )}
          </button>
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}
