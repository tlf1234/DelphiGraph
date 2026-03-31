'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Sparkles, Clock, TrendingUp } from 'lucide-react'
import { useTypewriter } from '@/hooks/use-typewriter'
import { useTranslation } from '@/hooks/use-translation'

interface SearchBoxProps {
  onSearch: (query: string) => void
  isLoading?: boolean
}

interface SearchSuggestion {
  text: string
  type: 'recent' | 'trending'
}

export function SearchBox({ onSearch, isLoading = false }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { language } = useTranslation()

  // 打字机效果的高价值问题示例
  const placeholderQuestions = language === 'zh' ? [
    '2026年 Q3 英伟达财报会超预期吗？',
    '下周比特币会突破 10 万美元吗？',
    'GPT-5 会在 2025 年发布吗？',
    '程序员最喜欢的 IDE 是什么？',
    '特斯拉 2025 年销量能达到 300 万辆吗？',
    '下一届美国总统会是谁？',
    'AI 会在 2026 年通过图灵测试吗？',
    '苹果会在 2025 年推出 AR 眼镜吗？',
  ] : [
    'Will NVIDIA Q3 2026 earnings beat expectations?',
    'Will Bitcoin break $100K next week?',
    'Will GPT-5 be released in 2025?',
    'What is the most popular IDE among developers?',
    'Will Tesla sell 3M vehicles in 2025?',
    'Who will be the next US President?',
    'Will AI pass the Turing Test in 2026?',
    'Will Apple launch AR glasses in 2025?',
  ]

  const typewriterText = useTypewriter({
    words: placeholderQuestions,
    typeSpeed: 80,
    deleteSpeed: 40,
    delayBetweenWords: 2500,
    loop: true,
  })

  // 模拟搜索建议（实际应该从API获取）
  const mockSuggestions: SearchSuggestion[] = [
    { text: 'AI breakthrough 2024', type: 'trending' },
    { text: 'Bitcoin price prediction', type: 'trending' },
    { text: 'Climate change impact', type: 'recent' },
    { text: 'Tech IPO success', type: 'recent' },
    { text: 'Election outcome', type: 'trending' },
  ]

  // 实时搜索建议
  useEffect(() => {
    if (query.trim().length > 2) {
      // 过滤建议
      const filtered = mockSuggestions.filter(s => 
        s.text.toLowerCase().includes(query.toLowerCase())
      )
      setSuggestions(filtered)
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
    setSelectedIndex(-1)
  }, [query])

  // 键盘快捷键支持
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K 聚焦搜索框
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      // Escape 清空搜索
      if (e.key === 'Escape' && isFocused) {
        setQuery('')
        setShowSuggestions(false)
        inputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isFocused])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
      setShowSuggestions(false)
    }
  }

  const handleSparklesClick = () => {
    // 点击 Sparkles 图标触发搜索
    if (query.trim()) {
      handleSubmit()
    } else {
      // 如果没有输入，聚焦输入框
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        // 选择建议
        const selected = suggestions[selectedIndex].text
        setQuery(selected)
        onSearch(selected)
        setShowSuggestions(false)
      } else {
        handleSubmit(e)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    onSearch(suggestion)
    setShowSuggestions(false)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto relative">
      <div
        className={`
          relative group
          transition-all duration-300
          ${isFocused ? 'scale-105' : 'scale-100'}
        `}
      >
        {/* 发光效果 */}
        <div
          className={`
            absolute -inset-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 
            rounded-2xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500
            ${isFocused ? 'opacity-40' : ''}
          `}
        />

        {/* 搜索框 */}
        <div className="relative bg-zinc-900 border-2 border-zinc-700 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-5">
            {/* 搜索图标 */}
            <Search className={`w-6 h-6 flex-shrink-0 transition-colors ${isFocused ? 'text-emerald-400' : 'text-zinc-500'}`} />

            {/* 输入框容器 */}
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false)
                  // 延迟隐藏建议，允许点击
                  setTimeout(() => setShowSuggestions(false), 200)
                }}
                onKeyDown={handleKeyDown}
                placeholder=""
                disabled={isLoading}
                className="
                  w-full bg-transparent text-white text-xl
                  focus:outline-none
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
              {/* 打字机效果的 placeholder */}
              {!isFocused && !query && (
                <div className="absolute inset-0 flex items-center pointer-events-none">
                  <span className="text-zinc-500 text-xl">
                    {typewriterText}
                    <span className="inline-block w-0.5 h-5 bg-emerald-400 ml-1 animate-pulse" />
                  </span>
                </div>
              )}
            </div>

            {/* Sparkles图标 - 可点击触发搜索 */}
            <button
              type="button"
              onClick={handleSparklesClick}
              disabled={isLoading}
              className="flex-shrink-0 p-1 -m-1 rounded-lg hover:bg-zinc-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group/sparkles relative"
              aria-label="Search"
              title={query.trim() ? "Search" : "Focus search box"}
            >
              <Sparkles 
                className={`w-6 h-6 transition-all ${
                  isFocused 
                    ? 'text-purple-400 animate-pulse' 
                    : 'text-zinc-600 group-hover/sparkles:text-purple-400 group-hover/sparkles:scale-110'
                }`} 
              />
              {/* 悬停提示 */}
              {!isFocused && (
                <span className="absolute -bottom-8 right-0 text-xs text-zinc-600 font-mono opacity-0 group-hover/sparkles:opacity-100 transition-opacity whitespace-nowrap">
                  {query.trim() ? 'Click to search' : 'Click to focus'}
                </span>
              )}
            </button>
          </div>

          {/* 加载指示器 */}
          {isLoading && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 animate-pulse" />
          )}
        </div>

        {/* 快捷键提示 */}
        {isFocused && (
          <div className="absolute right-4 -bottom-8 text-xs text-zinc-500 font-mono flex items-center gap-4">
            <span>
              <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded">Enter</kbd> search
            </span>
            <span>
              <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded">Esc</kbd> clear
            </span>
          </div>
        )}
      </div>

      {/* 搜索建议下拉 */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden z-50">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion.text)}
              className={`
                w-full px-6 py-3 flex items-center gap-3 text-left
                transition-colors
                ${selectedIndex === index 
                  ? 'bg-emerald-500/20 border-l-2 border-emerald-400' 
                  : 'hover:bg-zinc-800/50'
                }
              `}
            >
              {suggestion.type === 'trending' ? (
                <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              )}
              <span className="text-white">{suggestion.text}</span>
              <span className="ml-auto text-xs text-zinc-500 font-mono">
                {suggestion.type === 'trending' ? 'Trending' : 'Recent'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 全局快捷键提示 */}
      {!isFocused && (
        <div className="absolute -top-10 right-0 text-xs text-zinc-600 font-mono">
          Press <kbd className="px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded">⌘K</kbd> to search
        </div>
      )}
    </form>
  )
}
