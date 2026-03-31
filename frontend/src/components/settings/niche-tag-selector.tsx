'use client'

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'

interface NicheTag {
  tag_key: string
  tag_name: string
  description: string
  icon: string
}

interface NicheTagSelectorProps {
  selectedTags: string[]
  onChange: (tags: string[]) => void
  maxSelection?: number
  disabled?: boolean
}

// Predefined niche tags matching database
const NICHE_TAGS: NicheTag[] = [
  { tag_key: 'tech', tag_name: 'Technology', description: '科技、软件、硬件、AI等', icon: '💻' },
  { tag_key: 'finance', tag_name: 'Finance', description: '金融、投资、加密货币等', icon: '💰' },
  { tag_key: 'healthcare', tag_name: 'Healthcare', description: '医疗、健康、生物科技等', icon: '🏥' },
  { tag_key: 'legal', tag_name: 'Legal', description: '法律、合规、政策等', icon: '⚖️' },
  { tag_key: 'marketing', tag_name: 'Marketing', description: '市场营销、广告、品牌等', icon: '📢' },
  { tag_key: 'real_estate', tag_name: 'Real Estate', description: '房地产、建筑、城市规划等', icon: '🏢' },
  { tag_key: 'education', tag_name: 'Education', description: '教育、培训、学术等', icon: '📚' },
  { tag_key: 'entertainment', tag_name: 'Entertainment', description: '娱乐、影视、游戏等', icon: '🎬' },
  { tag_key: 'sports', tag_name: 'Sports', description: '体育、竞技、健身等', icon: '⚽' },
  { tag_key: 'politics', tag_name: 'Politics', description: '政治、选举、国际关系等', icon: '🏛️' },
  { tag_key: 'environment', tag_name: 'Environment', description: '环境、气候、能源等', icon: '🌍' },
  { tag_key: 'science', tag_name: 'Science', description: '科学研究、学术、创新等', icon: '🔬' },
]

export function NicheTagSelector({ 
  selectedTags, 
  onChange, 
  maxSelection,
  disabled = false 
}: NicheTagSelectorProps) {
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>(selectedTags)

  useEffect(() => {
    setLocalSelectedTags(selectedTags)
  }, [selectedTags])

  const handleToggleTag = (tagKey: string) => {
    if (disabled) return

    let newTags: string[]
    
    if (localSelectedTags.includes(tagKey)) {
      // Remove tag
      newTags = localSelectedTags.filter(t => t !== tagKey)
    } else {
      // Add tag (check max selection)
      if (maxSelection && localSelectedTags.length >= maxSelection) {
        return // Don't add if max reached
      }
      newTags = [...localSelectedTags, tagKey]
    }

    setLocalSelectedTags(newTags)
    onChange(newTags)
  }

  const isSelected = (tagKey: string) => localSelectedTags.includes(tagKey)
  const canSelectMore = !maxSelection || localSelectedTags.length < maxSelection

  return (
    <div className="space-y-4">
      {/* Selection Info */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">
          已选择 {localSelectedTags.length} 个领域
          {maxSelection && ` / ${maxSelection}`}
        </span>
        {localSelectedTags.length > 0 && (
          <button
            onClick={() => {
              setLocalSelectedTags([])
              onChange([])
            }}
            disabled={disabled}
            className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
          >
            清除全部
          </button>
        )}
      </div>

      {/* Tag Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {NICHE_TAGS.map((tag) => {
          const selected = isSelected(tag.tag_key)
          const canSelect = selected || canSelectMore

          return (
            <button
              key={tag.tag_key}
              onClick={() => handleToggleTag(tag.tag_key)}
              disabled={disabled || !canSelect}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all
                ${selected
                  ? 'bg-emerald-500/20 border-emerald-500 shadow-lg shadow-emerald-500/20'
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }
                ${!canSelect && !selected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {/* Selection Indicator */}
              {selected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-black" />
                </div>
              )}

              {/* Icon and Name */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{tag.icon}</span>
                <span className={`font-semibold ${selected ? 'text-white' : 'text-zinc-300'}`}>
                  {tag.tag_name}
                </span>
              </div>

              {/* Description */}
              <p className={`text-xs ${selected ? 'text-emerald-200' : 'text-zinc-500'}`}>
                {tag.description}
              </p>
            </button>
          )
        })}
      </div>

      {/* Selected Tags Summary */}
      {localSelectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <span className="text-sm text-zinc-400 w-full mb-2">已选择的专业领域:</span>
          {localSelectedTags.map((tagKey) => {
            const tag = NICHE_TAGS.find(t => t.tag_key === tagKey)
            if (!tag) return null

            return (
              <span
                key={tagKey}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-sm"
              >
                <span>{tag.icon}</span>
                <span className="text-emerald-300">{tag.tag_name}</span>
                {!disabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleTag(tagKey)
                    }}
                    className="ml-1 text-emerald-400 hover:text-emerald-200 transition-colors"
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* Help Text */}
      {maxSelection && (
        <p className="text-xs text-zinc-500">
          最多可选择 {maxSelection} 个专业领域
        </p>
      )}
    </div>
  )
}

// Export the tags list for use in other components
export { NICHE_TAGS }
export type { NicheTag }
