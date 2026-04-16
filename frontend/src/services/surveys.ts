import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── 问卷列表页 ────────────────────────────────────────────────────────────────

export async function fetchSurveysList() {
  const authSupa = await createClient()
  const { data: { user } } = await authSupa.auth.getUser()

  const svc = serviceClient()
  const { data: surveys } = await svc
    .from('survey_tasks')
    .select('id, title, description, survey_type, status, response_count, target_agent_count, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return { surveys: (surveys ?? []) as unknown[], userId: user?.id ?? null }
}

// ── 问卷详情页 ────────────────────────────────────────────────────────────────

export async function fetchSurveyDetail(surveyId: string) {
  const svc = serviceClient()

  const [surveyRes, questionsRes, analysesRes, responsesRes] = await Promise.all([
    svc.from('survey_tasks').select('*').eq('id', surveyId).maybeSingle(),
    svc.from('survey_questions').select('*').eq('survey_id', surveyId).order('question_order'),
    svc.from('survey_analyses').select('*').eq('survey_id', surveyId),
    svc.from('survey_responses')
      .select('id, question_id, agent_persona, answer, rationale, confidence')
      .eq('survey_id', surveyId)
      .order('submitted_at', { ascending: true })
      .limit(200),
  ])

  if (!surveyRes.data) return null

  return {
    survey:    surveyRes.data,
    questions: questionsRes.data ?? [],
    analyses:  analysesRes.data ?? [],
    responses: responsesRes.data ?? [],
  }
}

// ── 市场搜索页（server-side 部分） ───────────────────────────────────────────
// 注意：market-search 是 Client Component，调用此服务的是 API route

export async function fetchMarketSearchTasks() {
  const svc = serviceClient()

  const { data: taskData, error: tasksError } = await svc
    .from('prediction_tasks')
    .select('*')
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false })

  if (tasksError) throw tasksError

  // 并行获取每个任务的信号提交数
  const tasksWithCounts = await Promise.all(
    (taskData || []).map(async (task) => {
      const { count } = await svc
        .from('signal_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)
      return { ...task, signal_count: count || 0 }
    })
  )
  return tasksWithCounts
}

export async function fetchMarketSearchSurveys() {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('survey_tasks')
    .select('id, title, description, survey_type, status, response_count, target_agent_count, created_at')
    .in('status', ['running', 'completed'])
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchMarketSearchAgentProfile(userId: string) {
  const svc = serviceClient()

  const [profileRes, allProfilesRes] = await Promise.all([
    svc.from('profiles')
      .select('reputation_score, reputation_level, niche_tags')
      .eq('id', userId)
      .single(),
    svc.from('profiles')
      .select('reputation_score')
      .eq('status', 'active')
      .order('reputation_score', { ascending: false }),
  ])

  const profile = profileRes.data as { reputation_score: number; reputation_level: string; niche_tags: string[] | null } | null
  if (!profile) return null

  const allProfiles = (allProfilesRes.data ?? []) as { reputation_score: number }[]
  const top10Index   = Math.floor(allProfiles.length * 0.1)
  const top10Threshold = allProfiles[top10Index]?.reputation_score || 0
  const isTopAgent   = profile.reputation_score >= top10Threshold

  return { ...profile, isTopAgent }
}
