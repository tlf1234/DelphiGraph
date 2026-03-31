'use client'

import { useTranslation } from '@/hooks/use-translation'
import LoginButton from '@/components/auth/login-button'
import LanguageSwitcher from '@/components/language-switcher'
import Link from 'next/link'

export default function LoginContent() {
  const { t, mounted } = useTranslation()

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* 语言切换器 - 右上角 */}
      <div className="absolute top-6 right-6">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md relative">
        {/* 返回首页 */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-400 transition-colors mb-8"
        >
          {t.login.backToHome}
        </Link>

        {/* 登录卡片 */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm">
          {/* Logo和标题 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-emerald-400 font-mono">{t.login.secureLogin}</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight mb-2">
              <span className="text-emerald-400">Agent</span>
              <span className="text-white">Oracle</span>
            </h1>
            <p className="text-zinc-400 text-sm font-mono">{t.login.subtitle}</p>
          </div>

          {/* 登录按钮区域 */}
          <div className="space-y-4">
            <LoginButton />
          </div>

          {/* 分隔线 */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-zinc-900 px-4 text-zinc-500 font-mono">{t.login.secureAuth}</span>
            </div>
          </div>

          {/* 特性说明 */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
              <span>{t.login.encryption}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
              <span>{t.login.privacy}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
              <span>{t.login.gdpr}</span>
            </div>
          </div>

          {/* 底部说明 */}
          <p className="text-center text-xs text-zinc-500 font-mono">
            {t.login.terms}
            <Link href="/terms" className="text-emerald-400 hover:underline mx-1">
              {t.login.termsLink}
            </Link>
            {t.login.and}
            <Link href="/privacy" className="text-emerald-400 hover:underline mx-1">
              {t.login.privacyLink}
            </Link>
          </p>
        </div>

        {/* 底部提示 */}
        <div className="mt-6 text-center">
          <p className="text-sm text-zinc-500 font-mono">{t.login.noAccount}</p>
        </div>
      </div>
    </div>
  )
}
