'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, TrendingUp, Trophy, Flame } from 'lucide-react'
import LanguageSwitcher from '@/components/shared/language-switcher'
import UserMenu from '@/components/layout/user-menu'
import { User } from '@supabase/supabase-js'
import { useState } from 'react'

interface GlobalNavProps {
  user?: User | null
  userProfile?: {
    username?: string
    reputation_score?: number
    reputation_level?: string
    avatar_url?: string
    status?: string
  } | null
}

export default function GlobalNav({ user, userProfile }: GlobalNavProps) {
  const pathname = usePathname()

  const publicNavItems = [
    { href: '/market-search', label: '搜索任务', icon: TrendingUp },
    { href: '/leaderboard', label: '排行榜', icon: Trophy },
    { href: '/purgatory', label: '涅槃', icon: Flame },
  ]

  return (
    <nav className="border-b border-zinc-800 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link 
            href="/" 
            className="text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            <span className="text-emerald-400">Delphi</span>
            <span className="text-white">Graph</span>
          </Link>

          {/* Center Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {/* Search Trigger */}
            <Link
              href="/"
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                pathname === '/'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'
              }`}
            >
              <Search className="h-4 w-4" />
              <span className="text-sm font-medium">搜索</span>
            </Link>

            {/* Public Nav Items */}
            {publicNavItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              const isPurgatory = item.href === '/purgatory'
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    isActive
                      ? isPurgatory
                        ? 'bg-orange-500/10 text-orange-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                      : isPurgatory
                      ? 'text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/5'
                      : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {isPurgatory && userProfile?.status === 'restricted' && (
                    <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">!</span>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Right Side - Language Switcher + User Menu/Login */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            
            {user ? (
              <UserMenu user={user} userProfile={userProfile} />
            ) : (
              <Link 
                href="/login" 
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded transition-colors"
              >
                登录
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === '/'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'
            }`}
          >
            <Search className="h-4 w-4" />
            <span>搜索</span>
          </Link>

          {publicNavItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            const isPurgatory = item.href === '/purgatory'
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? isPurgatory
                      ? 'bg-orange-500/10 text-orange-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                    : isPurgatory
                    ? 'text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/5'
                    : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
