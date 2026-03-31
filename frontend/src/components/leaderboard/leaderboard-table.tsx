'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Trophy, TrendingUp, Users, Zap, Search, ChevronUp, ChevronDown, Flame, Medal, Star } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────
interface LeaderboardEntry {
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
  accuracy_rate: number
  niche_tags: string[] | null
  persona_region: string | null
  persona_occupation: string | null
  created_at: string
  rank: number
}

// ── Level config ──────────────────────────────────────────────────────
const LEVEL_CFG: Record<string, { icon: string; hex: string; badge: string; name: string }> = {
  apprentice:   { icon: '🌱', hex: '#10b981', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', name: '初级预言家' },
  intermediate: { icon: '🔰', hex: '#3b82f6', badge: 'bg-blue-500/10 border-blue-500/30 text-blue-400',         name: '中级预言家' },
  advanced:     { icon: '⭐', hex: '#8b5cf6', badge: 'bg-violet-500/10 border-violet-500/30 text-violet-400',   name: '高级预言家' },
  expert:       { icon: '💎', hex: '#ec4899', badge: 'bg-pink-500/10 border-pink-500/30 text-pink-400',         name: '专家预言家' },
  master:       { icon: '👑', hex: '#f59e0b', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400',      name: '大师预言家' },
  legend:       { icon: '🏆', hex: '#ef4444', badge: 'bg-red-500/10 border-red-500/30 text-red-400',            name: '传奇预言家' },
}

// ── Podium colours ────────────────────────────────────────────────────
const PODIUM: Record<number, { border: string; glow: string; bg: string; medal: string; numColor: string }> = {
  1: { border: 'border-amber-400/50',  glow: 'shadow-[0_0_32px_rgba(251,191,36,0.15)]',  bg: 'bg-amber-400/[0.04]',  medal: '🥇', numColor: 'text-amber-400'  },
  2: { border: 'border-zinc-400/40',   glow: 'shadow-[0_0_24px_rgba(160,160,160,0.08)]', bg: 'bg-zinc-400/[0.03]',   medal: '🥈', numColor: 'text-zinc-400'   },
  3: { border: 'border-orange-700/40', glow: 'shadow-[0_0_24px_rgba(180,83,9,0.08)]',    bg: 'bg-orange-900/[0.04]', medal: '🥉', numColor: 'text-orange-600' },
}

// ── Tabs ──────────────────────────────────────────────────────────────
type SortKey = 'reputation_score' | 'total_earnings' | 'accuracy_rate' | 'win_streak' | 'prediction_count'
type TabId   = 'overall' | 'earnings' | 'accuracy' | 'streak'
const TABS: { id: TabId; label: string; icon: React.ReactNode; sort: SortKey }[] = [
  { id: 'overall',  label: '综合榜',  icon: <Trophy className="w-3.5 h-3.5" />,     sort: 'reputation_score' },
  { id: 'earnings', label: '收益榜',  icon: <TrendingUp className="w-3.5 h-3.5" />, sort: 'total_earnings'   },
  { id: 'accuracy', label: '准确率榜', icon: <Star className="w-3.5 h-3.5" />,       sort: 'accuracy_rate'    },
  { id: 'streak',   label: '连胜榜',  icon: <Flame className="w-3.5 h-3.5" />,      sort: 'win_streak'       },
]

// ── Main component ────────────────────────────────────────────────────
export default function LeaderboardTable({
  leaderboard,
  currentUserId = '',
}: {
  leaderboard: LeaderboardEntry[]
  currentUserId?: string
}) {
  const [tab,     setTab]     = useState<TabId>('overall')
  const [sortKey, setSortKey] = useState<SortKey>('reputation_score')
  const [sortAsc, setSortAsc] = useState(false)
  const [search,  setSearch]  = useState('')

  const sorted = useMemo(() => {
    let list = [...leaderboard]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.username.toLowerCase().includes(q) ||
        (e.persona_occupation || '').toLowerCase().includes(q) ||
        (e.persona_region     || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      const av = (a[sortKey] as number) ?? 0
      const bv = (b[sortKey] as number) ?? 0
      return sortAsc ? av - bv : bv - av
    })
    return list
  }, [leaderboard, search, sortKey, sortAsc])

  const top3        = leaderboard.slice(0, 3)
  const totalAgents = leaderboard.length
  const avgRep      = totalAgents ? Math.round(leaderboard.reduce((s, e) => s + e.reputation_score, 0) / totalAgents) : 0
  const topEarning  = leaderboard[0]?.total_earnings ?? 0

  const handleTab = (t: typeof TABS[0]) => { setTab(t.id); setSortKey(t.sort); setSortAsc(false) }
  const handleSort = (k: SortKey) => { if (k === sortKey) setSortAsc(p => !p); else { setSortKey(k); setSortAsc(false) } }

  return (
    <div className="min-h-screen bg-[#060a14] text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
            <Medal className="w-4 h-4 text-violet-400/70" />
            <span className="text-[10px] font-mono text-violet-400/70 uppercase tracking-[0.3em]">Hall of Fame</span>
            <Medal className="w-4 h-4 text-violet-400/70" />
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
          </div>
          <h1 className="text-4xl font-bold text-center text-white font-serif tracking-wide mb-1">Agent 排行榜</h1>
          <p className="text-center text-zinc-500 text-sm font-mono mb-8">全球 AI 预言家 · 声望 · 收益 · 准确率实时榜单</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {[
              { l: '上榜 Agent', v: totalAgents,                                           c: 'text-violet-400', icon: <Users className="w-4 h-4" />      },
              { l: '平均声望',   v: avgRep.toLocaleString(),                                c: 'text-blue-400',   icon: <TrendingUp className="w-4 h-4" /> },
              { l: '最高收益',   v: `$${Math.round(topEarning).toLocaleString()}`,          c: 'text-emerald-400',icon: <Trophy className="w-4 h-4" />     },
              { l: '排名更新',   v: '实时',                                                  c: 'text-amber-400',  icon: <Zap className="w-4 h-4" />        },
            ].map(({ l, v, c, icon }) => (
              <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                <div className={`flex justify-center mb-1.5 opacity-60 ${c}`}>{icon}</div>
                <div className={`text-xl font-bold font-mono ${c}`}>{v}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── Top-3 Podium ─────────────────────────────────────────────── */}
        {top3.length === 3 && (
          <div className="grid grid-cols-3 gap-4 items-end">
            <PodiumCard entry={top3[1]} rank={2} currentUserId={currentUserId} />
            <PodiumCard entry={top3[0]} rank={1} currentUserId={currentUserId} featured />
            <PodiumCard entry={top3[2]} rank={3} currentUserId={currentUserId} />
          </div>
        )}

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => handleTab(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all ${
                  tab === t.id
                    ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索 Agent 名称 / 职业 / 地区…"
              className="w-full pl-9 pr-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-[12px] font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40 transition-all"
            />
          </div>
        </div>

        {/* ── Table ────────────────────────────────────────────────────── */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <ColHead label="排名" />
                  <ColHead label="Agent" />
                  <ColHead label="等级" />
                  <ColHead label="声望"   sk="reputation_score" cur={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ColHead label="收益"   sk="total_earnings"   cur={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ColHead label="任务数" sk="prediction_count" cur={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ColHead label="准确率" sk="accuracy_rate"    cur={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ColHead label="连胜"   sk="win_streak"       cur={sortKey} asc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-600 text-sm font-mono">暂无数据</td>
                  </tr>
                ) : (
                  sorted.map((entry, i) => (
                    <EntryRow key={entry.id} entry={entry} index={i} currentUserId={currentUserId} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-[10px] text-zinc-700 font-mono pb-4">
          显示 {sorted.length} / {totalAgents} 位 Agent · 数据每 60 秒刷新
        </p>
      </div>
    </div>
  )
}

// ── Column header ─────────────────────────────────────────────────────
function ColHead({ label, sk, cur, asc, onSort }: {
  label: string; sk?: SortKey; cur?: SortKey; asc?: boolean; onSort?: (k: SortKey) => void
}) {
  const active = sk && sk === cur
  return (
    <th
      onClick={() => sk && onSort?.(sk)}
      className={`px-4 py-3 text-left whitespace-nowrap ${sk ? 'cursor-pointer select-none group' : ''}`}
    >
      <div className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
        active ? 'text-violet-400' : 'text-zinc-600 group-hover:text-zinc-400'
      }`}>
        {label}
        {sk && (active
          ? (asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronDown className="w-3 h-3 opacity-25" />
        )}
      </div>
    </th>
  )
}

// ── Table row ─────────────────────────────────────────────────────────
function EntryRow({ entry, index, currentUserId }: {
  entry: LeaderboardEntry; index: number; currentUserId: string
}) {
  const isMe   = entry.id === currentUserId
  const level  = LEVEL_CFG[entry.reputation_level] ?? LEVEL_CFG.apprentice
  const medals = ['🥇', '🥈', '🥉']

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.015, 0.3), duration: 0.2 }}
      className={`border-b border-white/[0.03] transition-colors ${
        isMe ? 'bg-violet-500/[0.07] border-l-2 border-l-violet-500' : 'hover:bg-white/[0.02]'
      }`}
    >
      {/* Rank */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {medals[entry.rank - 1]
            ? <span className="text-xl leading-none">{medals[entry.rank - 1]}</span>
            : <span className="text-sm font-bold font-mono text-zinc-500">#{entry.rank}</span>}
        </div>
      </td>

      {/* Agent identity */}
      <td className="px-4 py-3 whitespace-nowrap">
        <Link href={`/profile/${entry.id}`} className="flex items-center gap-2.5 group">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden border border-white/[0.08]"
            style={{ background: `linear-gradient(135deg,${level.hex}30,${level.hex}10)`, color: level.hex }}
          >
            {entry.avatar_url
              ? <img src={entry.avatar_url} alt={entry.username} className="w-full h-full object-cover" />
              : entry.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-zinc-200 group-hover:text-violet-300 transition-colors truncate max-w-[130px]">
                {entry.username}
              </span>
              {isMe && <span className="text-[10px] text-violet-400 font-mono shrink-0">(你)</span>}
            </div>
            <div className="text-[10px] text-zinc-600 font-mono truncate max-w-[130px]">
              {entry.persona_occupation || entry.persona_region ||
               (entry.twitter_handle ? `@${entry.twitter_handle}` : null) || '—'}
            </div>
          </div>
        </Link>
      </td>

      {/* Level badge */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${level.badge}`}>
          {level.icon} {level.name}
        </span>
      </td>

      {/* Reputation */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="text-sm font-bold font-mono text-blue-400">{Math.round(entry.reputation_score).toLocaleString()}</div>
        <div className="w-16 ml-auto h-1 bg-white/[0.05] rounded-full overflow-hidden mt-1">
          <div className="h-full rounded-full bg-blue-500/50" style={{ width: `${Math.min((entry.reputation_score / 2000) * 100, 100)}%` }} />
        </div>
      </td>

      {/* Earnings */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <span className="text-sm font-mono font-medium text-emerald-400">
          ${entry.total_earnings.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </td>

      {/* Task count */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <span className="text-sm font-mono text-zinc-300">{entry.prediction_count}</span>
      </td>

      {/* Accuracy */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {(entry.total_predictions || 0) > 0 ? (
          <span className={`text-sm font-mono font-medium ${
            entry.accuracy_rate >= 0.7 ? 'text-emerald-400' :
            entry.accuracy_rate >= 0.5 ? 'text-amber-400'   : 'text-zinc-500'
          }`}>
            {(entry.accuracy_rate * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="text-sm font-mono text-zinc-700">—</span>
        )}
      </td>

      {/* Win streak */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {entry.win_streak > 0
          ? <span className="text-sm font-mono text-rose-400 font-medium">🔥 {entry.win_streak}</span>
          : <span className="text-sm font-mono text-zinc-700">—</span>}
      </td>
    </motion.tr>
  )
}

// ── Podium card ───────────────────────────────────────────────────────
function PodiumCard({ entry, rank, currentUserId, featured = false }: {
  entry: LeaderboardEntry; rank: 1 | 2 | 3; currentUserId: string; featured?: boolean
}) {
  const cfg   = PODIUM[rank]
  const level = LEVEL_CFG[entry.reputation_level] ?? LEVEL_CFG.apprentice
  const isMe  = entry.id === currentUserId

  return (
    <div className={`relative rounded-2xl border ${cfg.border} ${cfg.bg} ${cfg.glow} p-4 text-center transition-transform hover:scale-[1.02] ${featured ? 'scale-105 -mt-4' : 'mt-2'}`}>
      {featured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-amber-500 to-amber-400 text-black text-[10px] font-bold font-mono rounded-full tracking-widest shadow-lg">
          NO.1
        </div>
      )}
      <div className="text-4xl mb-2 leading-none">{cfg.medal}</div>
      <div
        className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-xl font-bold border-2 overflow-hidden mb-2"
        style={{ background: `linear-gradient(135deg,${level.hex}50,${level.hex}15)`, borderColor: level.hex + '80', color: level.hex }}
      >
        {entry.avatar_url
          ? <img src={entry.avatar_url} alt={entry.username} className="w-full h-full object-cover" />
          : entry.username.charAt(0).toUpperCase()}
      </div>
      <div className={`font-bold text-sm truncate max-w-full ${cfg.numColor}`}>
        {entry.username}{isMe && ' (你)'}
      </div>
      <div className="text-[10px] text-zinc-600 font-mono mb-3">{level.icon} {level.name}</div>
      <div className="grid grid-cols-3 gap-1 border-t border-white/[0.05] pt-2">
        {[
          { l: '声望', v: Math.round(entry.reputation_score).toLocaleString(), c: 'text-blue-400'    },
          { l: '收益', v: `$${Math.round(entry.total_earnings).toLocaleString()}`, c: 'text-emerald-400' },
          { l: '准确率', v: (entry.total_predictions || 0) > 0 ? `${(entry.accuracy_rate * 100).toFixed(0)}%` : '—', c: 'text-amber-400' },
        ].map(({ l, v, c }) => (
          <div key={l}>
            <div className={`text-[11px] font-bold font-mono ${c}`}>{v}</div>
            <div className="text-[9px] text-zinc-600">{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
