/**
 * POST /api/test/survey-batch
 * For each agent in the batch, generate one answer per survey question,
 * then insert into survey_responses.
 * Body: { survey_id, batch_index, agents: [{id, username}], questions: [...] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Answer-generation templates ───────────────────────────────────────
const OPEN_ENDED_TEMPLATES = [
  '根据当前市场数据和趋势分析，我认为这一议题将呈现出明显的结构性分化，不同群体的反应将取决于其所处的经济环境。',
  '从长期视角来看，技术进步与政策变化共同塑造了当前格局，短期扰动难以改变根本趋势。',
  '综合多方面信息来源判断，现阶段存在较大不确定性，建议密切关注关键指标的边际变化。',
  '历史数据表明，类似情境下市场通常在3-6个月内完成价格发现，当前阶段处于信息不对称高峰期。',
  '基于行为经济学原理，群体决策中往往存在显著的从众效应，理性分析与情绪因素需要分开评估。',
  '政策传导机制决定了反应路径，预期管理的有效性将是影响最终结果的核心变量。',
  '数据维度的多元化使得单一指标的预测力有所下降，需要构建综合评估框架来提升判断准确性。',
  '结构性矛盾与周期性波动交织，使得短期判断充满挑战，长线逻辑相对清晰。',
  '从供需均衡角度分析，当前价格信号已部分反映了市场参与者的集体预期，但仍存在修正空间。',
  '监管环境的不确定性构成了额外的风险溢价，投资者的风险偏好调整将是关键催化剂。',
  '新兴技术的渗透率加速提升，传统行业面临颠覆性挑战，适应能力差异将导致显著分化。',
  '地缘政治格局重构对供应链的影响正在逐步显现，产业链重构进入关键阶段。',
]

const RATIONALE_TEMPLATES = [
  '基于宏观经济数据分析，综合考量了政策信号与市场反应。',
  '参考行业专家观点，结合实地调研信息做出判断。',
  '量化模型显示该选项的概率最高，历史回测结果支持此判断。',
  '从风险收益比角度评估，此为最优选择。',
  '信息来源多元，交叉验证后得出此结论。',
  '基于个人专业背景和长期从业经验做出判断。',
  '短期数据与长期趋势指向一致，信心较强。',
  '考虑到当前市场环境的特殊性，此选项具有更强的适应性。',
]

const AGENT_TEMPLATES = [
  { occupation: 'finance', gender: 'male', age_range: '35-45', region: 'north_america', education: 'master', income_level: 'high' },
  { occupation: 'technology', gender: 'female', age_range: '28-35', region: 'east_asia', education: 'phd', income_level: 'high' },
  { occupation: 'government', gender: 'male', age_range: '45-55', region: 'europe', education: 'master', income_level: 'middle' },
  { occupation: 'academic', gender: 'female', age_range: '38-48', region: 'north_america', education: 'phd', income_level: 'middle' },
  { occupation: 'entrepreneur', gender: 'male', age_range: '32-42', region: 'east_asia', education: 'bachelor', income_level: 'high' },
  { occupation: 'consultant', gender: 'female', age_range: '40-50', region: 'europe', education: 'master', income_level: 'high' },
  { occupation: 'journalist', gender: 'male', age_range: '30-40', region: 'north_america', education: 'bachelor', income_level: 'middle' },
  { occupation: 'energy', gender: 'male', age_range: '45-55', region: 'middle_east', education: 'master', income_level: 'high' },
  { occupation: 'healthcare', gender: 'female', age_range: '38-48', region: 'north_america', education: 'phd', income_level: 'high' },
  { occupation: 'military', gender: 'male', age_range: '50-60', region: 'east_asia', education: 'master', income_level: 'middle' },
]

// ── Helpers ───────────────────────────────────────────────────────────
function pickOption(options: { id: string; text: string }[], seed: number) {
  if (!options.length) return ''
  return options[seed % options.length].id
}

function generateAnswer(
  questionType: string,
  options: { id: string; text: string }[],
  ratingMin: number,
  ratingMax: number,
  seed: number,
): string {
  switch (questionType) {
    case 'single_choice':
    case 'comparison':
      return pickOption(options, seed)
    case 'multi_choice': {
      const count = 1 + (seed % Math.min(3, options.length))
      const chosen: string[] = []
      for (let i = 0; i < count; i++) chosen.push(options[(seed + i) % options.length].id)
      return JSON.stringify(Array.from(new Set(chosen)))
    }
    case 'rating': {
      const range = ratingMax - ratingMin
      return String(ratingMin + (seed % (range + 1)))
    }
    case 'open_ended':
      return OPEN_ENDED_TEMPLATES[seed % OPEN_ENDED_TEMPLATES.length]
    default:
      return pickOption(options, seed)
  }
}

// ── Route Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey)
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { survey_id, batch_index, agents, questions } = body
  if (!survey_id || !agents?.length || !questions?.length)
    return NextResponse.json({ error: 'Missing survey_id, agents, or questions' }, { status: 400 })

  const admin    = createClient(supabaseUrl, serviceKey)
  const batchSz  = 10 // agents per batch
  const start    = batch_index * batchSz
  const batch    = Array.from({ length: batchSz }, (_, i) => agents[(start + i) % agents.length])
  const now      = new Date()
  const rows: any[] = []

  batch.forEach((agent: { id: string; username: string }, agentIdx: number) => {
    const persona = AGENT_TEMPLATES[(start + agentIdx) % AGENT_TEMPLATES.length]
    questions.forEach((q: any, qIdx: number) => {
      const seed  = (start + agentIdx) * 37 + qIdx * 13 + batch_index * 7
      const answer = generateAnswer(
        q.question_type,
        q.options || [],
        q.rating_min ?? 1,
        q.rating_max ?? 10,
        seed,
      )
      rows.push({
        survey_id,
        question_id: q.id,
        agent_persona: { ...persona, username: agent.username, agent_id: agent.id },
        answer,
        rationale: RATIONALE_TEMPLATES[seed % RATIONALE_TEMPLATES.length],
        confidence: 0.5 + (seed % 5) * 0.1,
        submitted_at: new Date(now.getTime() + agentIdx * 800 + qIdx * 50).toISOString(),
      })
    })
  })

  console.log(`[survey-batch] batch_index=${batch_index} → inserting ${rows.length} responses`)
  const { data: inserted, error } = await admin
    .from('survey_responses')
    .insert(rows)
    .select('id')

  if (error) {
    console.error('[survey-batch] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Count total responses for this survey
  const { count: total } = await admin
    .from('survey_responses')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', survey_id)

  return NextResponse.json({
    success: true,
    inserted: inserted?.length ?? 0,
    total_responses: total ?? 0,
    batch_index,
  })
}
