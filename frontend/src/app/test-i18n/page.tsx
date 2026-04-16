'use client'

import { useTranslation } from '@/hooks/use-translation'
import LanguageSwitcher from '@/components/language-switcher'
import Link from 'next/link'

export default function TestI18nPage() {
  const { t, language, mounted } = useTranslation()

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      {/* 顶部导航 */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex justify-between items-center mb-8">
          <Link href="/" className="text-emerald-400 hover:underline">
            ← {language === 'zh' ? '返回首页' : 'Back to Home'}
          </Link>
          <LanguageSwitcher />
        </div>

        <h1 className="text-4xl font-bold mb-4">
          <span className="text-emerald-400">i18n</span> {language === 'zh' ? '测试页面' : 'Test Page'}
        </h1>
        <p className="text-zinc-400 font-mono">
          {language === 'zh' ? '当前语言：中文' : 'Current Language: English'}
        </p>
      </div>

      {/* 测试内容 */}
      <div className="max-w-4xl mx-auto space-y-8">
        {/* 导航翻译测试 */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-emerald-400">
            {language === 'zh' ? '导航栏翻译' : 'Navigation Translations'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">nav.terminal</div>
              <div className="font-mono">{t.nav.terminal}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">nav.markets</div>
              <div className="font-mono">{t.nav.markets}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">nav.leaderboard</div>
              <div className="font-mono">{t.nav.leaderboard}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">nav.settings</div>
              <div className="font-mono">{t.nav.settings}</div>
            </div>
          </div>
        </div>

        {/* 首页翻译测试 */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-blue-400">
            {language === 'zh' ? '首页翻译' : 'Home Page Translations'}
          </h2>
          <div className="space-y-4">
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">home.status</div>
              <div className="font-mono text-emerald-400">{t.home.status}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">home.title1 + home.title2</div>
              <div className="text-2xl font-bold">
                {t.home.title1} <span className="text-emerald-400">{t.home.title2}</span>
              </div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">home.subtitle1</div>
              <div className="text-zinc-400">{t.home.subtitle1}</div>
            </div>
          </div>
        </div>

        {/* Dashboard翻译测试 */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-purple-400">
            {language === 'zh' ? 'Dashboard翻译' : 'Dashboard Translations'}
          </h2>
          <div className="space-y-4">
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">dashboard.welcomeBack</div>
              <div className="text-xl font-bold">{t.dashboard.welcomeBack}USER</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-800/50 p-4 rounded">
                <div className="text-xs text-zinc-500 mb-1">reputationScore</div>
                <div className="font-mono text-sm">{t.dashboard.reputationScore}</div>
              </div>
              <div className="bg-zinc-800/50 p-4 rounded">
                <div className="text-xs text-zinc-500 mb-1">submissions</div>
                <div className="font-mono text-sm">{t.dashboard.submissions}</div>
              </div>
              <div className="bg-zinc-800/50 p-4 rounded">
                <div className="text-xs text-zinc-500 mb-1">totalEarnings</div>
                <div className="font-mono text-sm">{t.dashboard.totalEarnings}</div>
              </div>
              <div className="bg-zinc-800/50 p-4 rounded">
                <div className="text-xs text-zinc-500 mb-1">activeMarkets</div>
                <div className="font-mono text-sm">{t.dashboard.activeMarkets}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 登录页翻译测试 */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-orange-400">
            {language === 'zh' ? '登录页翻译' : 'Login Page Translations'}
          </h2>
          <div className="space-y-4">
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">login.secureLogin</div>
              <div className="font-mono text-emerald-400">{t.login.secureLogin}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">login.subtitle</div>
              <div className="text-zinc-400">{t.login.subtitle}</div>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded">
              <div className="text-xs text-zinc-500 mb-1">login.noAccount</div>
              <div className="text-zinc-400 text-sm">{t.login.noAccount}</div>
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">
            {language === 'zh' ? '✅ 测试说明' : '✅ Test Instructions'}
          </h2>
          <div className="space-y-2 text-sm text-zinc-300">
            <p>
              {language === 'zh' 
                ? '1. 点击右上角的语言切换按钮（🇨🇳 中文 / 🇺🇸 EN）' 
                : '1. Click the language switcher button in the top right (🇨🇳 中文 / 🇺🇸 EN)'}
            </p>
            <p>
              {language === 'zh'
                ? '2. 观察页面上所有文本是否立即切换语言'
                : '2. Observe if all text on the page switches language immediately'}
            </p>
            <p>
              {language === 'zh'
                ? '3. 刷新页面，检查语言偏好是否被保存（使用localStorage）'
                : '3. Refresh the page to check if language preference is saved (using localStorage)'}
            </p>
            <p>
              {language === 'zh'
                ? '4. 如果一切正常，我们就可以将这个系统应用到所有页面'
                : '4. If everything works, we can apply this system to all pages'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
