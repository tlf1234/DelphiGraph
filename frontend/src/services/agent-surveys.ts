import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ──────────────────────────────────────────────────────────
// 共享类型
// ──────────────────────────────────────────────────────────

type PersonaFilters = {
  gender?:     string[]
  age_range?:  string[]
  location?:   string[]
  occupation?: string[]
}

type AgentProfile = {
  id: string
  status: string
  reputation_score: number
  persona_gender: string | null
  persona_age_range: string | null
  persona_occupation: string | null
  persona_region: string | null
}

type RawSurvey = {
  id: string
  title: string
  description: string | null
  survey_type: string
  target_persona_filters: PersonaFilters | null
  target_agent_count: number
  response_count: number
  created_at: string
}

function matchesPersona(agent: AgentProfile, filters: PersonaFilters | null): boolean {
  if (!filters || Object.keys(filters).length === 0) return true

  if (filters.gender?.length && !filters.gender.includes('any')) {
    if (agent.persona_gender && agent.persona_gender !== 'unknown') {
      if (!filters.gender.includes(agent.persona_gender)) return false
    }
  }

  if (filters.location?.length && !filters.location.includes('any')) {
    if (agent.persona_region) {
      const regionLower = agent.persona_region.toLowerCase()
      const matched = filters.location.some(loc => loc === 'any' || regionLower.includes(loc.toLowerCase()))
      if (!matched) return false
    }
  }

  if (filters.occupation?.length && !filters.occupation.includes('any')) {
    if (agent.persona_occupation) {
      const occLower = agent.persona_occupation.toLowerCase()
      const matched = filters.occupation.some(occ => occ === 'any' || occLower.includes(occ.toLowerCase()))
      if (!matched) return false
    }
  }

  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// getAgentSurvey
//
// 插件专用问卷获取逻辑。流程：
//   1. 验证 API Key → 获取 Agent 档案（含画像字段）
//   2. 拦截受限账号（purgatory）
//   3. 并行查询：全部 running 状态问卷 + 该 Agent 已作答的 survey_id
//   4. JS 层过滤（Survey 特有三步）：
//      a. 排除已作答的问卷
//      b. 排除已满员的问卷（response_count >= target_agent_count，0 表示不限）
//      c. 画像匹配（性别/地区/职业，画像要求存于 target_persona_filters JSONB）
//   5. 排序：缺口最大的优先（需要更多回应）→ 创建时间最早优先
//   6. 取第 1 条，单独查询其题目，按 UAP v3.0 格式返回
//
// Survey 与 Task 的核心区别：
//   - 画像要求直接存在 survey_tasks.target_persona_filters（无需 JOIN）
//   - 有容量限制（target_agent_count），满员后不再分发
//   - 无 min_reputation / niche_tags / allowed_viewers 门槛
//   - 需额外查询题目后才能返回完整内容
// ─────────────────────────────────────────────────────────────────────────────

export type GetAgentSurveyResult =
  | { type: 'no_content' }
  | { type: 'error'; error: string; details?: string; status: number }
  | { type: 'success'; surveys: unknown[]; agent_reputation: number }

export async function getAgentSurvey(apiKey: string): Promise<GetAgentSurveyResult> {
  const supabase = serviceClient()

  // ── 步骤 1：身份验证 ──────────────────────────────────────────────────────
  // 查询 Agent 档案（含人口统计画像字段）
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, status, reputation_score, persona_gender, persona_age_range, persona_occupation, persona_region')
    .eq('api_key_hash', apiKey)
    .single()

  if (profileError || !profile) return { type: 'error', error: 'Invalid API key', status: 401 }

  const agentProfile = profile as AgentProfile

  // ── 步骤 2：账号状态检查 ──────────────────────────────────────────────────
  if (agentProfile.status === 'restricted') {
    return { type: 'error', error: 'Account restricted', status: 403 }
  }

  // ── 步骤 3：并行查询 ─────────────────────────────────────────────────────
  // 查询 A：所有 running 状态问卷（含 target_persona_filters 用于画像匹配）
  // 查询 B：该 Agent 已作答过的 survey_id 集合
  const [surveysResult, answeredResult] = await Promise.all([
    supabase
      .from('survey_tasks')
      .select('id, title, description, survey_type, target_persona_filters, target_agent_count, response_count, created_at')
      .eq('status', 'running'),
    supabase
      .from('survey_responses')
      .select('survey_id')
      .eq('user_id', agentProfile.id),
  ])

  if (surveysResult.error) {
    return { type: 'error', error: 'Failed to fetch surveys', details: surveysResult.error.message, status: 500 }
  }

  const answeredIds = new Set(
    (answeredResult.data ?? []).map((r: { survey_id: string }) => r.survey_id)
  )

  // ── 步骤 4：过滤 ─────────────────────────────────────────────────────────
  const filtered = ((surveysResult.data ?? []) as unknown as RawSurvey[]).filter(survey => {
    // 4a：排除已作答过的问卷
    if (answeredIds.has(survey.id)) return false
    // 4b：排除已满员的问卷（target_agent_count = 0 表示不限人数）
    if (survey.target_agent_count > 0 && survey.response_count >= survey.target_agent_count) return false
    // 4c：人口统计画像匹配（性别、地区、职业）
    if (!matchesPersona(agentProfile, survey.target_persona_filters)) return false
    return true
  })

  if (filtered.length === 0) return { type: 'no_content' }

  // ── 步骤 5：排序，取第 1 条 ───────────────────────────────────────────────
  // 排序规则：
  //   1. 缺口最大的优先（target - response 越大越迫切）；不限人数（target=0）排最后
  //   2. 创建时间最早优先（公平分发，旧问卷优先填满）
  const survey = filtered.sort((a, b) => {
    const aGap = a.target_agent_count > 0 ? a.target_agent_count - a.response_count : -1
    const bGap = b.target_agent_count > 0 ? b.target_agent_count - b.response_count : -1
    if (aGap !== bGap) return bGap - aGap  // 缺口大的排前面（-1 即不限的排最后）
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })[0]

  // ── 步骤 6：查询该问卷题目，按 UAP v3.0 格式返回 ─────────────────────────
  // 先筛出 1 条再查题目，避免批量拉取所有问卷题目造成不必要的数据传输
  const { data: questions, error: questionsError } = await supabase
    .from('survey_questions')
    .select('id, question_order, question_text, question_type, options, rating_min, rating_max, is_required')
    .eq('survey_id', survey.id)
    .order('question_order', { ascending: true })

  if (questionsError) return { type: 'error', error: 'Failed to fetch survey questions', details: questionsError.message, status: 500 }

  return {
    type: 'success',
    surveys: [{
      survey_id:               survey.id,
      title:                   survey.title,
      description:             survey.description || '',
      survey_type:             survey.survey_type,
      target_agent_count:      survey.target_agent_count,
      current_response_count:  survey.response_count,
      created_at:              survey.created_at,
      questions: (questions ?? []).map(q => ({
        question_id:    (q as Record<string, unknown>).id,
        question_order: (q as Record<string, unknown>).question_order,
        question_text:  (q as Record<string, unknown>).question_text,
        question_type:  (q as Record<string, unknown>).question_type,
        options:        (q as Record<string, unknown>).options || [],
        rating_min:     (q as Record<string, unknown>).rating_min,
        rating_max:     (q as Record<string, unknown>).rating_max,
        is_required:    (q as Record<string, unknown>).is_required,
      })),
    }],
    agent_reputation: agentProfile.reputation_score,
  }
}

// ──────────────────────────────────────────────────────────
// POST 问卷答案
// ──────────────────────────────────────────────────────────

export interface SurveyResponseInput {
  survey_id: string
  responses: Array<{
    question_id: string
    answer: unknown
    rationale: string
    confidence?: number
  }>
  user_persona: Record<string, unknown>
  model_name?: string
  plugin_version?: string
  protocol_version?: string
}

export type SubmitSurveyResult =
  | { success: true; response_id: string | null; survey_id: string; timestamp: string; questions_answered: number }
  | { success: false; error: string; details?: unknown; status: number }

export async function submitSurveyResponse(
  apiKey: string,
  body: SurveyResponseInput,
): Promise<SubmitSurveyResult> {
  console.log('[agent-survey-responses] Request received')

  const supabase = serviceClient()

  // Validate API key and get user profile
  console.log('[agent-survey-responses] Validating API key...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('api_key_hash', apiKey)
    .single()

  if (profileError || !profile) {
    console.error('[agent-survey-responses] Profile error:', profileError)
    return { success: false, error: 'Invalid API key', status: 401 }
  }

  const p = profile as { id: string; status: string }
  console.log('[agent-survey-responses] Profile found:', p.id)

  // Check if user is restricted
  if (p.status === 'restricted') {
    return { success: false, error: 'Account restricted', status: 403 }
  }

  const { data: survey, error: surveyError } = await supabase
    .from('survey_tasks')
    .select('id, status, closes_at')
    .eq('id', body.survey_id)
    .single()

  if (surveyError || !survey) {
    return { success: false, error: 'SURVEY_NOT_FOUND', details: { survey_id: 'Survey not found' }, status: 404 }
  }

  const sv = survey as { id: string; status: string; closes_at: string | null }

  if (sv.status !== 'running') {
    return { success: false, error: 'SURVEY_NOT_RUNNING', details: { survey_id: 'Survey is not accepting responses' }, status: 400 }
  }
  // Check if survey is closed
  if (sv.closes_at && new Date(sv.closes_at) < new Date()) {
    return { success: false, error: 'SURVEY_CLOSED', details: { closes_at: 'Survey deadline has passed' }, status: 400 }
  }

  const validationErrors: Record<string, string> = {}
  for (let i = 0; i < body.responses.length; i++) {
    const r = body.responses[i]
    if (!r.question_id)                                    validationErrors[`responses[${i}].question_id`] = 'Required field'
    if (r.answer === undefined || r.answer === null || r.answer === '') validationErrors[`responses[${i}].answer`] = 'Required field'
    if (!r.rationale || r.rationale.trim() === '')        validationErrors[`responses[${i}].rationale`] = 'Required field'
  }
  if (Object.keys(validationErrors).length > 0) {
    return { success: false, error: 'VALIDATION_FAILED', details: validationErrors, status: 400 }
  }

  // Insert responses into database
  console.log('[agent-survey-responses] Inserting responses...')
  const responseInserts = body.responses.map(r => ({
    survey_id:        body.survey_id,
    question_id:      r.question_id,
    user_id:          p.id,
    answer:           typeof r.answer === 'object' ? JSON.stringify(r.answer) : String(r.answer),
    rationale:        r.rationale,
    confidence:       r.confidence || 0.7,
    agent_persona:    body.user_persona,
    model_name:       body.model_name || null,
    plugin_version:   body.plugin_version || null,
    protocol_version: body.protocol_version || '3.0-survey',
  }))

  const { data: insertedResponses, error: insertError } = await supabase
    .from('survey_responses')
    .insert(responseInserts)
    .select('id')

  if (insertError) {
    console.error('[agent-survey-responses] Insert error:', insertError)
    // Check for duplicate response constraint violation
    if (insertError.code === '23505') {
      return { success: false, error: 'DUPLICATE_RESPONSE', details: { message: 'You have already responded to this survey' }, status: 409 }
    }
    return { success: false, error: 'DATABASE_ERROR', details: { message: insertError.message }, status: 500 }
  }

  console.log('[agent-survey-responses] Responses inserted successfully')

  const firstRow = insertedResponses?.[0] as { id: string } | undefined

  return {
    success:           true,
    response_id:       firstRow?.id || null,
    survey_id:         body.survey_id,
    timestamp:         new Date().toISOString(),
    questions_answered: body.responses.length,
  }
}
