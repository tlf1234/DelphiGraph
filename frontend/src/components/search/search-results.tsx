'use client'

import Link from 'next/link'
import { Calendar, Users, TrendingUp, Star, Zap, Award, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'

interface SearchResult {
  taskId: string
  title: string
  question: string
  summary: string
  consensusProbability: number
  predictionCount: number
  status: string
  closesAt?: string
  relevanceScore?: number
}

interface SearchResultsProps {
  results: SearchResult[]
  isLoading: boolean
  sortBy?: 'relevance' | 'consensus' | 'predictions'
}

export function SearchResults({ results, isLoading, sortBy = 'relevance' }: SearchResultsProps) {
  // 相关度排序
  const sortedResults = [...results].sort((a, b) => {
    switch (sortBy) {
      case 'relevance':
        return (b.relevanceScore || 0) - (a.relevanceScore || 0)
      case 'consensus':
        return Math.abs(b.consensusProbability - 0.5) - Math.abs(a.consensusProbability - 0.5)
      case 'predictions':
        return b.predictionCount - a.predictionCount
      default:
        return 0
    }
  })

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-12 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 animate-pulse">
            <div className="h-6 bg-zinc-800 rounded w-3/4 mb-3" />
            <div className="h-4 bg-zinc-800 rounded w-full mb-2" />
            <div className="h-4 bg-zinc-800 rounded w-2/3" />
          </div>
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return null
  }

  // 计算相关度标签
  const getRelevanceBadge = (score?: number) => {
    if (!score) return null
    if (score >= 0.8) return { label: 'Highly Relevant', color: 'emerald', icon: Star }
    if (score >= 0.6) return { label: 'Relevant', color: 'blue', icon: Zap }
    return null
  }

  // 计算共识强度
  const getConsensusStrength = (probability: number) => {
    const deviation = Math.abs(probability - 0.5)
    if (deviation >= 0.3) return { label: 'Strong Consensus', color: 'emerald' }
    if (deviation >= 0.15) return { label: 'Moderate Consensus', color: 'yellow' }
    return { label: 'Divided', color: 'red' }
  }

  // Calculate aggregate insights
  const aggregateInsights = {
    totalPredictions: results.reduce((sum, r) => sum + r.predictionCount, 0),
    avgConsensus: results.length > 0 
      ? results.reduce((sum, r) => sum + r.consensusProbability, 0) / results.length 
      : 0,
    strongConsensusCount: results.filter(r => Math.abs(r.consensusProbability - 0.5) >= 0.3).length,
    dividedCount: results.filter(r => Math.abs(r.consensusProbability - 0.5) < 0.15).length,
  }

  const consensusLevel = aggregateInsights.avgConsensus > 0.7 
    ? '高度共识' 
    : aggregateInsights.avgConsensus > 0.5 
    ? '倾向共识' 
    : '分歧较大'

  const consensusColor = aggregateInsights.avgConsensus > 0.7
    ? 'text-emerald-400'
    : aggregateInsights.avgConsensus > 0.5
    ? 'text-blue-400'
    : 'text-orange-400'

  return (
    <div className="w-full max-w-5xl mx-auto mt-12">
      {/* Future Newspaper Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-gradient-to-br from-zinc-900 to-zinc-800 border-2 border-zinc-700 rounded-lg overflow-hidden shadow-2xl mb-8"
      >
        {/* Newspaper Masthead */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="bg-zinc-950 border-b-4 border-emerald-500 p-6"
        >
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 font-serif tracking-wider flex items-center justify-center gap-3">
              <Sparkles className="w-8 h-8 text-emerald-400" />
              THE FUTURE ORACLE
              <Sparkles className="w-8 h-8 text-emerald-400" />
            </h1>
            <p className="text-sm text-zinc-400 font-mono">
              来自未来的报道 · {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </motion.div>

        {/* Aggregate Statistics Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-zinc-900/50 border-b border-zinc-700"
        >
          <div className="text-center">
            <div className="text-xs text-zinc-500 font-mono mb-1">搜索结果</div>
            <div className="text-2xl font-bold text-blue-400">{results.length}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500 font-mono mb-1">智能体预测</div>
            <div className="text-2xl font-bold text-purple-400">{aggregateInsights.totalPredictions}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500 font-mono mb-1">平均共识</div>
            <div className={`text-2xl font-bold ${consensusColor}`}>
              {(aggregateInsights.avgConsensus * 100).toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-zinc-500 font-mono mb-1">共识/分歧</div>
            <div className="text-2xl font-bold text-emerald-400">
              {aggregateInsights.strongConsensusCount}/{aggregateInsights.dividedCount}
            </div>
          </div>
        </motion.div>

        {/* AI Summary Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="p-8 border-b border-zinc-700"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-4 py-2 rounded-full text-sm font-bold ${consensusColor} bg-zinc-800 border border-zinc-700`}>
              {consensusLevel}
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              基于 {aggregateInsights.totalPredictions} 个智能体的分析
            </span>
          </div>

          <div className="prose prose-invert prose-lg max-w-none">
            <p className="text-zinc-200 leading-relaxed font-serif">
              根据 {results.length} 个相关预测市场的集体智慧分析，智能体们对搜索主题展现出{consensusLevel}的态度。
              其中 {aggregateInsights.strongConsensusCount} 个市场达成强共识，
              {aggregateInsights.dividedCount} 个市场存在明显分歧。
              这些预测汇聚了 {aggregateInsights.totalPredictions} 个AI智能体的独立判断，
              为理解未来趋势提供了多维度的视角。
            </p>
          </div>
        </motion.div>

        {/* Analysis Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="p-6 bg-zinc-900/50"
        >
          <h3 className="text-lg font-bold text-white mb-4">分析要点</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <div className="text-xs text-emerald-400 font-mono mb-2">共识点</div>
              <div className="text-sm text-zinc-300">
                {aggregateInsights.strongConsensusCount > 0
                  ? `${aggregateInsights.strongConsensusCount} 个市场显示智能体们对结果有高度一致的预期`
                  : '智能体们的观点存在一定分散'}
              </div>
            </div>
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <div className="text-xs text-purple-400 font-mono mb-2">分歧点</div>
              <div className="text-sm text-zinc-300">
                {aggregateInsights.dividedCount > 0
                  ? `${aggregateInsights.dividedCount} 个市场存在显著观点差异，需要关注不同视角`
                  : '智能体们的预测高度集中'}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Detailed Predictions - Newspaper Article Style */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white mb-6 font-serif border-b-2 border-zinc-700 pb-3">
          详细预测报道
        </h2>

        {sortedResults.map((result, index) => {
          const relevanceBadge = getRelevanceBadge(result.relevanceScore)
          const consensusStrength = getConsensusStrength(result.consensusProbability)
          const RelevanceIcon = relevanceBadge?.icon

          return (
            <motion.div
              key={result.taskId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <Link
                href={`/searchs/${result.taskId}`}
                className="block bg-gradient-to-br from-zinc-900 to-zinc-800 border-2 border-zinc-700 rounded-lg p-6 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 group"
              >
                {/* Article Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    {/* Ranking Badge */}
                    {index < 3 && (
                      <div className="inline-block mb-2">
                        <div className={`
                          px-3 py-1 rounded-full flex items-center gap-2 font-bold text-sm
                          ${index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            index === 1 ? 'bg-zinc-400/20 text-zinc-300 border border-zinc-400/30' :
                            'bg-orange-500/20 text-orange-400 border border-orange-500/30'}
                        `}>
                          <Award className="w-4 h-4" />
                          Top {index + 1}
                        </div>
                      </div>
                    )}

                    {/* Title */}
                    <h3 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors mb-2 font-serif leading-tight">
                      {result.title}
                    </h3>

                    {/* Relevance Badge */}
                    {relevanceBadge && RelevanceIcon && (
                      <div className={`
                        inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                        bg-${relevanceBadge.color}-500/10 text-${relevanceBadge.color}-400 
                        border border-${relevanceBadge.color}-500/30
                      `}>
                        <RelevanceIcon className="w-3 h-3" />
                        {relevanceBadge.label}
                      </div>
                    )}
                  </div>
                </div>

                {/* Question */}
                <p className="text-lg text-zinc-300 mb-4 font-mono leading-relaxed">
                  {result.question}
                </p>

                {/* Summary Quote */}
                {result.summary && (
                  <blockquote className="border-l-4 border-emerald-500 pl-4 mb-6 italic text-zinc-400">
                    &ldquo;{result.summary}&rdquo;
                  </blockquote>
                )}

                {/* Consensus Analysis */}
                <div className="bg-zinc-800/50 rounded-lg p-5 mb-4 border border-zinc-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
                      智能体共识概率
                    </span>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-${consensusStrength.color}-400`}>
                      {consensusStrength.label}
                    </span>
                  </div>
                  
                  {/* Probability Bar */}
                  <div className="relative h-4 bg-zinc-700 rounded-full overflow-hidden mb-3">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${result.consensusProbability * 100}%` }}
                      transition={{ delay: index * 0.1 + 0.3, duration: 0.8, ease: "easeOut" }}
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500"
                    />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500 font-mono">No (0%)</span>
                    <span className="text-2xl font-bold text-emerald-400 font-mono">
                      {(result.consensusProbability * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">Yes (100%)</span>
                  </div>
                </div>

                {/* Metadata Footer */}
                <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-500 pt-4 border-t border-zinc-700">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>
                      <span className="text-white font-semibold">{result.predictionCount}</span> 个智能体
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      result.status === 'resolved' ? 'bg-green-400' :
                      result.status === 'closed' ? 'bg-yellow-400' :
                      'bg-blue-400'
                    }`} />
                    <span className="capitalize">{result.status === 'resolved' ? '已解决' : result.status === 'closed' ? '已关闭' : '进行中'}</span>
                  </div>

                  {result.closesAt && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(result.closesAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  )}

                  <div className="ml-auto flex items-center gap-2 text-emerald-400 group-hover:text-emerald-300 transition-colors">
                    <span className="text-xs font-mono">查看完整报道</span>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>

      {/* Newspaper Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.6 }}
        className="mt-8 bg-zinc-950 border-t-2 border-zinc-700 rounded-lg p-4 text-center"
      >
        <p className="text-xs text-zinc-500 font-mono">
          本报道由 DelphiGraph 搜索引擎生成 · 基于AI智能体的集体智慧
        </p>
      </motion.div>
    </div>
  )
}
