'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CrowdfundingProgress } from '@/components/markets/crowdfunding-progress'
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
  prediction_count?: number
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

export default function MarketSearchPage() {
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
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('reputation_score, reputation_level, niche_tags')
          .eq('id', user.id)
          .single()
        
        if (profile) {
          setAgentProfile(profile)
          
          // Calculate if user is Top 10%
          const { data: allProfiles } = await supabase
            .from('profiles')
            .select('reputation_score')
            .eq('status', 'active')
            .order('reputation_score', { ascending: false })
          
          if (allProfiles && allProfiles.length > 0) {
            const top10Index = Math.floor(allProfiles.length * 0.1)
            const top10Threshold = allProfiles[top10Index]?.reputation_score || 0
            setIsTopAgent(profile.reputation_score >= top10Threshold)
          }
        }
      }
    } catch (error) {
      console.error('Error loading agent profile:', error)
    }
  }

  const loadAll = async () => {
    console.log('[loadAll] start')
    try {
      setIsLoading(true)
      const supabase = createClient()

      // ── auth 状态 ──────────────────────────────────────────────────
      const { data: { user } } = await supabase.auth.getUser()
      console.log('[loadAll] auth user:', user ? `uid=${user.id}` : 'anonymous (null)')

      // ── Load prediction tasks ──────────────────────────────────────
      console.log('[loadAll] querying markets...')
      const { data: markets, error: marketsError } = await supabase
        .from('markets')
        .select('*')
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false })

      if (marketsError) {
        console.error('[loadAll] markets error:', marketsError.code, marketsError.message)
        throw marketsError
      }
      console.log('[loadAll] markets rows:', markets?.length ?? 0)

      const tasksWithCounts = await Promise.all(
        (markets || []).map(async (market) => {
          const { count } = await supabase
            .from('predictions')
            .select('*', { count: 'exact', head: true })
            .eq('task_id', market.id)
          
          return { ...market, prediction_count: count || 0 }
        })
      )
      setTasks(tasksWithCounts)

      // ── Load survey tasks ──────────────────────────────────────────
      console.log('[loadAll] querying surveys...')
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys')
        .select('id, title, description, survey_type, status, response_count, target_agent_count, created_at')
        .in('status', ['running', 'completed'])
        .order('created_at', { ascending: false })

      if (surveyError) {
        console.error('[loadAll] surveys error:', surveyError.code, surveyError.message, surveyError)
        throw surveyError
      }
      console.log('[loadAll] surveys rows:', surveyData?.length ?? 0, surveyData)
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
      case 'prediction':
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
        <h1 className="text-3xl font-bold mb-2">搜索市场</h1>
        <p className="text-zinc-400">
          浏览所有开放的预测任务与调查任务 - 根据您的信誉和专业领域匹配最适合的任务
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="all">全部任务</TabsTrigger>
          <TabsTrigger value="prediction" className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" />
            预测任务
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
        <span>{task.prediction_count || 0} 预测</span>
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
