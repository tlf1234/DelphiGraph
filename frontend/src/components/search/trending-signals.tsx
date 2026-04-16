'use client'

import Link from 'next/link'
import { TrendingUp, Users } from 'lucide-react'

interface TrendingSignal {
  taskId: string
  title: string
  consensusProbability: number
  signalCount: number
  trend: 'up' | 'down' | 'stable'
}

interface TrendingSignalsProps {
  signals: TrendingSignal[]
}

export function TrendingSignals({ signals }: TrendingSignalsProps) {
  if (signals.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-16">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h2 className="text-xl font-bold">Trending Signals</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {signals.map((item) => (
          <Link
            key={item.taskId}
            href={`/searchs/${item.taskId}`}
            className="
              bg-zinc-900/50 border border-zinc-800 rounded-lg p-4
              hover:border-emerald-500/50 hover:bg-zinc-900/80
              transition-all duration-200
              group
            "
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors line-clamp-2 flex-1">
                {item.title}
              </h3>
              
              {/* 趋势指示器 */}
              <div className={`
                flex-shrink-0 px-2 py-1 rounded text-xs font-mono
                ${item.trend === 'up' ? 'bg-green-500/20 text-green-400' :
                  item.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                  'bg-zinc-700 text-zinc-400'}
              `}>
                {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span className="text-emerald-400 font-semibold">
                  {(item.consensusProbability * 100).toFixed(0)}%
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>{item.signalCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
