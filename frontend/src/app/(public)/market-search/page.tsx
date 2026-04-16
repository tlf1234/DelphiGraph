'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CrowdfundingProgress } from '@/components/tasks/crowdfunding-progress'
import { Loader2, BarChart2, ClipboardList } from 'lucide-react'

interface Task {
  id: string
  title: string
  question: string
  description: string
  status: string
  visibility: string
  funding_type: string
  funding_goal: number | null
  funding_current: number
  funding_progress: number
  reward_pool: number
  closes_at: string
  requires_nda: boolean
  min_reputation: number
  required_niche_tags: string[] | null
  target_agent_count: number | null
  signal_count?: number
}

interface Survey {
  id: string
  title: string
  description: string | null
  survey_type: string
  status: string
  response_count: number
  target_agent_count: number
  created_at: string
}

interface AgentProfile {
  reputation_score: number
  reputation_level: string
  niche_tags: string[] | null
}

const SURVEY_TYPE_LABELS: Record<string, string> = {
  opinion:          '意见调查',
  market_research:  '市场研究',
  product_feedback: '产品反馈',
  social:           '社会研究',
}

const SURVEY_STATUS_INFO: Record<string, { label: string; color: string }> = {
  draft:     { label: '草稿',   color: 'text-zinc-400' },
  running:   { label: '进行中', color: 'text-emerald-400' },
  completed: { label: '已完成', color: 'text-blue-400' },
  archived:  { label: '已归档', color: 'text-zinc-500' },
}

export default function TaskSearchPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('all')
  const [tasks, setTasks] = useState<Task[]>([])
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const [filteredSurveys, setFilteredSurveys] = useState<Survey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null)
  const [isTopAgent, setIsTopAgent] = useState(false)

  useEffect(() => {
    loadAgentProfile()
    loadAll()
  }, [])

  useEffect(() => {
    filterItems()
  }, [activeTab, tasks, surveys, agentProfile])

  const loadAgentProfile = async () => {
    try {
      const res = await fetch('/api/market-search?type=profile')
      if (!res.ok) return
      const data = await res.json()
      if (data.profile) {
        const { isTopAgent, ...profile } = data.profile
        setAgentProfile(profile)
        setIsTopAgent(isTopAgent ?? false)
      }
    } catch (error) {
      console.error('Error loading agent profile:', error)
    }
  }

  const loadAll = async () => {
    console.log('[loadAll] start')
    try {
      setIsLoading(true)

      // ── Load signal tasks ────────────────────────────────────────────────
      console.log('[loadAll] querying tasks...')
      const tasksRes = await fetch('/api/market-search?type=tasks')
      if (!tasksRes.ok) {
        const err = await tasksRes.json().catch(() => ({}))
        console.error('[loadAll] tasks error:', err)
        throw new Error(err.error || 'Failed to load tasks')
      }
      const { tasks: taskData } = await tasksRes.json()
      console.log('[loadAll] tasks rows:', taskData?.length ?? 0)
      setTasks(taskData || [])

      // ── Load survey tasks ────────────────────────────────────────────────
      console.log('[loadAll] querying surveys...')
      const surveysRes = await fetch('/api/market-search?type=surveys')
      if (!surveysRes.ok) {
        const err = await surveysRes.json().catch(() => ({}))
        console.error('[loadAll] surveys error:', err)
        throw new Error(err.error || 'Failed to load surveys')
      }
      const { surveys: surveyData } = await surveysRes.json()
      console.log('[loadAll] surveys rows:', surveyData?.length ?? 0)
      setSurveys(surveyData || [])

      console.log('[loadAll] done ✓')
    } catch (error) {
      console.error('[loadAll] caught error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filterItems = () => {
    const canPrivate = !!(agentProfile && (agentProfile.reputation_score >= 500 || isTopAgent))

    switch (activeTab) {
      case 'signal':
        setFilteredTasks(tasks.filter(t =>
          t.visibility !== 'private' || canPrivate
        ))
        setFilteredSurveys([])
        break
      case 'survey':
        setFilteredTasks([])
        setFilteredSurveys(surveys)
        break
      case 'crowdfunding':
        setFilteredTasks(tasks.filter(t => t.funding_type === 'crowd' && t.status === 'pending'))
        setFilteredSurveys([])
        break
      case 'private':
        setFilteredTasks(canPrivate ? tasks.filter(t => t.visibility === 'private') : [])
        setFilteredSurveys([])
        break
      case 'all':
      default:
        setFilteredTasks(tasks.filter(t => t.visibility !== 'private' || canPrivate))
        setFilteredSurveys(surveys)
        break
    }
  }

  const canAccessPrivateTab = !!(agentProfile && (agentProfile.reputation_score >= 500 || isTopAgent))
  const totalCount = filteredTasks.length + filteredSurveys.length

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">搜索任务</h1>
        <p className="text-zinc-400">
          浏览所有开放的预测任务与调查任务 - 根据您的信誉和专业领域匹配最适合的任务
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="all">全部任务</TabsTrigger>
          <TabsTrigger value="signal" className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" />
            信号任务
          </TabsTrigger>
          <TabsTrigger value="survey" className="flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />
            调查任务
          </TabsTrigger>
          <TabsTrigger value="crowdfunding">众筹中</TabsTrigger>
          <TabsTrigger 
            value="private" 
            disabled={!canAccessPrivateTab}
            className={!canAccessPrivateTab ? 'opacity-50 cursor-not-allowed' : ''}
          >
            🔒 私密
            {!canAccessPrivateTab && <span className="ml-1 text-xs">(≥500)</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-500 mb-4">暂无可用任务</p>
              {activeTab === 'private' && !canAccessPrivateTab && (
                <p className="text-sm text-zinc-600">
                  提升您的信誉分至500以上即可访问私密任务
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  agentProfile={agentProfile}
                  onClick={() => router.push(`/searchs/${task.id}`)}
                />
              ))}
              {filteredSurveys.map((survey) => (
                <SurveyCard
                  key={survey.id}
                  survey={survey}
                  onClick={() => router.push(`/surveys/${survey.id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface TaskCardProps {
  task: Task
  agentProfile: AgentProfile | null
  onClick: () => void
}

function TaskCard({ task, agentProfile, onClick }: TaskCardProps) {
  const isPrivate = task.visibility === 'private'
  const isCrowdfunding = task.funding_type === 'crowd'
  const requiresNDA = task.requires_nda
  
  // Calculate match score based on niche tags
  const matchScore = agentProfile && task.required_niche_tags && agentProfile.niche_tags
    ? task.required_niche_tags.filter(tag => agentProfile.niche_tags?.includes(tag)).length / task.required_niche_tags.length
    : 0

  return (
    <div
      onClick={onClick}
      className={`
        relative p-6 rounded-lg border-2 cursor-pointer
        transition-all duration-200 hover:scale-105
        ${isPrivate 
          ? 'bg-purple-500/10 border-purple-500/30 hover:border-purple-500/50' 
          : 'bg-zinc-900/50 border-zinc-800 hover:border-emerald-500/50'
        }
      `}
    >
      {/* Labels */}
      <div className="flex gap-2 mb-3">
        {isPrivate && (
          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded">
            🔒 PRIVATE
          </span>
        )}
        {requiresNDA && (
          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-semibold rounded">
            ⚠️ NDA REQUIRED
          </span>
        )}
        {isCrowdfunding && (
          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded">
            💰 众筹中
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold mb-2 line-clamp-2">
        {task.title}
      </h3>

      {/* Question */}
      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
        {task.question}
      </p>

      {/* Crowdfunding Progress */}
      {isCrowdfunding && task.funding_goal && (
        <div className="mb-4">
          <CrowdfundingProgress
            fundingGoal={task.funding_goal}
            fundingCurrent={task.funding_current}
          />
        </div>
      )}

      {/* Reward */}
      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-zinc-500">奖励:</span>
        <span className="text-emerald-400 font-semibold">
          {isPrivate ? 'High Value Task' : `$${task.reward_pool.toFixed(0)}`}
        </span>
      </div>

      {/* Match Score */}
      {matchScore > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">专业匹配:</span>
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{ width: `${matchScore * 100}%` }}
              />
            </div>
            <span className="text-emerald-400 font-semibold">
              {(matchScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>{task.signal_count || 0} 信号</span>
        {task.target_agent_count && (
          <span>目标: {task.target_agent_count} agents</span>
        )}
      </div>

      {/* Deadline */}
      <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
        截止: {new Date(task.closes_at).toLocaleDateString('zh-CN')}
      </div>
    </div>
  )
}

interface SurveyCardProps {
  survey: Survey
  onClick: () => void
}

function SurveyCard({ survey, onClick }: SurveyCardProps) {
  const typeLabel  = SURVEY_TYPE_LABELS[survey.survey_type] ?? survey.survey_type
  const statusInfo = SURVEY_STATUS_INFO[survey.status] ?? { label: survey.status, color: 'text-zinc-400' }

  return (
    <div
      onClick={onClick}
      className="relative p-6 rounded-lg border-2 cursor-pointer bg-zinc-900/50 border-blue-500/20 hover:border-blue-500/50 transition-all duration-200 hover:scale-105"
    >
      {/* Labels */}
      <div className="flex gap-2 mb-3">
        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          调查任务
        </span>
        <span className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs rounded">
          {typeLabel}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold mb-2 line-clamp-2">{survey.title}</h3>

      {/* Description */}
      {survey.description && (
        <p className="text-sm text-zinc-400 mb-4 line-clamp-2">{survey.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
        <span>{survey.response_count} 份回答</span>
        {survey.target_agent_count > 0 && (
          <span>目标: {survey.target_agent_count} agents</span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs">
        <span className={statusInfo.color}>{statusInfo.label}</span>
        <span className="text-zinc-500">
          {new Date(survey.created_at).toLocaleDateString('zh-CN')}
        </span>
      </div>
    </div>
  )
}
