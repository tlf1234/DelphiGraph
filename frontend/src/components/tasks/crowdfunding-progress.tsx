'use client'

import { DollarSign, Users } from 'lucide-react'

interface CrowdfundingProgressProps {
  fundingGoal: number
  fundingCurrent: number
  contributorCount?: number
  className?: string
}

export function CrowdfundingProgress({
  fundingGoal,
  fundingCurrent,
  contributorCount,
  className = ''
}: CrowdfundingProgressProps) {
  const progress = fundingCurrent / fundingGoal
  const progressPercent = Math.min(progress * 100, 100)
  const isGoalReached = progress >= 1

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Amount and Progress */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3 h-3" />
          <span>
            ${fundingCurrent.toFixed(0)} / ${fundingGoal.toFixed(0)}
          </span>
        </div>
        <span className={`font-semibold ${isGoalReached ? 'text-green-400' : 'text-blue-400'}`}>
          {progressPercent.toFixed(0)}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
        <div
          className={`
            h-full rounded-full transition-all duration-500 ease-out
            ${isGoalReached 
              ? 'bg-gradient-to-r from-green-500 to-emerald-400' 
              : 'bg-gradient-to-r from-blue-500 to-cyan-400'
            }
          `}
          style={{ width: `${progressPercent}%` }}
        >
          {/* Animated shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      </div>

      {/* Contributor Count */}
      {contributorCount !== undefined && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Users className="w-3 h-3" />
          <span>{contributorCount} 贡献者</span>
        </div>
      )}

      {/* Goal Reached Badge */}
      {isGoalReached && (
        <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
          <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span>目标已达成！任务已激活</span>
        </div>
      )}
    </div>
  )
}
