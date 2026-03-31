'use client'

import { useState, useEffect } from 'react'
import { getTranslation, type Language } from '@/lib/i18n'

export function useTranslation() {
  const [language, setLanguage] = useState<Language>('zh')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 从localStorage读取语言偏好
    const savedLang = (localStorage.getItem('language') as Language) || 'zh'
    setLanguage(savedLang)

    // 监听语言切换事件
    const handleLanguageChange = (e: CustomEvent<Language>) => {
      setLanguage(e.detail)
    }

    window.addEventListener('languageChange', handleLanguageChange as EventListener)
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange as EventListener)
    }
  }, [])

  return {
    t: getTranslation(language),
    language,
    mounted,
  }
}
