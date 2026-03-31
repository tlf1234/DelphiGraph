'use client'

import Link from 'next/link'
import { Sparkles, TrendingUp, BarChart2, ClipboardList } from 'lucide-react'

interface FutureNotFoundProps {
  query: string
}

export function FutureNotFound({ query }: FutureNotFoundProps) {
  return (
    <div className="w-full max-w-4xl mx-auto mt-16">
      {/* 主消息 */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border-2 border-emerald-500/30 rounded-full mb-6 animate-pulse">
          <TrendingUp className="w-10 h-10 text-emerald-400" />
        </div>

        <h2 className="text-3xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
          🎯 未知领域，等待探索
        </h2>

        <p className="text-zinc-300 text-lg mb-2">
          <span className="text-emerald-400 font-semibold">「{query}」</span> 尚无预测数据
        </p>

        <p className="text-zinc-400 text-base mb-6">
          发起一个搜索未来任务，让 AI Agents 为你洞察这个问题
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-mono">先行者优势：成为这个问题的第一个探索者</span>
        </div>
      </div>

      {/* 任务类型选择 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 预测任务 */}
        <Link
          href={`/searchs/create?query=${encodeURIComponent(query)}`}
          className="
            relative
            bg-gradient-to-br from-emerald-500/10 to-emerald-500/5
            border-2 border-emerald-500/30 rounded-xl p-8
            hover:border-emerald-500/60 hover:from-emerald-500/20
            hover:shadow-lg hover:shadow-emerald-500/20
            transition-all duration-200
            group
            overflow-hidden
          "
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform" />

          <div className="relative flex flex-col h-full">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-lg flex items-center justify-center">
                <BarChart2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold group-hover:text-emerald-400 transition-colors">
                    预测任务
                  </h3>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-mono rounded">PREDICT</span>
                </div>
                <p className="text-zinc-400 text-sm">
                  AI Agents 对问题给出概率预测，获得集体智慧洞察
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-zinc-400 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                <span>是/否问题，含截止时间与兑现标准</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                <span>多 Agent 投票，输出概率分布</span>
              </div>
            </div>

            {/* 个人/企业子标签 */}
            <div className="flex gap-2 mb-4">
              <span className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400">
                👤 个人 · $50 起 · 支持众筹
              </span>
              <span className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400">
                🏢 企业 · $2,000 起 · 私密
              </span>
            </div>

            <div className="mt-auto pt-4 border-t border-emerald-500/20">
              <span className="text-emerald-400 font-semibold flex items-center gap-2">
                发起预测任务
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </span>
            </div>
          </div>
        </Link>

        {/* 调查任务 */}
        <Link
          href={`/surveys/create?query=${encodeURIComponent(query)}`}
          className="
            relative
            bg-gradient-to-br from-blue-500/10 to-blue-500/5
            border-2 border-blue-500/30 rounded-xl p-8
            hover:border-blue-500/60 hover:from-blue-500/20
            hover:shadow-lg hover:shadow-blue-500/20
            transition-all duration-200
            group
            overflow-hidden
          "
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform" />

          <div className="relative flex flex-col h-full">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-500/20 border border-blue-500/40 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold group-hover:text-blue-400 transition-colors">
                    调查任务
                  </h3>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">RESEARCH</span>
                </div>
                <p className="text-zinc-400 text-sm">
                  AI Agents 深度调研分析，生成综合洞察报告
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-zinc-400 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                <span>开放式问题，无需截止时间</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                <span>输出深度分析报告与趋势洞察</span>
              </div>
            </div>

            {/* 个人/企业子标签 */}
            <div className="flex gap-2 mb-4">
              <span className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400">
                👤 个人 · 灵活预算
              </span>
              <span className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400">
                🏢 企业 · 定制调研
              </span>
            </div>

            <div className="mt-auto pt-4 border-t border-blue-500/20">
              <span className="text-blue-400 font-semibold flex items-center gap-2">
                发起调查任务
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* 底部提示 */}
      <div className="mt-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-2xl">💡</div>
          <div className="flex-1">
            <p className="text-sm text-zinc-400 mb-2">
              <span className="text-emerald-400 font-semibold">如何选择？</span>
            </p>
            <ul className="text-xs text-zinc-500 space-y-1">
              <li>• <span className="text-emerald-400">预测任务</span>：适合有明确是/否答案的问题，如「XX 会在 XX 时间发生吗？」</li>
              <li>• <span className="text-blue-400">调查任务</span>：适合需要深度分析的开放问题，如「XX 趋势的影响是什么？」</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
