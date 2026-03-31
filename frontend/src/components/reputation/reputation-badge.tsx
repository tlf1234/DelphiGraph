'use client'

import { useState } from 'react'

interface ReputationBadgeProps {
  level: string
  score: number
  showTooltip?: boolean
  size?: 'sm' | 'md' | 'lg'
}

// Level configuration with detailed info
const levelConfig: Record<string, {
  icon: string
  color: string
  bgColor: string
  borderColor: string
  name: string
  minScore: number
  maxScore: number
  description: string
}> = {
  banned: {
    icon: '🚫',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    name: '封禁区',
    minScore: 0,
    maxScore: 59,
    description: '账号已被封禁，需要完成救赎任务恢复'
  },
  recovery: {
    icon: '📝',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    name: '见习预言家',
    minScore: 60,
    maxScore: 99,
    description: '恢复期，仅可参与公益任务'
  },
  apprentice: {
    icon: '🌱',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    name: '初级预言家',
    minScore: 100,
    maxScore: 199,
    description: '新手阶段，每日5次预测，最高参与100元市场'
  },
  intermediate: {
    icon: '🔰',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    name: '中级预言家',
    minScore: 200,
    maxScore: 299,
    description: '进阶阶段，每日10次预测，最高参与500元市场'
  },
  advanced: {
    icon: '⭐',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    name: '高级预言家',
    minScore: 300,
    maxScore: 399,
    description: '高级阶段，每日20次预测，最高参与1000元市场'
  },
  expert: {
    icon: '💎',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    name: '专家预言家',
    minScore: 400,
    maxScore: 499,
    description: '专家阶段，无限预测次数，最高参与5000元市场'
  },
  master: {
    icon: '👑',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    name: '大师预言家',
    minScore: 500,
    maxScore: 999,
    description: 'B端定制，无限预测次数，无市场限制'
  },
  legend: {
    icon: '🏆',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    name: '传奇预言家',
    minScore: 1000,
    maxScore: 999999,
    description: '平台合伙人，最高权限和收益分成'
  }
}

export default function ReputationBadge({
  level,
  score,
  showTooltip = true,
  size = 'md'
}: ReputationBadgeProps) {
  const [showDetails, setShowDetails] = useState(false)
  const config = levelConfig[level] || levelConfig.apprentice

  // Size configurations
  const sizeClasses = {
    sm: {
      container: 'px-2 py-1',
      icon: 'text-sm',
      text: 'text-xs',
      score: 'text-xs'
    },
    md: {
      container: 'px-3 py-1.5',
      icon: 'text-base',
      text: 'text-sm',
      score: 'text-sm'
    },
    lg: {
      container: 'px-4 py-2',
      icon: 'text-xl',
      text: 'text-base',
      score: 'text-base'
    }
  }

  const sizes = sizeClasses[size]

  return (
    <div className="relative inline-block">
      <div
        className={`
          flex items-center gap-2 rounded-lg border
          ${config.bgColor} ${config.borderColor} ${sizes.container}
          transition-all duration-200 hover:scale-105
          ${showTooltip ? 'cursor-help' : ''}
        `}
        onMouseEnter={() => showTooltip && setShowDetails(true)}
        onMouseLeave={() => showTooltip && setShowDetails(false)}
      >
        <span className={sizes.icon}>{config.icon}</span>
        <span className={`font-medium ${config.color} ${sizes.text}`}>
          {config.name}
        </span>
        <span className={`font-bold text-gray-300 ${sizes.score}`}>
          {score.toFixed(0)}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && showDetails && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64">
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{config.icon}</span>
              <div>
                <div className={`font-bold ${config.color}`}>
                  {config.name}
                </div>
                <div className="text-xs text-gray-400">
                  {config.minScore} - {config.maxScore} 分
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              {config.description}
            </p>
            <div className="text-xs text-gray-400">
              当前分数: <span className="text-[#00d4ff] font-medium">{score.toFixed(0)}</span>
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
            <div className="border-8 border-transparent border-t-[#2a3f5f]"></div>
          </div>
        </div>
      )}
    </div>
  )
}
