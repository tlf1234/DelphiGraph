'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { useState, useEffect } from 'react'
import { 
  Flame, 
  TrendingUp, 
  Target, 
  Trophy, 
  UserCircle, 
  Settings, 
  LogOut,
  Menu,
  X,
  DollarSign
} from 'lucide-react'

interface DashboardNavProps {
  user: User
}

export default function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname()
  const supabase = createClient()
  const [loggingOut, setLoggingOut] = useState(false)
  const [userStatus, setUserStatus] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    // Fetch user profile to check purgatory status
    const fetchUserStatus = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .single()
      
      if (data) {
        setUserStatus(data.status)
      }
    }

    fetchUserStatus()
  }, [user.id, supabase])

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const navItems = [
    // 核心功能在前
    { href: '/profile', label: '个人档案', icon: UserCircle },
    { href: '/market-search', label: '搜索任务', icon: TrendingUp },
    { href: '/leaderboard', label: '排行榜', icon: Trophy },
    { href: '/purgatory', label: '涅槃模式', icon: Flame },
    { href: '/submissions', label: '我的提交', icon: Target },
    { href: '/earnings', label: '收益历史', icon: DollarSign },
    { href: '/settings', label: '设置', icon: Settings },
  ]

  return (
    <nav className="border-b border-[#2a3f5f] bg-[#1a1f3a] sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link 
            href="/" 
            className="text-xl font-bold text-[#00ff88] hover:text-[#00d4ff] transition-colors flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-[#00ff88] to-[#00d4ff] rounded flex items-center justify-center text-[#0a0e27] font-bold">
              AO
            </div>
            <span className="hidden sm:inline">DelphiGraph</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-2">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href
              const isPurgatory = item.href === '/purgatory'
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    isActive
                      ? isPurgatory && userStatus === 'restricted'
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/50'
                        : 'bg-[#00ff88] text-[#0a0e27] shadow-lg shadow-[#00ff88]/30'
                      : isPurgatory
                      ? 'text-orange-400 hover:bg-orange-500/10 hover:text-orange-300'
                      : 'text-gray-300 hover:bg-[#2a3f5f] hover:text-[#00ff88]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {isPurgatory && userStatus === 'restricted' && (
                    <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">!</span>
                  )}
                </Link>
              )
            })}
          </div>

          {/* User Info & Logout */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="text-sm text-gray-300 bg-[#0a0e27] px-3 py-2 rounded-md border border-[#2a3f5f]">
              <span className="text-gray-500">@</span>
              {user.user_metadata?.user_name || user.email?.split('@')[0]}
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-4 py-2 text-sm border border-[#2a3f5f] rounded-md hover:bg-[#2a3f5f] hover:border-[#00ff88] text-gray-300 hover:text-[#00ff88] disabled:opacity-50 transition-all flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? '退出中...' : '退出'}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-gray-300 hover:text-[#00ff88] hover:bg-[#2a3f5f] rounded-md transition-colors"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#2a3f5f] py-4 space-y-2">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href
              const isPurgatory = item.href === '/purgatory'
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? isPurgatory && userStatus === 'restricted'
                        ? 'bg-orange-500 text-white'
                        : 'bg-[#00ff88] text-[#0a0e27]'
                      : isPurgatory
                      ? 'text-orange-400 hover:bg-orange-500/10'
                      : 'text-gray-300 hover:bg-[#2a3f5f] hover:text-[#00ff88]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  {isPurgatory && userStatus === 'restricted' && (
                    <span className="ml-auto px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">!</span>
                  )}
                </Link>
              )
            })}
            
            {/* Mobile User Info */}
            <div className="border-t border-[#2a3f5f] pt-4 mt-4 space-y-2">
              <div className="px-4 py-2 text-sm text-gray-400">
                登录为: <span className="text-gray-200">{user.user_metadata?.user_name || user.email?.split('@')[0]}</span>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm border border-[#2a3f5f] rounded-md hover:bg-[#2a3f5f] hover:border-[#00ff88] text-gray-300 hover:text-[#00ff88] disabled:opacity-50 transition-all"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? '退出中...' : '退出'}
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
