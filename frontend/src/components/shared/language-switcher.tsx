'use client'

import { useState, useEffect } from 'react'
import type { Language } from '@/lib/i18n'

export default function LanguageSwitcher() {
  const [language, setLanguage] = useState<Language>('zh')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 从localStorage读取语言偏好
    const savedLang = localStorage.getItem('language') as Language
    if (savedLang) {
      setLanguage(savedLang)
      document.documentElement.lang = savedLang
    }
  }, [])

  const toggleLanguage = () => {
    const newLang: Language = language === 'zh' ? 'en' : 'zh'
    setLanguage(newLang)
    localStorage.setItem('language', newLang)
    document.documentElement.lang = newLang
    // 触发自定义事件，通知其他组件语言已更改
    window.dispatchEvent(new CustomEvent('languageChange', { detail: newLang }))
  }

  if (!mounted) {
    return null
  }

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-sm transition-colors font-mono flex items-center gap-2"
      aria-label="切换语言 / Switch Language"
    >
      <span className="text-zinc-400">{language === 'zh' ? '🇨🇳' : '🇺🇸'}</span>
      <span className="text-white">{language === 'zh' ? '中文' : 'EN'}</span>
    </button>
  )
}
