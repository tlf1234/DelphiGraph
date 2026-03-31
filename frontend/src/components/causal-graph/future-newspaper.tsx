'use client'

import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, BarChart3, Shield } from 'lucide-react'

interface FutureNewspaperProps {
  content: string | null
  conclusion: {
    direction?: string
    direction_label?: string
    confidence?: number
    confidence_interval?: { low?: number; mid?: number; high?: number }
    key_drivers?: string[]
    risk_factors?: string[]
    minority_assessment?: string
    minority_warning?: string
    persona_insight?: string
    conflicts?: string
    one_line_conclusion?: string
  } | null
  isFinal?: boolean
  version?: number
  preprocessSummary?: {
    total_signals?: number
    hard_fact_count?: number
    persona_count?: number
    persona_summary?: { coverage_rate?: number; dimensions?: Record<string, Record<string, number>> }
  } | null
  marketQuestion?: string
  className?: string
  revealed?: boolean
}

// ── 未来日期生成 ──
function getFutureDate() {
  const now = new Date()
  const future = new Date(now.getTime() + 90 * 86400000) // +90天
  const y = future.getFullYear()
  const m = String(future.getMonth() + 1).padStart(2, '0')
  const d = String(future.getDate()).padStart(2, '0')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return { formatted: `${y}年${m}月${d}日`, weekday: weekdays[future.getDay()] }
}

// ── 置信度仪表盘 ──
function ConfidenceGauge({ value, low, high }: { value: number; low: number; high: number }) {
  const pct = Math.round(value * 100)
  const angle = -90 + value * 180 // -90 to 90
  return (
    <div className="relative w-[120px] h-[68px] mx-auto">
      <svg viewBox="0 0 120 68" className="w-full h-full">
        {/* 背景弧 */}
        <path
          d="M 10 62 A 50 50 0 0 1 110 62"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* 置信区间范围 */}
        <path
          d={describeArc(60, 62, 50, -90 + low * 180, -90 + high * 180)}
          fill="none"
          stroke="rgba(251,191,36,0.2)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* 当前值指针 */}
        <line
          x1="60" y1="62"
          x2={60 + 42 * Math.cos((angle * Math.PI) / 180)}
          y2={62 + 42 * Math.sin((angle * Math.PI) / 180)}
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="60" cy="62" r="3" fill="#fbbf24" />
      </svg>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <span className="text-xl font-bold text-amber-400 font-mono">{pct}%</span>
      </div>
    </div>
  )
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ── 主组件 ──────────────────────────────────────────────────────────

// 等待占位符
const WAITING_LINES = [
  '> INITIALIZING DELPHI CAUSAL ENGINE...',
  '> AGGREGATING AGENT SIGNALS...',
  '> RUNNING BAYESIAN INFERENCE GRAPH...',
  '> RESOLVING FACTOR CLUSTERS...',
  '> SYNTHESIZING NARRATIVE CONTEXT...',
  '> COMPILING FUTURE DISPATCH...',
]

function NewspaperWaiting({ hasData }: { hasData: boolean }) {
  const [visibleLines, setVisibleLines] = useState(0)
  const [cursorOn, setCursorOn] = useState(true)

  useEffect(() => {
    const t = setInterval(() => setVisibleLines(v => Math.min(v + 1, WAITING_LINES.length)), 900)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setCursorOn(v => !v), 530)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="mx-3 rounded-lg bg-[#0c1018] border border-amber-500/10 overflow-hidden">
      {/* 报头骨架 */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60">
        <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        <div className="text-center mb-1">
          <h2 className="text-[22px] font-extrabold tracking-[0.25em] text-zinc-700 leading-tight select-none"
            style={{ fontFamily: "'Noto Serif SC','Source Han Serif SC',serif" }}>
            德尔菲未来通讯
          </h2>
          <div className="flex items-center justify-center gap-3 mt-1">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[9px] text-zinc-700 tracking-[0.3em] font-mono">DELPHI ORACLE DISPATCH</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
        </div>
        <div className="space-y-px mt-3"><div className="h-[2px] bg-zinc-800" /><div className="h-px bg-zinc-800/50" /></div>
      </div>

      {/* 终端日志 */}
      <div className="px-6 py-5 font-mono text-[11px] space-y-1.5 min-h-[200px]">
        <div className="text-amber-400/60 text-[10px] mb-3 tracking-widest">◈ SYSTEM · CAUSAL INFERENCE ENGINE</div>
        {WAITING_LINES.slice(0, visibleLines).map((line: string, i: number) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className={i === visibleLines - 1 ? 'text-cyan-400' : 'text-zinc-600'}
          >
            {line}{i === visibleLines - 1 && <span className={`ml-0.5 ${cursorOn ? 'opacity-100' : 'opacity-0'}`}>█</span>}
          </motion.div>
        ))}
        {visibleLines < WAITING_LINES.length && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <motion.div key={i} className="w-1 h-1 rounded-full bg-amber-400/50"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.2 }} />
              ))}
            </div>
            <span className="text-[10px] text-zinc-600">系统正在为您极速汇总天下大势</span>
          </div>
        )}
        {visibleLines >= WAITING_LINES.length && hasData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-emerald-400 mt-2"
          >
            {'> DISPATCH READY. DECRYPTING...'}
            <span className={`ml-0.5 ${cursorOn ? 'opacity-100' : 'opacity-0'}`}>█</span>
          </motion.div>
        )}
      </div>

      {/* 底部装饰 */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
    </div>
  )
}

export default function FutureNewspaper({
  content,
  conclusion,
  isFinal = false,
  version,
  preprocessSummary,
  marketQuestion,
  className = '',
  revealed = false,
}: FutureNewspaperProps) {
  const futureDate = useMemo(() => getFutureDate(), [])

  // 所有派生数据必须在 early return 之前计算，避免违反 Hooks 规则
  const paragraphs = content?.split('\n').filter(p => p.trim()) || []
  const headlineIdx = paragraphs.findIndex(p => p.startsWith('#'))
  const headline = headlineIdx >= 0
    ? paragraphs[headlineIdx].replace(/^#+\s*/, '')
    : conclusion?.one_line_conclusion || marketQuestion || ''
  const bodyParagraphs = paragraphs.filter((_, i) => i !== headlineIdx)

  const pullQuote = useMemo(() => {
    const candidates = bodyParagraphs.filter(p => p.trim() && !p.startsWith('#') && !p.includes('编者注') && p.length > 30)
    const src = candidates[1] || candidates[0]
    if (!src) return null
    return src.length > 85 ? src.slice(0, 85) + '……' : src
  }, [bodyParagraphs])

  // 未揭示时显示等待占位符
  if (!revealed) {
    return <NewspaperWaiting hasData={!!(content || conclusion)} />
  }

  // 空状态
  if (!content && !conclusion) {
    return (
      <div className={`mx-3 rounded-lg bg-[#0c1018] border border-white/[0.04] p-10 ${className}`}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
            <svg className="w-7 h-7 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500 font-medium">等待因果推演</p>
          <p className="text-xs text-zinc-700 mt-1">
            分析完成后将自动生成未来通讯
          </p>
        </div>
      </div>
    )
  }

  const ci = conclusion?.confidence_interval
  const confidenceVal = conclusion?.confidence ?? 0.5
  const ciLow = ci?.low ?? confidenceVal - 0.15
  const ciHigh = ci?.high ?? confidenceVal + 0.1

  const sec = (delay: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.25, 0.8, 0.25, 1], delay },
  })

  const firstBodyIdx = bodyParagraphs.findIndex(p => p.trim() && !p.startsWith('#'))

  return (
    <div className={`mx-3 ${className}`}>
      <div className="relative rounded-lg overflow-hidden border border-amber-500/[0.18]"
        style={{ background: '#07090f' }}>

        {/* ── 扫描线叠层 ── */}
        <div className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.013) 2px, rgba(255,255,255,0.013) 3px)',
          }} />

        {/* ── BREAKING 顶栏 ── */}
        <div className="relative z-10 bg-amber-500/[0.07] border-b border-amber-500/20 px-4 py-1.5 flex items-center gap-2">
          <span className="text-[8px] text-amber-400 font-mono font-bold tracking-[0.3em] shrink-0">◈ DISPATCH</span>
          <div className="flex-1 h-px bg-amber-500/20" />
          <span className="text-[8px] text-zinc-600 font-mono tracking-[0.15em] shrink-0">
            CAUSAL ANALYSIS · {futureDate.formatted} {futureDate.weekday}
          </span>
          <div className="flex-1 h-px bg-amber-500/20" />
          <span className={`shrink-0 text-[8px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border ${
            isFinal
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
              : 'text-amber-400 bg-amber-500/10 border-amber-500/25'
          }`}>
            {isFinal ? 'FINAL' : `v${version || 1}`}
          </span>
        </div>

        {/* ── 报头 Masthead ── */}
        <motion.div className="relative z-10 px-5 pt-5 pb-4 text-center" {...sec(0)}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-amber-500/50 to-amber-500/20" />
            <span className="text-amber-500/50 text-[9px]">✦</span>
            <div className="flex-1 h-[1.5px] bg-gradient-to-l from-transparent via-amber-500/50 to-amber-500/20" />
          </div>
          <h1
            className="text-[26px] font-black tracking-[0.2em] leading-none"
            style={{
              fontFamily: "'Noto Serif SC','Source Han Serif SC',serif",
              background: 'linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#fcd34d 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            德尔菲未来通讯
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2 mb-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-[8px] text-zinc-600 tracking-[0.35em] font-mono">
              DELPHI ORACLE DISPATCH · TEMPORAL INFERENCE
            </span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="space-y-0.5">
            <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
            <div className="h-px bg-gradient-to-r from-transparent via-zinc-700/40 to-transparent" />
          </div>
        </motion.div>

        {/* ── 头条 ── */}
        {headline && (
          <motion.div className="relative z-10 px-5 pb-4" {...sec(0.15)}>
            <div className="flex items-center gap-2 mb-2 text-[8px] text-zinc-600 font-mono tracking-[0.3em]">
              <div className="w-4 h-px bg-zinc-700" />
              <span>头版头条 · FRONT PAGE</span>
              <div className="flex-1 h-px bg-zinc-800/60" />
            </div>
            <h2
              className="text-[17px] font-black leading-snug text-zinc-100"
              style={{ fontFamily: "'Noto Serif SC','Source Han Serif SC',serif" }}
            >
              {headline}
            </h2>
            {conclusion?.one_line_conclusion && conclusion.one_line_conclusion !== headline && (
              <p className="mt-2 text-[12px] text-zinc-400 leading-relaxed border-l-2 border-amber-500/35 pl-3 italic">
                {conclusion.one_line_conclusion}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[8px] text-zinc-600 font-mono flex-wrap">
              <span>BY DELPHI CAUSAL ENGINE</span>
              <span className="text-zinc-800">·</span>
              <span>{preprocessSummary?.total_signals ?? 0} SIGNALS ANALYZED</span>
              <span className="text-zinc-800">·</span>
              <span>{futureDate.formatted}</span>
            </div>
            <div className="mt-3 h-px bg-zinc-800/60" />
          </motion.div>
        )}

        {/* ── 核心指标栏 ── */}
        {conclusion && (
          <motion.div className="relative z-10 mx-5 mb-4 rounded overflow-hidden border border-zinc-800/70" {...sec(0.28)}>
            <div className="grid grid-cols-3 divide-x divide-zinc-800/70 bg-white/[0.015]">
              <div className="p-3 text-center">
                <div className="text-[7px] text-zinc-600 tracking-[0.4em] font-mono mb-2">VERDICT</div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[13px] font-bold ${
                  conclusion.direction === 'bullish'
                    ? 'bg-emerald-500/8 border-emerald-500/25 text-emerald-400'
                    : conclusion.direction === 'bearish'
                    ? 'bg-rose-500/8 border-rose-500/25 text-rose-400'
                    : 'bg-zinc-700/20 border-zinc-600/20 text-zinc-400'
                }`}>
                  {conclusion.direction === 'bullish' ? <TrendingUp className="w-3.5 h-3.5" />
                    : conclusion.direction === 'bearish' ? <TrendingDown className="w-3.5 h-3.5" />
                    : <Minus className="w-3.5 h-3.5" />}
                  {conclusion.direction_label
                    || (conclusion.direction === 'bullish' ? '看涨'
                      : conclusion.direction === 'bearish' ? '看跌' : '中性')}
                </div>
              </div>
              <div className="p-2">
                <div className="text-[7px] text-zinc-600 tracking-[0.4em] font-mono text-center">CONFIDENCE</div>
                <ConfidenceGauge value={confidenceVal} low={ciLow} high={ciHigh} />
                <div className="text-[8px] text-zinc-600 text-center font-mono -mt-0.5">
                  [{(ciLow * 100).toFixed(0)}%–{(ciHigh * 100).toFixed(0)}%]
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[7px] text-zinc-600 tracking-[0.4em] font-mono mb-1">SIGNALS</div>
                <div className="text-[24px] font-black text-zinc-300 font-mono leading-none">
                  {preprocessSummary?.total_signals ?? '—'}
                </div>
                <div className="mt-1 flex justify-center gap-1.5 text-[9px] font-mono">
                  <span className="text-cyan-400">{preprocessSummary?.hard_fact_count ?? 0}<span className="text-zinc-700"> F</span></span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-amber-400">{preprocessSummary?.persona_count ?? 0}<span className="text-zinc-700"> P</span></span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── 引言拉块 Pull Quote ── */}
        {pullQuote && (
          <motion.div className="relative z-10 mx-5 mb-4" {...sec(0.38)}>
            <div className="relative border-y border-amber-500/20 py-3">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-500/20 via-amber-500/60 to-amber-500/20 rounded-full" />
              <p
                className="pl-4 text-[13px] font-semibold text-zinc-300 leading-snug italic"
                style={{ fontFamily: "'Noto Serif SC','Source Han Serif SC',serif" }}
              >
                「{pullQuote}」
              </p>
            </div>
          </motion.div>
        )}

        {/* ── 正文 + 侧边栏 ── */}
        {(bodyParagraphs.length > 0 || conclusion?.key_drivers?.length || conclusion?.risk_factors?.length) && (
          <motion.div className="relative z-10 px-5 pb-4" {...sec(0.48)}>
            <div className="flex gap-4 items-start">

              {/* 正文列 */}
              <div className="flex-1 min-w-0 text-[12px] text-zinc-300/90 leading-[1.9]">
                {bodyParagraphs.map((paragraph, i) => {
                  if (!paragraph.trim()) return null
                  if (paragraph.startsWith('#')) {
                    const text = paragraph.replace(/^#+\s*/, '')
                    return (
                      <h4
                        key={i}
                        className="text-[13px] font-bold text-zinc-200 mt-5 mb-2 pb-1 border-b border-zinc-800/40 flex items-center gap-1.5"
                        style={{ fontFamily: "'Noto Serif SC','Source Han Serif SC',serif" }}
                      >
                        <span className="text-amber-500/50 text-[10px]">§</span>
                        {text}
                      </h4>
                    )
                  }
                  if (paragraph.includes('编者注') || paragraph.includes('编者按')) {
                    return (
                      <div key={i} className="mt-5 pt-3 border-t border-dashed border-zinc-800/60">
                        <div className="flex items-start gap-2">
                          <div className="w-0.5 bg-amber-500/30 rounded-full shrink-0 self-stretch" />
                          <p className="text-[10px] text-zinc-500 italic leading-relaxed">{paragraph}</p>
                        </div>
                      </div>
                    )
                  }
                  if (i === firstBodyIdx && paragraph.length > 6) {
                    const first = paragraph[0]
                    const rest = paragraph.slice(1)
                    return (
                      <p key={i} className="mb-3">
                        <span
                          className="float-left text-[38px] font-black text-amber-400/65 leading-[0.85] mr-2 mt-0.5"
                          style={{ fontFamily: "'Noto Serif SC','Source Han Serif SC',serif" }}
                        >
                          {first}
                        </span>
                        {rest}
                      </p>
                    )
                  }
                  return <p key={i} className="mb-2.5 indent-5">{paragraph}</p>
                })}
              </div>

              {/* 侧边栏 */}
              {(conclusion?.key_drivers?.length || conclusion?.risk_factors?.length || (conclusion?.persona_insight && conclusion.persona_insight !== '无')) && (
                <div className="w-[138px] shrink-0 space-y-2.5 pt-0.5">
                  {conclusion?.key_drivers && conclusion.key_drivers.length > 0 && (
                    <div className="rounded border border-emerald-500/15 bg-emerald-500/[0.03] p-2.5">
                      <div className="text-[7px] text-emerald-400/65 tracking-[0.35em] font-mono mb-2 pb-1 border-b border-emerald-500/10 flex items-center gap-1">
                        <TrendingUp className="w-2.5 h-2.5" />
                        KEY DRIVERS
                      </div>
                      <div className="space-y-1.5">
                        {conclusion.key_drivers.slice(0, 5).map((d, i) => (
                          <div key={i} className="text-[10px] text-zinc-400 flex items-start gap-1 leading-tight">
                            <span className="text-emerald-500/50 shrink-0 text-[8px] mt-0.5">◆</span>
                            {d}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {conclusion?.risk_factors && conclusion.risk_factors.length > 0 && (
                    <div className="rounded border border-rose-500/15 bg-rose-500/[0.03] p-2.5">
                      <div className="text-[7px] text-rose-400/65 tracking-[0.35em] font-mono mb-2 pb-1 border-b border-rose-500/10 flex items-center gap-1">
                        <Shield className="w-2.5 h-2.5" />
                        RISK FACTORS
                      </div>
                      <div className="space-y-1.5">
                        {conclusion.risk_factors.slice(0, 4).map((r, i) => (
                          <div key={i} className="text-[10px] text-zinc-400 flex items-start gap-1 leading-tight">
                            <span className="text-rose-500/50 shrink-0 text-[8px] mt-0.5">◆</span>
                            {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {conclusion?.persona_insight && conclusion.persona_insight !== '无' && (
                    <div className="rounded border border-cyan-500/15 bg-cyan-500/[0.025] p-2.5">
                      <div className="text-[7px] text-cyan-400/65 tracking-[0.35em] font-mono mb-2 pb-1 border-b border-cyan-500/10">
                        ◈ PERSONA
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed">{conclusion.persona_insight}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── 少数派 + 冲突警告（全宽） ── */}
        {conclusion && (
          <motion.div className="relative z-10 mx-5 mb-4 space-y-2" {...sec(0.75)}>
            {conclusion.minority_assessment && conclusion.minority_assessment !== '无' && conclusion.minority_assessment !== '无法评估' && (
              <div className="flex items-start gap-3 p-3 rounded border border-amber-500/18 bg-amber-500/[0.03]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400/65 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[7px] text-amber-400/65 tracking-[0.4em] font-mono mb-1">◈ MINORITY SIGNAL ALERT · 少数派预警</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{conclusion.minority_assessment}</p>
                </div>
              </div>
            )}
            {conclusion.conflicts && conclusion.conflicts !== '无' && (
              <div className="flex items-start gap-3 p-3 rounded border border-purple-500/18 bg-purple-500/[0.03]">
                <Zap className="w-3.5 h-3.5 text-purple-400/65 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[7px] text-purple-400/65 tracking-[0.4em] font-mono mb-1">◈ CONFLICT ANALYSIS · 冲突分析</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{conclusion.conflicts}</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── 页脚 ── */}
        <motion.div className="relative z-10 px-5 py-2.5 border-t border-zinc-800/50 bg-zinc-900/20" {...sec(1.0)}>
          <div className="flex items-center justify-between text-[8px] text-zinc-700 font-mono">
            <span className="tracking-[0.15em]">DELPHI ORACLE · CAUSAL INFERENCE ENGINE</span>
            <div className="flex items-center gap-2">
              {preprocessSummary?.persona_summary?.coverage_rate != null && (
                <span>PERSONA {Math.round(preprocessSummary.persona_summary.coverage_rate * 100)}%</span>
              )}
              <span className="text-zinc-800">·</span>
              <span>{isFinal ? 'FINAL DISPATCH' : `INTERIM v${version || 1}`}</span>
            </div>
          </div>
        </motion.div>

        {/* 底部装饰线 */}
        <div className="relative z-10 h-[2px] bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
      </div>
    </div>
  )
}
