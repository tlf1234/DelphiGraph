'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import Link from 'next/link'
import ReputationBadge from '@/components/reputation/reputation-badge'
import ReputationProgress from '@/components/reputation/reputation-progress'
import ReputationChart from '@/components/reputation/reputation-chart'

interface ProfileData {
  id: string
  username: string
  twitter_handle: string | null
  avatar_url: string | null
  reputation_score: number
  reputation_level: string
  total_earnings: number
  prediction_count: number
  total_predictions: number
  correct_predictions: number
  win_streak: number
  status?: string
  is_banned?: boolean
  created_at: string
  accuracy_rate: number
  recent_predictions?: any[]
  reputation_history?: any[]
}

interface ProfileViewProps {
  profile: ProfileData
  isOwnProfile: boolean
}

// Level badge configuration
const levelConfig: Record<string, { icon: string; color: string; name: string; minScore: number; maxScore: number }> = {
  apprentice: { icon: '🌱', color: 'text-green-400', name: '初级预言家', minScore: 100, maxScore: 199 },
  intermediate: { icon: '🔰', color: 'text-blue-400', name: '中级预言家', minScore: 200, maxScore: 299 },
  advanced: { icon: '⭐', color: 'text-purple-400', name: '高级预言家', minScore: 300, maxScore: 399 },
  expert: { icon: '💎', color: 'text-pink-400', name: '专家预言家', minScore: 400, maxScore: 499 },
  master: { icon: '👑', color: 'text-orange-400', name: '大师预言家', minScore: 500, maxScore: 999 },
  legend: { icon: '🏆', color: 'text-yellow-400', name: '传奇预言家', minScore: 1000, maxScore: 999999 },
}

export default function ProfileView({ profile, isOwnProfile }: ProfileViewProps) {
  const level = levelConfig[profile.reputation_level] || levelConfig.apprentice

  // Prepare reputation history chart data
  const reputationChartData = profile.reputation_history
    ? profile.reputation_history
        .slice()
        .reverse()
        .map((entry: any) => ({
          date: new Date(entry.created_at).toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
          }),
          score: parseFloat(entry.new_score),
        }))
    : []

  // Prepare recent predictions chart data (accuracy over time)
  const predictionChartData = profile.recent_predictions
    ? profile.recent_predictions
        .slice()
        .reverse()
        .map((pred: any, index: number) => {
          const isCorrect = pred.brier_score !== null && pred.brier_score < 0.5
          return {
            index: index + 1,
            accuracy: isCorrect ? 1 : 0,
            date: new Date(pred.submitted_at).toLocaleDateString('zh-CN', {
              month: 'short',
              day: 'numeric',
            }),
          }
        })
    : []

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/leaderboard"
            className="text-[#00ff88] hover:underline mb-4 inline-block"
          >
            ← 返回排行榜
          </Link>
          <div className="flex items-start gap-6">
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="w-24 h-24 rounded-full border-4 border-[#2a3f5f]"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#2a3f5f] flex items-center justify-center text-4xl border-4 border-[#2a3f5f]">
                {profile.username.charAt(0).toUpperCase()}
              </div>
            )}

            {/* User Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-100 mb-2">
                {profile.username}
                {isOwnProfile && (
                  <span className="ml-3 text-lg text-[#00ff88]">(你的档案)</span>
                )}
              </h1>
              {profile.twitter_handle && (
                <p className="text-gray-400 mb-4">@{profile.twitter_handle}</p>
              )}
              <div className="flex items-center gap-4">
                <ReputationBadge
                  level={profile.reputation_level}
                  score={profile.reputation_score}
                  size="lg"
                />
                {profile.win_streak > 0 && (
                  <div className="text-[#ff6b9d] font-medium">
                    🔥 连胜 {profile.win_streak}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Persona Management Link (Own Profile Only) */}
        {isOwnProfile && (
          <div className="mb-6">
            <Link
              href="/profile/persona"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#00ff88] text-[#0a0e27] rounded-lg hover:bg-[#00d470] transition-colors font-medium"
            >
              <span>📝</span>
              <span>管理用户画像</span>
            </Link>
            <p className="text-sm text-gray-400 mt-2">
              填写您的画像信息，帮助平台为您匹配最合适的任务
            </p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-1">信誉分</div>
            <div className="text-3xl font-bold text-[#00d4ff]">
              {profile.reputation_score.toFixed(0)}
            </div>
          </div>
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-1">预测数</div>
            <div className="text-3xl font-bold text-gray-100">
              {profile.prediction_count}
            </div>
          </div>
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-1">准确率</div>
            <div className={`text-3xl font-bold ${
              profile.accuracy_rate >= 0.7
                ? 'text-green-400'
                : profile.accuracy_rate >= 0.5
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}>
              {(profile.accuracy_rate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-1">总收益</div>
            <div className="text-3xl font-bold text-[#00ff88]">
              ${profile.total_earnings.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Level Progress */}
        <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">等级进度</h2>
          <ReputationProgress
            currentScore={profile.reputation_score}
            currentLevel={profile.reputation_level}
            showDetails={true}
          />
        </div>

        {/* Charts */}
        {isOwnProfile && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Reputation History Chart */}
            {reputationChartData.length > 0 && (
              <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6 lg:col-span-2">
                <h2 className="text-xl font-bold mb-4">信誉分历史</h2>
                <ReputationChart
                  history={profile.reputation_history || []}
                  currentScore={profile.reputation_score}
                />
              </div>
            )}

            {/* Recent Predictions Chart */}
            {predictionChartData.length > 0 && (
              <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6 lg:col-span-2">
                <h2 className="text-xl font-bold mb-4">最近预测表现</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={predictionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3f5f" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1f3a',
                        border: '1px solid #2a3f5f',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar
                      dataKey="accuracy"
                      fill="#00ff88"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Recent Predictions List (Own Profile Only) */}
        {isOwnProfile && profile.recent_predictions && profile.recent_predictions.length > 0 && (
          <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">最近预测</h2>
            <div className="space-y-4">
              {profile.recent_predictions.map((pred: any) => (
                <div
                  key={pred.id}
                  className="bg-[#0a0e27] border border-[#2a3f5f] rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <Link
                      href={`/searchs/${pred.market.id}`}
                      className="text-[#00ff88] hover:underline font-medium"
                    >
                      {pred.market.title}
                    </Link>
                    <span className="text-sm text-gray-400">
                      {new Date(pred.submitted_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400">
                      预测概率: <span className="text-[#00d4ff] font-medium">{(pred.probability * 100).toFixed(1)}%</span>
                    </span>
                    {pred.brier_score !== null && (
                      <span className="text-gray-400">
                        Brier Score: <span className="text-[#ff6b9d] font-medium">{pred.brier_score.toFixed(3)}</span>
                      </span>
                    )}
                    {pred.reward_earned !== null && (
                      <span className="text-gray-400">
                        收益: <span className="text-[#00ff88] font-medium">${pred.reward_earned.toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
