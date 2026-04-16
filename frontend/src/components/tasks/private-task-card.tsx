'use client'

import { Lock, AlertTriangle, Users, TrendingUp } from 'lucide-react'

interface PrivateTask {
  id: string
  title: string
  question: string
  description: string
  visibility: 'private'
  requires_nda: boolean
  nda_text?: string
  min_reputation: number
  required_niche_tags: string[] | null
  target_agent_count: number | null
  reward_pool: number
  closes_at: string
  signal_count?: number
}

interface AgentProfile {
  reputation_score: number
  reputation_level: string
  niche_tags: string[] | null
}

interface PrivateTaskCardProps {
  task: PrivateTask
  agentProfile: AgentProfile | null
  onClick: () => void
}

export function PrivateTaskCard({ task, agentProfile, onClick }: PrivateTaskCardProps) {
  // Calculate match score based on niche tags
  const matchScore = agentProfile && task.required_niche_tags && agentProfile.niche_tags
    ? task.required_niche_tags.filter(tag => agentProfile.niche_tags?.includes(tag)).length / task.required_niche_tags.length
    : 0

  const hasFullMatch = matchScore === 1
  const hasPartialMatch = matchScore > 0 && matchScore < 1

  return (
    <div
      onClick={onClick}
      className="
        relative p-6 rounded-xl cursor-pointer
        bg-gradient-to-br from-purple-500/10 to-purple-500/5
        border-2 border-purple-500/30
        hover:border-purple-500/60 hover:from-purple-500/20
        transition-all duration-300 hover:scale-105
        shadow-lg shadow-purple-500/10
        group
      "
    >
      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl opacity-0 group-hover:opacity-20 blur transition-opacity duration-300" />

      {/* Content */}
      <div className="relative">
        {/* Labels */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-3 py-1 bg-purple-500/30 text-purple-300 text-xs font-bold rounded-full flex items-center gap-1.5 border border-purple-500/50">
            <Lock className="w-3 h-3" />
            PRIVATE
          </span>
          {task.requires_nda && (
            <span className="px-3 py-1 bg-yellow-500/30 text-yellow-300 text-xs font-bold rounded-full flex items-center gap-1.5 border border-yellow-500/50">
              <AlertTriangle className="w-3 h-3" />
              NDA REQUIRED
            </span>
          )}
          {hasFullMatch && (
            <span className="px-3 py-1 bg-emerald-500/30 text-emerald-300 text-xs font-bold rounded-full border border-emerald-500/50">
              ✓ Perfect Match
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold mb-3 text-white group-hover:text-purple-300 transition-colors line-clamp-2">
          {task.title}
        </h3>

        {/* Question */}
        <p className="text-sm text-zinc-400 mb-4 line-clamp-3">
          {task.question}
        </p>

        {/* Reward (Blurred for privacy) */}
        <div className="mb-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
          <div className="flex items-center justify-between">
            <span className="text-sm text-purple-300 font-semibold">Reward:</span>
            <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              High Value Task
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            💎 Actual amount revealed after NDA signature
          </p>
        </div>

        {/* Required Niche Tags */}
        {task.required_niche_tags && task.required_niche_tags.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-zinc-500 mb-2">Required Expertise:</div>
            <div className="flex flex-wrap gap-2">
              {task.required_niche_tags.map((tag) => {
                const isMatched = agentProfile?.niche_tags?.includes(tag)
                return (
                  <span
                    key={tag}
                    className={`
                      px-2 py-1 text-xs rounded-md border
                      ${isMatched
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }
                    `}
                  >
                    {isMatched && '✓ '}
                    {tag}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Match Score */}
        {matchScore > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500">Expertise Match:</span>
              <span className={`font-semibold ${
                hasFullMatch ? 'text-emerald-400' :
                hasPartialMatch ? 'text-yellow-400' :
                'text-zinc-400'
              }`}>
                {(matchScore * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  hasFullMatch ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                  hasPartialMatch ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                  'bg-zinc-600'
                }`}
                style={{ width: `${matchScore * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-zinc-400 mb-4">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            <span>{task.signal_count || 0} signals</span>
          </div>
          {task.target_agent_count && (
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>Target: {task.target_agent_count} agents</span>
            </div>
          )}
        </div>

        {/* Reputation Requirement */}
        <div className="mb-4 p-2 bg-zinc-900/50 rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Min. Reputation:</span>
            <span className={`font-semibold ${
              agentProfile && agentProfile.reputation_score >= task.min_reputation
                ? 'text-emerald-400'
                : 'text-red-400'
            }`}>
              {task.min_reputation}
              {agentProfile && (
                <span className="ml-2 text-zinc-600">
                  (You: {agentProfile.reputation_score})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Deadline */}
        <div className="pt-3 border-t border-purple-500/20 text-xs text-zinc-500 flex items-center justify-between">
          <span>Deadline:</span>
          <span className="text-purple-300 font-semibold">
            {new Date(task.closes_at).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </span>
        </div>

        {/* Hover indicator */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center border border-purple-500/50">
            <span className="text-purple-300 text-sm">→</span>
          </div>
        </div>
      </div>
    </div>
  )
}
