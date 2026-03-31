'use client'

interface ReputationProgressProps {
  currentScore: number
  currentLevel: string
  showDetails?: boolean
}

// Level configuration
const levelConfig: Record<string, {
  icon: string
  color: string
  gradientFrom: string
  gradientTo: string
  name: string
  minScore: number
  maxScore: number
}> = {
  banned: {
    icon: '🚫',
    color: 'text-red-400',
    gradientFrom: '#ef4444',
    gradientTo: '#dc2626',
    name: '封禁区',
    minScore: 0,
    maxScore: 59
  },
  recovery: {
    icon: '📝',
    color: 'text-yellow-400',
    gradientFrom: '#eab308',
    gradientTo: '#ca8a04',
    name: '见习预言家',
    minScore: 60,
    maxScore: 99
  },
  apprentice: {
    icon: '🌱',
    color: 'text-green-400',
    gradientFrom: '#00ff88',
    gradientTo: '#00cc6a',
    name: '初级预言家',
    minScore: 100,
    maxScore: 199
  },
  intermediate: {
    icon: '🔰',
    color: 'text-blue-400',
    gradientFrom: '#00d4ff',
    gradientTo: '#0099cc',
    name: '中级预言家',
    minScore: 200,
    maxScore: 299
  },
  advanced: {
    icon: '⭐',
    color: 'text-purple-400',
    gradientFrom: '#a855f7',
    gradientTo: '#7c3aed',
    name: '高级预言家',
    minScore: 300,
    maxScore: 399
  },
  expert: {
    icon: '💎',
    color: 'text-pink-400',
    gradientFrom: '#ec4899',
    gradientTo: '#db2777',
    name: '专家预言家',
    minScore: 400,
    maxScore: 499
  },
  master: {
    icon: '👑',
    color: 'text-orange-400',
    gradientFrom: '#f97316',
    gradientTo: '#ea580c',
    name: '大师预言家',
    minScore: 500,
    maxScore: 999
  },
  legend: {
    icon: '🏆',
    color: 'text-yellow-400',
    gradientFrom: '#fbbf24',
    gradientTo: '#f59e0b',
    name: '传奇预言家',
    minScore: 1000,
    maxScore: 999999
  }
}

// Get next level
function getNextLevel(currentLevel: string): string | null {
  const levels = ['banned', 'recovery', 'apprentice', 'intermediate', 'advanced', 'expert', 'master', 'legend']
  const currentIndex = levels.indexOf(currentLevel)
  if (currentIndex === -1 || currentIndex === levels.length - 1) {
    return null
  }
  return levels[currentIndex + 1]
}

export default function ReputationProgress({
  currentScore,
  currentLevel,
  showDetails = true
}: ReputationProgressProps) {
  const level = levelConfig[currentLevel] || levelConfig.apprentice
  const nextLevelKey = getNextLevel(currentLevel)
  const nextLevel = nextLevelKey ? levelConfig[nextLevelKey] : null

  // Calculate progress
  const progressInLevel = currentScore - level.minScore
  const levelRange = level.maxScore - level.minScore
  const progressPercent = Math.min(Math.max((progressInLevel / levelRange) * 100, 0), 100)
  const pointsToNext = nextLevel ? Math.max(0, nextLevel.minScore - currentScore) : 0

  // Check if max level
  const isMaxLevel = !nextLevel || currentLevel === 'legend'

  return (
    <div className="space-y-3">
      {/* Current and Next Level */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{level.icon}</span>
          <div>
            <div className={`font-bold ${level.color}`}>
              {level.name}
            </div>
            <div className="text-xs text-gray-400">
              {currentScore.toFixed(0)} 分
            </div>
          </div>
        </div>

        {!isMaxLevel && nextLevel && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs text-gray-400">下一等级</div>
              <div className={`font-bold text-sm ${nextLevel.color}`}>
                {nextLevel.name}
              </div>
            </div>
            <span className="text-2xl">{nextLevel.icon}</span>
          </div>
        )}

        {isMaxLevel && (
          <div className="text-right">
            <div className="text-xs text-gray-400">已达到</div>
            <div className="font-bold text-sm text-yellow-400">
              最高等级 🎉
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-[#0a0e27] rounded-full h-4 overflow-hidden border border-[#2a3f5f]">
          <div
            className="h-full transition-all duration-500 ease-out relative"
            style={{
              width: `${progressPercent}%`,
              background: `linear-gradient(to right, ${level.gradientFrom}, ${level.gradientTo})`
            }}
          >
            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
          </div>
        </div>

        {/* Progress Details */}
        {showDetails && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">
              {level.minScore} 分
            </span>
            <span className="text-gray-300 font-medium">
              {progressPercent.toFixed(1)}% 完成
            </span>
            <span className="text-gray-400">
              {isMaxLevel ? '∞' : `${level.maxScore} 分`}
            </span>
          </div>
        )}

        {/* Points to Next Level */}
        {!isMaxLevel && nextLevel && (
          <div className="text-center">
            <span className="text-sm text-gray-400">
              还需 <span className="text-[#00ff88] font-bold">{pointsToNext.toFixed(0)}</span> 分升级到
              <span className={`font-bold ml-1 ${nextLevel.color}`}>
                {nextLevel.name}
              </span>
            </span>
          </div>
        )}

        {isMaxLevel && (
          <div className="text-center text-sm text-yellow-400 font-medium">
            🎊 恭喜！你已经是传奇预言家了！
          </div>
        )}
      </div>

      {/* Level Milestones (optional) */}
      {showDetails && !isMaxLevel && (
        <div className="flex justify-between items-center pt-2 border-t border-[#2a3f5f]">
          {Object.entries(levelConfig).map(([key, config]) => {
            const isPast = currentScore >= config.minScore
            const isCurrent = key === currentLevel
            
            return (
              <div
                key={key}
                className={`flex flex-col items-center transition-all ${
                  isPast ? 'opacity-100' : 'opacity-30'
                }`}
              >
                <span className={`text-xs ${isCurrent ? 'text-xl' : 'text-sm'}`}>
                  {config.icon}
                </span>
                {isCurrent && (
                  <div className="w-1 h-1 rounded-full bg-[#00ff88] mt-1"></div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
