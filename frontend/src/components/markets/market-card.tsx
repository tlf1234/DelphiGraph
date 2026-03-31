import Link from 'next/link'
import { Database } from '@/lib/types/database.types'

type Market = Database['public']['Tables']['markets']['Row']

interface MarketCardProps {
  market: Market
  predictionCount: number
  consensusProbability: number | null
}

export function MarketCard({
  market,
  predictionCount,
  consensusProbability,
}: MarketCardProps) {
  // 计算剩余时间
  const closesAt = new Date(market.closes_at)
  const now = new Date()
  const timeRemaining = closesAt.getTime() - now.getTime()
  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24))
  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  // 状态样式
  const statusStyles = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    closed: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    resolved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }

  const statusText = {
    active: '活跃',
    closed: '已关闭',
    resolved: '已解决',
  }

  return (
    <Link href={`/searchs/${market.id}`}>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 hover:border-emerald-500/30 transition-all group">
        {/* 标题和状态 */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-xl font-semibold text-white group-hover:text-emerald-400 transition-colors flex-1">
            {market.title}
          </h3>
          <span
            className={`px-3 py-1 rounded-full text-xs font-mono border ${
              statusStyles[market.status]
            }`}
          >
            {statusText[market.status]}
          </span>
        </div>

        {/* 问题 */}
        <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{market.question}</p>

        {/* 共识概率 */}
        {consensusProbability !== null && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500 font-mono">市场共识</span>
              <span className="text-sm font-bold text-emerald-400">
                {(consensusProbability * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full transition-all"
                style={{ width: `${consensusProbability * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-800">
          <div>
            <div className="text-xs text-zinc-500 font-mono mb-1">参与人数</div>
            <div className="text-lg font-bold text-white">{predictionCount}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 font-mono mb-1">奖金池</div>
            <div className="text-lg font-bold text-white">¥{market.reward_pool}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 font-mono mb-1">
              {market.status === 'active' ? '剩余时间' : '截止时间'}
            </div>
            {market.status === 'active' && timeRemaining > 0 ? (
              <div className="text-lg font-bold text-white">
                {daysRemaining > 0 ? `${daysRemaining}天` : `${hoursRemaining}小时`}
              </div>
            ) : (
              <div className="text-sm font-mono text-zinc-400">
                {closesAt.toLocaleDateString('zh-CN')}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
