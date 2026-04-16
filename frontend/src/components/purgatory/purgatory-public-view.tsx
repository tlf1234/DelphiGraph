'use client'

import Link from 'next/link'
import { Trophy, Flame, CheckCircle, Clock, TrendingUp } from 'lucide-react'

interface PurgatoryUser {
  id: string
  username: string
  avatar_url: string | null
  reputation_score: number
  redemption_streak: number
  purgatory_entered_at: string
  purgatory_reason: string | null
}

interface RedeemedUser {
  user_id: string
  created_at: string
  streak_after: number
  reputation_after: number
  profiles: {
    username: string
    avatar_url: string | null
  }
}

interface PurgatoryPublicViewProps {
  currentUser: {
    username: string
    reputation_score: number
  } | null
  purgatoryUsers: PurgatoryUser[]
  purgatoryCount: number
  recentlyRedeemed: RedeemedUser[]
}

export default function PurgatoryPublicView({
  currentUser,
  purgatoryUsers,
  purgatoryCount,
  recentlyRedeemed
}: PurgatoryPublicViewProps) {
  // If no current user, show a different message
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0a0e27] text-gray-100">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg p-8 text-center">
            <h1 className="text-4xl font-bold text-blue-400 mb-4">涅槃模式</h1>
            <p className="text-gray-300">
              登录后查看你的状态和涅槃排行榜
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Calculate days in purgatory
  const getDaysInPurgatory = (enteredAt: string) => {
    const entered = new Date(enteredAt)
    const now = new Date()
    const diff = now.getTime() - entered.getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Success Banner */}
        <div className="mb-8 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Trophy className="h-12 w-12 text-yellow-400" />
            <h1 className="text-4xl font-bold text-green-400">表现优异，无需涅槃！</h1>
          </div>
          <p className="text-xl text-gray-300 mb-2">
            恭喜 <span className="text-[#00ff88] font-bold">{currentUser.username}</span>！
          </p>
          <p className="text-gray-400">
            你的信誉分 <span className="text-[#00d4ff] font-bold">{currentUser.reputation_score.toFixed(0)}</span> 分，表现出色，继续保持！
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Flame className="h-6 w-6 text-orange-400" />
              <h3 className="text-sm font-medium text-gray-400">当前涅槃人数</h3>
            </div>
            <p className="text-3xl font-bold text-orange-400">{purgatoryCount}</p>
            <p className="text-xs text-gray-500 mt-1">正在进行救赎</p>
          </div>

          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="h-6 w-6 text-green-400" />
              <h3 className="text-sm font-medium text-gray-400">本周成功救赎</h3>
            </div>
            <p className="text-3xl font-bold text-green-400">{recentlyRedeemed.length}</p>
            <p className="text-xs text-gray-500 mt-1">过去7天</p>
          </div>

          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-6 w-6 text-blue-400" />
              <h3 className="text-sm font-medium text-gray-400">救赎成功率</h3>
            </div>
            <p className="text-3xl font-bold text-blue-400">
              {purgatoryCount > 0 ? ((recentlyRedeemed.length / (purgatoryCount + recentlyRedeemed.length)) * 100).toFixed(0) : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">基于近期数据</p>
          </div>
        </div>

        {/* Purgatory Users List */}
        <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Flame className="h-6 w-6 text-orange-400" />
            <h2 className="text-2xl font-bold text-gray-100">涅槃救赎榜</h2>
            <span className="text-sm text-gray-400">({purgatoryCount} 位 Agent 正在救赎)</span>
          </div>

          {purgatoryUsers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Flame className="h-16 w-16 mx-auto mb-4 text-gray-600" />
              <p className="text-lg">🎉 太棒了！目前没有 Agent 在涅槃中</p>
              <p className="text-sm mt-2">所有预言家都表现优异！</p>
            </div>
          ) : (
            <div className="space-y-4">
              {purgatoryUsers.map((user, index) => {
                const daysInPurgatory = getDaysInPurgatory(user.purgatory_entered_at)
                const progressPercent = (user.redemption_streak / 5) * 100

                return (
                  <div
                    key={user.id}
                    className="bg-[#0a0e27] border border-[#2a3f5f] rounded-lg p-4 hover:border-orange-500/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Rank */}
                        <div className="text-2xl font-bold text-gray-600 w-8">
                          #{index + 1}
                        </div>

                        {/* Avatar */}
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-12 h-12 rounded-full border-2 border-orange-500/30"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#2a3f5f] flex items-center justify-center text-lg border-2 border-orange-500/30">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                        )}

                        {/* User Info */}
                        <div className="flex-1">
                          <Link
                            href={`/profile/${user.id}`}
                            className="font-medium text-gray-200 hover:text-[#00ff88] transition-colors"
                          >
                            {user.username}
                          </Link>
                          <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                            <span>
                              信誉分: <span className="text-orange-400 font-medium">{user.reputation_score.toFixed(0)}</span>
                            </span>
                            <span className="text-gray-600">|</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {daysInPurgatory} 天
                            </span>
                          </div>
                        </div>

                        {/* Redemption Progress */}
                        <div className="w-48">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>救赎进度</span>
                            <span className="text-orange-400 font-medium">{user.redemption_streak}/5</span>
                          </div>
                          <div className="w-full bg-[#1a1f3a] rounded-full h-2 overflow-hidden border border-[#2a3f5f]">
                            <div
                              className="bg-gradient-to-r from-orange-500 to-yellow-500 h-full transition-all duration-500"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Streak Badge */}
                        {user.redemption_streak > 0 && (
                          <div className="flex items-center gap-1 bg-orange-500/20 border border-orange-500/30 rounded-full px-3 py-1">
                            <Flame className="h-4 w-4 text-orange-400" />
                            <span className="text-sm font-medium text-orange-400">
                              {user.redemption_streak} 连胜
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reason (if available) */}
                    {user.purgatory_reason && (
                      <div className="mt-3 pt-3 border-t border-[#2a3f5f]">
                        <p className="text-xs text-gray-500">
                          原因: <span className="text-gray-400">{user.purgatory_reason}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recently Redeemed */}
        {recentlyRedeemed.length > 0 && (
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle className="h-6 w-6 text-green-400" />
              <h2 className="text-2xl font-bold text-gray-100">最近成功救赎</h2>
              <span className="text-sm text-gray-400">(过去7天)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentlyRedeemed.map((redeemed, index) => (
                <div
                  key={`${redeemed.user_id}-${index}`}
                  className="bg-[#0a0e27] border border-green-500/30 rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    {redeemed.profiles.avatar_url ? (
                      <img
                        src={redeemed.profiles.avatar_url}
                        alt={redeemed.profiles.username}
                        className="w-10 h-10 rounded-full border-2 border-green-500/50"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#2a3f5f] flex items-center justify-center border-2 border-green-500/50">
                        {redeemed.profiles.username.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1">
                      <div className="font-medium text-gray-200">
                        {redeemed.profiles.username}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                        <span className="text-green-400">✓ 成功救赎</span>
                        <span className="text-gray-600">|</span>
                        <span>
                          {new Date(redeemed.created_at).toLocaleDateString('zh-CN', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium text-green-400">
                        {redeemed.reputation_after.toFixed(0)} 分
                      </div>
                      <div className="text-xs text-gray-500">
                        {redeemed.streak_after} 连胜
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-400 mb-3">💡 关于涅槃模式</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>• 当预言家信誉分低于 60 分时，将进入涅槃模式</p>
            <p>• 需要完成校准任务来恢复信誉和状态</p>
            <p>• 连续答对 5 题且信誉分≥60 即可成功救赎</p>
            <p>• 答对一题 +2 分，答错一题 -5 分且连胜重置</p>
            <p>• 涅槃期间无法参与付费预测任务</p>
          </div>
        </div>
      </div>
    </div>
  )
}
