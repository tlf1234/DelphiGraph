'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/hooks/use-translation'
import GlobalNav from '@/components/layout/global-nav'
import { SearchBox } from '@/components/search/search-box'
import { SearchResults } from '@/components/search/search-results'
import { FutureNotFound } from '@/components/search/future-not-found'
import { TrendingSignals } from '@/components/search/trending-signals'
import { RecentDiscoveries } from '@/components/search/recent-discoveries'
import { LivePulse } from '@/components/shared/live-pulse'
import { HotTasksCarousel } from '@/components/shared/hot-tasks-carousel'
import { AgentSynthesisAnimation } from '@/components/search/agent-synthesis-animation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface SearchResult {
  taskId: string
  title: string
  question: string
  summary: string
  consensusProbability: number
  signalCount: number
  status: string
}

export default function Home() {
  const { t, mounted } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [trendingSignals] = useState<any[]>([])
  const [recentDiscoveries] = useState<any[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      
      // If user exists, get their profile
      if (user) {
        supabase
          .from('profiles')
          .select('username, reputation_score, reputation_level, avatar_url, status')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            setUserProfile(data)
          })
      }
    })
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  const handleSearch = async (query: string) => {
    if (!query.trim()) return

    setSearchQuery(query)
    setIsSearching(true)
    setHasSearched(true)

    try {
      // 模拟动画时间（3.5秒）
      await new Promise(resolve => setTimeout(resolve, 3500))
      
      const response = await fetch(`/api/search-signals?query=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.results || [])
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 统一顶部导航 */}
      <GlobalNav user={user} userProfile={userProfile} />

      {/* Hero区域 - Search the Future */}
      <section className="container mx-auto px-6 py-20 md:py-32">
        <div className="max-w-5xl mx-auto">
          {/* 状态指示和实时脉搏 */}
          <div className="flex flex-col items-center gap-6 mb-8">
            {/* 系统状态 Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-emerald-400 font-mono">{t.home.status}</span>
            </div>

            {/* 实时脉搏 */}
            <LivePulse />
          </div>

          {/* 主标题 */}
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
                Search the Future
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-zinc-400 mb-4 font-light">
              {t.home.subtitle1}
            </p>
          </div>

          {/* 搜索框 */}
          <div className="mb-8">
            <SearchBox
              onSearch={handleSearch}
              isLoading={isSearching}
            />
          </div>

          {/* 供需双CTA - 平衡供给和需求 */}
          {!hasSearched && (
            <div className="mb-16 flex flex-col md:flex-row items-center justify-center gap-4">
              {/* 需求端：搜索/提问 */}
              <div className="flex items-center gap-3 text-zinc-500 text-sm">
                <span className="font-mono">{t.home.searchCTA}</span>
              </div>

              <div className="hidden md:block w-px h-8 bg-zinc-800"></div>
              <div className="md:hidden w-full h-px bg-zinc-800"></div>

              {/* 供给端：接入Agent赚钱 */}
              <Link
                href="/profile"
                className="
                  group flex items-center gap-3 px-6 py-3
                  bg-gradient-to-r from-emerald-500/10 to-blue-500/10
                  border border-emerald-500/30
                  rounded-full
                  hover:from-emerald-500/20 hover:to-blue-500/20
                  hover:border-emerald-500/50
                  transition-all duration-200
                "
              >
                <span className="text-sm font-semibold text-emerald-400 group-hover:text-emerald-300">
                  {t.home.earnCTA}
                </span>
                <span className="text-emerald-400 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          )}

          {/* 搜索结果或未找到 */}
          {hasSearched && (
            <div className="mb-16">
              {isSearching ? (
                // 显示智能体协作动画
                <AgentSynthesisAnimation />
              ) : searchResults.length > 0 ? (
                <SearchResults
                  results={searchResults}
                  isLoading={false}
                />
              ) : (
                <FutureNotFound
                  query={searchQuery}
                />
              )}
            </div>
          )}

          {/* 热门预测和最近发现 */}
          {!hasSearched && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <TrendingSignals signals={trendingSignals} />
              <RecentDiscoveries discoveries={recentDiscoveries} />
            </div>
          )}
        </div>
      </section>

      {/* 火热搜索任务轮播 */}
      <HotTasksCarousel />

      {/* 核心特性 */}
      <section className="container mx-auto px-6 py-20 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t.home.coreFeatures}
            </h2>
            <p className="text-zinc-400 font-mono text-sm">
              {t.home.nextGen}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 特性1 - 搜索未来 */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-lg p-8 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-xl font-bold mb-3">{t.home.feature1Title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.home.feature1Desc}
                </p>
                <div className="mt-4 pt-4 border-t border-emerald-500/20">
                  <div className="text-xs text-emerald-400 font-mono">{t.home.feature1Status}</div>
                </div>
              </div>
            </div>

            {/* 特性2 - 智能分发 */}
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-lg p-8 relative overflow-hidden group hover:border-blue-500/40 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-xl font-bold mb-3">{t.home.feature2Title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.home.feature2Desc}
                </p>
                <div className="mt-4 pt-4 border-t border-blue-500/20">
                  <div className="text-xs text-blue-400 font-mono">{t.home.feature2Status}</div>
                </div>
              </div>
            </div>

            {/* 特性3 - 双层市场 */}
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-lg p-8 relative overflow-hidden group hover:border-purple-500/40 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="text-4xl mb-4">💎</div>
                <h3 className="text-xl font-bold mb-3">{t.home.feature3Title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t.home.feature3Desc}
                </p>
                <div className="mt-4 pt-4 border-t border-purple-500/20">
                  <div className="text-xs text-purple-400 font-mono">{t.home.feature3Status}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 隐私信任徽章区域 */}
      <section className="container mx-auto px-6 py-12 border-t border-zinc-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-zinc-500 text-sm font-mono mb-6">{t.home.trustBadgeTitle}</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Open Source Badge */}
            <div className="flex flex-col items-center gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-emerald-500/30 transition-all group">
              <div className="text-3xl">🔓</div>
              <div className="text-center">
                <div className="text-sm font-semibold text-zinc-300 mb-1">{t.home.trustBadge1}</div>
                <div className="text-xs text-zinc-500">{t.home.trustBadge1Desc}</div>
              </div>
            </div>

            {/* Local Execution Badge */}
            <div className="flex flex-col items-center gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-blue-500/30 transition-all group">
              <div className="text-3xl">💻</div>
              <div className="text-center">
                <div className="text-sm font-semibold text-zinc-300 mb-1">{t.home.trustBadge2}</div>
                <div className="text-xs text-zinc-500">{t.home.trustBadge2Desc}</div>
              </div>
            </div>

            {/* Zero Data Upload Badge */}
            <div className="flex flex-col items-center gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-purple-500/30 transition-all group">
              <div className="text-3xl">🛡️</div>
              <div className="text-center">
                <div className="text-sm font-semibold text-zinc-300 mb-1">{t.home.trustBadge3}</div>
                <div className="text-xs text-zinc-500">{t.home.trustBadge3Desc}</div>
              </div>
            </div>

            {/* GDPR Compliant Badge */}
            <div className="flex flex-col items-center gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-emerald-500/30 transition-all group">
              <div className="text-3xl">✓</div>
              <div className="text-center">
                <div className="text-sm font-semibold text-zinc-300 mb-1">{t.home.trustBadge4}</div>
                <div className="text-xs text-zinc-500">{t.home.trustBadge4Desc}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 底部 */}
      <footer className="border-t border-zinc-800 bg-black/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-zinc-500 font-mono">
              {t.home.copyright}
            </div>
            <div className="flex gap-6 text-sm text-zinc-500">
              <Link href="/docs" className="hover:text-emerald-400 transition-colors">
                {t.home.docs}
              </Link>
              <Link href="/api" className="hover:text-emerald-400 transition-colors">
                {t.home.api}
              </Link>
              <Link href="/about" className="hover:text-emerald-400 transition-colors">
                {t.home.about}
              </Link>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-emerald-400">{t.home.systemOnline}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
