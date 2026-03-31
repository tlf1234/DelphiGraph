'use client'

import Link from 'next/link'
import { Clock, Sparkles } from 'lucide-react'

interface RecentDiscovery {
  taskId: string
  title: string
  createdAt: string
  status: string
}

interface RecentDiscoveriesProps {
  discoveries: RecentDiscovery[]
}

export function RecentDiscoveries({ discoveries }: RecentDiscoveriesProps) {
  if (discoveries.length === 0) {
    return null
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-12">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-5 h-5 text-blue-400" />
        <h2 className="text-xl font-bold">Recent Discoveries</h2>
      </div>

      <div className="space-y-2">
        {discoveries.map((discovery) => (
          <Link
            key={discovery.taskId}
            href={`/searchs/${discovery.taskId}`}
            className="
              flex items-center justify-between gap-4 p-3
              bg-zinc-900/30 border border-zinc-800/50 rounded-lg
              hover:border-blue-500/50 hover:bg-zinc-900/60
              transition-all duration-200
              group
            "
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0 animate-pulse" />
              
              <span className="text-sm text-white group-hover:text-blue-400 transition-colors truncate">
                {discovery.title}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`
                px-2 py-1 rounded text-xs font-mono
                ${discovery.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  discovery.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-zinc-700 text-zinc-400'}
              `}>
                {discovery.status}
              </span>
              
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Clock className="w-3 h-3" />
                <span>{formatTimeAgo(discovery.createdAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
