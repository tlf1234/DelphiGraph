'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import {
  Target,
  DollarSign,
  UserCircle,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react'

interface UserMenuProps {
  user: User
  userProfile?: {
    username?: string
    reputation_score?: number
    reputation_level?: string
    avatar_url?: string
  } | null
}

export default function UserMenu({ user, userProfile }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const username = userProfile?.username || user.user_metadata?.user_name || user.email?.split('@')[0] || 'User'
  const reputationScore = userProfile?.reputation_score || 0
  const reputationLevel = userProfile?.reputation_level || 'Novice'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleLogout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const menuItems = [
    { href: '/submissions', label: '我的提交', icon: Target },
    { href: '/earnings', label: '收益历史', icon: DollarSign },
    { href: '/profile', label: '个人档案', icon: UserCircle },
    { href: '/settings', label: '设置', icon: Settings },
  ]

  return (
    <div className="relative" ref={menuRef}>
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-md transition-all"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-black font-bold text-sm">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-zinc-300 hidden sm:inline">
            {username}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Info Section */}
          <div className="p-4 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border-b border-zinc-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-black font-bold text-lg">
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {username}
                </div>
                <div className="text-xs text-zinc-400 truncate">
                  {user.email}
                </div>
              </div>
            </div>
            
            {/* Reputation Info */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">信誉分:</span>
                <span className="text-emerald-400 font-semibold">
                  {reputationScore}
                </span>
              </div>
              <div className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold">
                {reputationLevel}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800/50 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Logout Button */}
          <div className="border-t border-zinc-800 p-2">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              <span>{loggingOut ? '退出中...' : '退出登录'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
