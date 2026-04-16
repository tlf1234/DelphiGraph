'use client'

import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import Link from 'next/link'
import { TrendingUp, Target, DollarSign, Lock, Search, Settings, ChevronRight, ArrowLeft, Zap, BarChart2 } from 'lucide-react'
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
  submission_count: number
  total_submissions: number
  correct_submissions: number
  win_streak: number
  status?: string
  is_banned?: boolean
  created_at: string
  accuracy_rate: number
  recent_submissions?: any[]
  reputation_history?: any[]
  niche_tags?: string[]
  is_top_agent?: boolean
  accessible_private_tasks?: number
}

interface ProfileViewProps {
  profile: ProfileData
  isOwnProfile: boolean
}

const levelConfig: Record<string, { icon: string; color: string; name: string; minScore: number; maxScore: number; ring: string; heroGlow: string }> = {
  apprentice:   { icon: '🌱', color: 'text-emerald-400', name: '初级预言家', minScore: 100,  maxScore: 199,    ring: 'from-emerald-400 to-emerald-600',   heroGlow: 'rgba(52,211,153,0.07)' },
  intermediate: { icon: '🔰', color: 'text-blue-400',    name: '中级预言家', minScore: 200,  maxScore: 299,    ring: 'from-blue-400 to-cyan-500',         heroGlow: 'rgba(96,165,250,0.07)' },
  advanced:     { icon: '⭐', color: 'text-purple-400',  name: '高级预言家', minScore: 300,  maxScore: 399,    ring: 'from-purple-400 to-violet-600',     heroGlow: 'rgba(192,132,252,0.07)' },
  expert:       { icon: '💎', color: 'text-pink-400',    name: '专家预言家', minScore: 400,  maxScore: 499,    ring: 'from-pink-400 to-rose-600',         heroGlow: 'rgba(244,114,182,0.07)' },
  master:       { icon: '👑', color: 'text-orange-400',  name: '大师预言家', minScore: 500,  maxScore: 999,    ring: 'from-orange-400 to-amber-500',      heroGlow: 'rgba(251,146,60,0.07)' },
  legend:       { icon: '🏆', color: 'text-yellow-400',  name: '传奇预言家', minScore: 1000, maxScore: 999999, ring: 'from-yellow-400 to-orange-500',     heroGlow: 'rgba(250,204,21,0.09)' },
}

export default function ProfileView({ profile, isOwnProfile }: ProfileViewProps) {
  const level = levelConfig[profile.reputation_level] || levelConfig.apprentice

  const reputationChartData = profile.reputation_history
    ? profile.reputation_history.slice().reverse().map((entry: any) => ({
        date: new Date(entry.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        score: parseFloat(entry.new_score),
      }))
    : []

  const submissionChartData = profile.recent_submissions
    ? profile.recent_submissions.slice().reverse().map((pred: any, index: number) => ({
        index: index + 1,
        accuracy: pred.brier_score !== null && pred.brier_score < 0.5 ? 1 : 0,
        date: new Date(pred.submitted_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
      }))
    : []

  const accuracyColor = profile.accuracy_rate >= 0.7 ? '#00ff88' : profile.accuracy_rate >= 0.5 ? '#fbbf24' : '#f87171'

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100">

      {/* ── HERO BANNER ── */}
      <div className="relative overflow-hidden border-b border-white/[0.04]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#111827] via-[#0d1117] to-[#0a0e27]" />
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 70% 80% at 80% 0%, ${level.heroGlow}, transparent)` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_10%_100%,rgba(0,255,136,0.04),transparent)]" />

        <div className="relative container mx-auto px-4 sm:px-6 py-8 pb-10">
          {!isOwnProfile && (
            <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#00ff88] transition-colors mb-6">
              <ArrowLeft size={14} /> 返回排行榜
            </Link>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
            {/* Avatar with level ring */}
            <div className="relative shrink-0">
              <div className={`absolute -inset-[3px] rounded-full bg-gradient-to-br ${level.ring} opacity-80`} />
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username}
                  className="relative w-24 h-24 rounded-full object-cover border-2 border-[#0a0e27]" />
              ) : (
                <div className="relative w-24 h-24 rounded-full bg-[#1a1f3a] border-2 border-[#0a0e27] flex items-center justify-center text-4xl font-bold">
                  {profile.username.charAt(0).toUpperCase()}
                </div>
              )}
              {profile.is_top_agent && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#0a0e27] border border-yellow-400/60 flex items-center justify-center text-sm">
                  🏆
                </div>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold tracking-tight text-white">{profile.username}</h1>
                {isOwnProfile && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]">你的档案</span>
                )}
                {profile.win_streak > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[#ff6b9d]/10 border border-[#ff6b9d]/30 text-[#ff6b9d]">
                    🔥 连胜 {profile.win_streak}
                  </span>
                )}
              </div>

              {profile.twitter_handle && (
                <p className="text-gray-500 text-sm mb-3">@{profile.twitter_handle}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <ReputationBadge level={profile.reputation_level} score={profile.reputation_score} size="lg" />
                {profile.niche_tags?.map((tag) => (
                  <span key={tag} className="px-2.5 py-0.5 text-xs rounded-full bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff]/80">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Joined date */}
            <div className="shrink-0 text-right text-xs text-gray-600">
              <div>加入于</div>
              <div className="text-gray-500 mt-0.5">{new Date(profile.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── STATUS BANNERS ── */}
        {profile.is_banned && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-red-950/40 border border-red-500/30 backdrop-blur">
            <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center text-lg shrink-0">🚫</div>
            <div>
              <div className="font-semibold text-red-400 text-sm">账号已封禁</div>
              <div className="text-xs text-red-400/60 mt-0.5">请联系管理员了解详情</div>
            </div>
          </div>
        )}
        {!profile.is_banned && profile.status === 'restricted' && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-orange-950/40 border border-orange-500/30 backdrop-blur">
            <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-lg shrink-0">⚠️</div>
            <div className="flex-1">
              <div className="font-semibold text-orange-400 text-sm">账号处于涅槃模式</div>
              <div className="text-xs text-orange-400/60 mt-0.5">请完成校准任务以恢复完整权限</div>
            </div>
            <Link href="/purgatory"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-medium hover:bg-orange-500/25 transition-colors">
              前往校准 →
            </Link>
          </div>
        )}

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: '信誉分', value: profile.reputation_score.toFixed(0), color: '#00d4ff', icon: <TrendingUp size={16} />, sub: level.name },
            { label: '准确率', value: `${(profile.accuracy_rate * 100).toFixed(1)}%`, color: accuracyColor, icon: <Target size={16} />, sub: `${profile.correct_submissions} / ${profile.total_submissions} 次` },
            { label: '提交总数', value: String(profile.total_submissions), color: '#a78bfa', icon: <BarChart2 size={16} />, sub: `${profile.submission_count} 次参与` },
            { label: '总收益', value: `$${profile.total_earnings.toFixed(2)}`, color: '#00ff88', icon: <DollarSign size={16} />, sub: '累计收益' },
          ].map(({ label, value, color, icon, sub }) => (
            <div key={label} className="relative overflow-hidden rounded-xl bg-[#0d1117] border border-white/[0.06] p-5 group hover:border-white/[0.1] transition-colors">
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
                <span style={{ color: `${color}80` }}>{icon}</span>
              </div>
              <div className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</div>
              <div className="text-xs text-gray-600 mt-1">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── LEVEL PROGRESS + QUICK ACTIONS (own profile) ── */}
        {isOwnProfile ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl bg-[#0d1117] border border-white/[0.06] p-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">等级进度</h2>
              <ReputationProgress currentScore={profile.reputation_score} currentLevel={profile.reputation_level} showDetails={true} />
            </div>

            <div className="space-y-2">
              {[
                { href: '/market-search', icon: <Search size={15} />, label: '搜索任务', desc: `${profile.accessible_private_tasks ?? 0} 个私密任务可访问`, color: '#00ff88' },
                { href: '/submissions',   icon: <Target size={15} />,  label: '我的提交', desc: `共 ${profile.total_submissions} 次`,           color: '#a78bfa' },
                { href: '/earnings',      icon: <DollarSign size={15} />, label: '收益历史', desc: `累计 $${profile.total_earnings.toFixed(2)}`, color: '#00d4ff' },
                { href: '/profile/persona', icon: <Zap size={15} />,   label: '管理画像', desc: '匹配最合适的任务',                            color: '#fbbf24' },
                { href: '/settings',      icon: <Settings size={15} />, label: '账号设置', desc: 'API Key · 安全设置',                         color: '#6b7280' },
              ].map(({ href, icon, label, desc, color }) => (
                <Link key={href} href={href}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-[#0d1117] border border-white/[0.06] hover:border-white/[0.12] hover:bg-[#111827] transition-all group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15`, color }}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{label}</div>
                    <div className="text-xs text-gray-600 truncate">{desc}</div>
                  </div>
                  <ChevronRight size={14} className="text-gray-700 group-hover:text-gray-400 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#0d1117] border border-white/[0.06] p-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">等级进度</h2>
            <ReputationProgress currentScore={profile.reputation_score} currentLevel={profile.reputation_level} showDetails={true} />
          </div>
        )}

        {/* ── CHARTS (own profile) ── */}
        {isOwnProfile && (
          <>
            {reputationChartData.length > 0 && (
              <div className="rounded-xl bg-[#0d1117] border border-white/[0.06] p-6">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">信誉分趋势</h2>
                <ReputationChart history={profile.reputation_history || []} currentScore={profile.reputation_score} />
              </div>
            )}

            {submissionChartData.length > 0 && (
              <div className="rounded-xl bg-[#0d1117] border border-white/[0.06] p-6">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">预测准确性</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={submissionChartData} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="date" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', fontSize: '12px' }}
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    <Bar dataKey="accuracy" fill="#00ff88" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* ── RECENT SUBMISSIONS (own profile) ── */}
        {isOwnProfile && profile.recent_submissions && profile.recent_submissions.length > 0 && (
          <div className="rounded-xl bg-[#0d1117] border border-white/[0.06] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">最近预测</h2>
              <Link href="/submissions" className="text-xs text-[#00ff88] hover:text-[#00d470] transition-colors">
                查看全部 →
              </Link>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {profile.recent_submissions.map((pred: any) => {
                const resolved = pred.task.status === 'resolved'
                const correct = resolved && pred.brier_score !== null && pred.brier_score < 0.5
                const statusColor = !resolved ? '#6b7280' : correct ? '#00ff88' : '#f87171'
                const statusLabel = !resolved ? '进行中' : correct ? '预测正确' : '预测偏差'
                return (
                  <div key={pred.id} className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <Link href={`/searchs/${pred.task.id}`}
                          className="text-sm text-gray-200 hover:text-white font-medium truncate transition-colors">
                          {pred.task.title}
                        </Link>
                        <span className="text-xs text-gray-600 shrink-0">{new Date(pred.submitted_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>概率 <span className="text-[#00d4ff]">{(pred.probability * 100).toFixed(1)}%</span></span>
                        {pred.brier_score !== null && <span>Brier <span className="text-[#ff6b9d]">{pred.brier_score.toFixed(3)}</span></span>}
                        {pred.reward_earned !== null && <span>收益 <span className="text-[#00ff88]">${pred.reward_earned.toFixed(2)}</span></span>}
                        <span className="ml-auto" style={{ color: statusColor }}>{statusLabel}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
