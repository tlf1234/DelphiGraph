import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// task_personas.target_demographic 的 JSONB 结构
type TargetDemographic = {
  gender?:     string[]  // ['any'] 或 ['female'] 或 ['male','female'] 等
  age_range?:  string[]  // ['18+'] 或 ['25-34'] 等
  location?:   string[]  // ['any'] 或 ['美国'] 等
  occupation?: string[]  // ['any'] 或 ['教师','学生'] 等
}

// 用于画像匹配的 Agent 档案字段
type AgentProfile = {
  id: string
  status: string
  reputation_score: number
  niche_tags: string[] | null
  persona_gender: string | null      // 'male' | 'female' | 'other' | 'unknown'
  persona_age_range: string | null   // 如 '25-34'
  persona_occupation: string | null
  persona_region: string | null
  persona_interests: string[] | null
}

// prediction_tasks 表的原始字段类型（含关联的 task_personas）
type RawTask = {
  id: string
  title: string
  question: string
  description: string
  reward_pool: number
  closes_at: string | null
  visibility: string                   // 'public' | 'private'
  required_niche_tags: string[] | null // 领域标签要求
  min_reputation: number               // 最低信誉分门槛
  is_calibration: boolean              // 是否为校准任务（新 Agent 必做）
  calibration_answer: string | null    // 校准任务标准答案
  search_directives: string[] | null   // 插件执行搜索时的指令列表
  constraints: Record<string, unknown> | null // 信号提交约束
  funding_type: string                 // 'direct' | 'crowd'
  funding_goal: number
  funding_current: number
  funding_progress: number
  allowed_viewers: string[] | null     // 私密任务的白名单 Agent ID
  created_by: string
  created_at: string
  task_personas: { target_demographic: TargetDemographic | null }[] | null
}

// 当任务未设置 constraints 时使用的默认值（模块级常量，避免每次请求重建）
const DEFAULT_CONSTRAINTS = {
  min_signals:                1,
  max_signals:                10,
  allow_persona_inference:    true,
  allow_abstain:              true,
  required_evidence_types:    [] as string[],
}

// 判断 Agent 是否符合任务的用户画像要求
// 逻辑：只要 target_demographic 中某个维度有明确要求（非 'any'），
//       且 Agent 已填写该字段，则进行匹配；Agent 未填写则跳过该维度检查。
function matchesPersona(agent: AgentProfile, task: RawTask): boolean {
  const demo = task.task_personas?.[0]?.target_demographic
  if (!demo) return true // 任务无画像要求，全部通过

  // 性别匹配
  if (demo.gender?.length && !demo.gender.includes('any')) {
    if (agent.persona_gender && agent.persona_gender !== 'unknown') {
      if (!demo.gender.includes(agent.persona_gender)) return false
    }
  }

  // 地区匹配
  if (demo.location?.length && !demo.location.includes('any')) {
    if (agent.persona_region) {
      const regionLower = agent.persona_region.toLowerCase()
      const matched = demo.location.some(loc => loc === 'any' || regionLower.includes(loc.toLowerCase()))
      if (!matched) return false
    }
  }

  // 职业匹配
  if (demo.occupation?.length && !demo.occupation.includes('any')) {
    if (agent.persona_occupation) {
      const occLower = agent.persona_occupation.toLowerCase()
      const matched = demo.occupation.some(occ => occ === 'any' || occLower.includes(occ.toLowerCase()))
      if (!matched) return false
    }
  }

  return true
}

export type GetAgentTaskResult =
  | { type: 'no_content' }
  | { type: 'error'; error: string; status: number }
  | { type: 'success'; tasks: unknown[]; agent_reputation: number }

// ─────────────────────────────────────────────────────────────────────────────
// getAgentTask
//
// 插件专用任务获取逻辑。完整流程：
//   1. 验证 API Key → 获取 Agent 档案
//   2. 拦截受限账号（purgatory）
//   3. 并行查询：全部活跃任务 + 该 Agent 已提交的 task_id
//   4. JS 层过滤（核心两步）：
//      a. 排除该 Agent 已提交过的任务
//      b. 排除画像不匹配的任务（私密任务检查信誉分 + 领域标签；公开任务不设门槛）
//   5. 排序：校准任务优先 → 截止时间最近优先 → 奖励池最高优先
//   6. 取第 1 条，按 UAP v3.0 协议格式返回
//
// 每次只返回 1 条任务，插件处理完再来取下一条。
// ─────────────────────────────────────────────────────────────────────────────
export async function getAgentTask(apiKey: string): Promise<GetAgentTaskResult> {
  const supabase = serviceClient()

  // ── 步骤 1：身份验证 ──────────────────────────────────────────────────────
  // 使用 service role 密钥绕过 RLS，直接访问 profiles 表
  // 用 api_key_hash 字段匹配，查询 Agent 档案（含画像字段）
  console.log('[agent-tasks] 步骤1: 查询 profiles, apiKey前8位:', apiKey.substring(0, 8) + '...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, status, reputation_score, niche_tags, persona_gender, persona_age_range, persona_occupation, persona_region, persona_interests')
    .eq('api_key_hash', apiKey)
    .single()

  if (profileError || !profile) {
    console.error('[agent-tasks] 步骤1失败: profileError=', profileError, 'profile=', profile)
    return { type: 'error', error: 'Invalid API key', status: 401 }
  }
  console.log('[agent-tasks] 步骤1成功: agent_id=', (profile as { id: string }).id, 'status=', (profile as { status: string }).status)

  const agentProfile = profile as AgentProfile

  // ── 步骤 2：账号状态检查 ──────────────────────────────────────────────────
  // restricted = purgatory 模式，需完成校准任务后才能恢复访问
  if (agentProfile.status === 'restricted') {
    return {
      type: 'error',
      error: 'Account restricted',
      status: 403,
    }
  }

  // ── 步骤 3：并行查询，减少总等待时间 ────────────────────────────────────────
  // 查询 A：所有状态为 pending/active 的任务（含 task_personas 用于画像匹配）
  // 查询 B：该 Agent 已经提交过信号的 task_id 集合（用于去重）
  console.log('[agent-tasks] 步骤3: 并行查询 prediction_tasks + signal_submissions')
  const [tasksResult, submittedResult] = await Promise.all([
    supabase
      .from('prediction_tasks')
      .select(
        'id, title, question, description, reward_pool, closes_at, visibility, ' +
        'required_niche_tags, min_reputation, is_calibration, calibration_answer, ' +
        'funding_type, funding_goal, funding_current, ' +
        'funding_progress, allowed_viewers, created_by, created_at, ' +
        'task_personas(target_demographic)'
      )
      .in('status', ['pending', 'active']),
    supabase
      .from('signal_submissions')
      .select('task_id')
      .eq('user_id', agentProfile.id),
  ])

  console.log('[agent-tasks] 步骤3结果: tasksError=', tasksResult.error, 'tasksCount=', tasksResult.data?.length ?? 0,
    'submittedError=', submittedResult.error, 'submittedCount=', submittedResult.data?.length ?? 0)

  if (tasksResult.error) {
    console.error('[agent-tasks] Tasks fetch error:', JSON.stringify(tasksResult.error))
    return { type: 'error', error: 'Failed to fetch tasks', status: 500 }
  }

  // 构建已提交任务 ID 集合（Set 查询 O(1)）
  const submittedIds = new Set(
    (submittedResult.data ?? []).map((s: { task_id: string }) => s.task_id)
  )
  const agentTags: string[] = agentProfile.niche_tags ?? []

  // ── 步骤 4：过滤（核心两步）────────────────────────────────────────────────
  // 步骤 4a：排除该 Agent 已提交过的任务
  // 步骤 4b：画像匹配检查（对所有任务生效）
  //   规则：创建者和白名单成员豁免所有检查，直接可见
  //   其他人需同时满足：
  //     - 信誉分 >= min_reputation
  //     - 领域标签有交集（任一命中即可，任务未设标签则跳过）
  //     - 人口统计画像匹配（性别/地区/职业，任务无要求则跳过）
  console.log('[agent-tasks] 步骤4: 开始过滤, 总任务数=', (tasksResult.data ?? []).length, '已提交任务数=', submittedIds.size)
  const filtered = ((tasksResult.data ?? []) as unknown as RawTask[]).filter(task => {
    // 4a：排除已提交过的任务
    if (submittedIds.has(task.id)) return false

    // 4b：画像匹配（创建者和白名单成员豁免）
    const isOwner   = task.created_by === agentProfile.id
    const isAllowed = task.allowed_viewers?.includes(agentProfile.id) ?? false
    if (!isOwner && !isAllowed) {
      // 信誉分不足拒绝
      if (agentProfile.reputation_score < (task.min_reputation ?? 0)) return false
      // 领域标签有要求且 Agent 无一命中则拒绝
      const reqTags = task.required_niche_tags ?? []
      if (reqTags.length > 0 && !reqTags.some(t => agentTags.includes(t))) return false
      // 人口统计画像匹配（性别、地区、职业）
      if (!matchesPersona(agentProfile, task)) return false
    }
    return true
  })

  // 无可用任务返回 204（插件侧跳过本轮处理）
  console.log('[agent-tasks] 步骤4结果: 过滤后剩余任务数=', filtered.length)
  if (filtered.length === 0) return { type: 'no_content' }

  // ── 步骤 5：排序，取第 1 条 ────────────────────────────────────────────────
  // 排序规则（明确的业务优先级，无人工评分）：
  //   1. 校准任务优先（新 Agent 必须先完成校准任务才能正常使用平台）
  //   2. 截止时间最近的优先（避免任务过期浪费）
  //   3. 奖励池最高的优先（相同条件下，高价值任务先处理）
  const task = filtered.sort((a, b) => {
    // 校准任务排最前
    if (a.is_calibration !== b.is_calibration) return a.is_calibration ? -1 : 1
    // 截止时间最近的优先（null 排最后）
    if (a.closes_at && b.closes_at) {
      return new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime()
    }
    if (a.closes_at) return -1
    if (b.closes_at) return  1
    // 奖励池最高的优先
    return (b.reward_pool ?? 0) - (a.reward_pool ?? 0)
  })[0]

  // ── 步骤 6：按 UAP v3.0 协议格式返回 ────────────────────────────────────
  return {
    type: 'success',
    tasks: [{
      task_id:            task.id,
      question:           task.question || task.title || '',
      description:        task.description || '',
      is_calibration:     task.is_calibration || false,
      calibration_answer: task.calibration_answer || null,
      search_directives:  task.search_directives || [],
      constraints:        task.constraints || DEFAULT_CONSTRAINTS,
      reward_pool:        task.reward_pool || 0,
      closes_at:          task.closes_at || null,
      min_reputation:     task.min_reputation || 0,
      created_at:         task.created_at || '',
    }],
    agent_reputation: agentProfile.reputation_score,
  }
}
