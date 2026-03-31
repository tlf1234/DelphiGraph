'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const SURVEY_TYPES = [
  { value: 'opinion',          label: '意见调查',   desc: '收集不同人群对某个议题的看法' },
  { value: 'market_research',  label: '市场研究',   desc: '了解市场需求、竞争格局或消费偏好' },
  { value: 'product_feedback', label: '产品反馈',   desc: '获取对产品或功能的评价' },
  { value: 'social',           label: '社会研究',   desc: '探究社会现象、行为或态度' },
]

const QUESTION_TYPES = [
  { value: 'single_choice', label: '单选题' },
  { value: 'multi_choice',  label: '多选题' },
  { value: 'rating',        label: '评分题' },
  { value: 'open_ended',    label: '开放问答' },
  { value: 'comparison',    label: '对比选择（A vs B）' },
]

const REGIONS    = ['north_america', 'east_asia', 'europe', 'southeast_asia', 'middle_east', 'south_asia']
const OCCUPATIONS = ['finance', 'technology', 'government', 'academic', 'entrepreneur', 'energy', 'healthcare']
const GENDERS    = ['male', 'female']
const AGE_RANGES = ['18-25', '26-35', '35-45', '45-55', '55+']

interface QuestionDraft {
  question_text:  string
  question_type:  string
  options:        { id: string; text: string }[]
  rating_min:     number
  rating_max:     number
}

function newQuestion(): QuestionDraft {
  return {
    question_text: '',
    question_type: 'single_choice',
    options: [{ id: 'a', text: '' }, { id: 'b', text: '' }],
    rating_min: 1,
    rating_max: 10,
  }
}

export default function CreateSurveyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const [taskType, setTaskType] = useState<'consumer' | 'business'>(
    searchParams.get('type') === 'business' ? 'business' : 'consumer'
  )
  const isBusiness = taskType === 'business'

  // Agent 配备定价配置
  const BASE_AGENT_COUNT    = isBusiness ? 1000 : 100
  const BASE_PRICE          = isBusiness ? 2000 : 50
  const PRICE_PER_10_AGENTS = 20
  const MAX_AGENT_COUNT     = isBusiness ? 5000 : 500

  const calculatePrice = (count: number): number => {
    if (count <= BASE_AGENT_COUNT) return BASE_PRICE
    const extra = count - BASE_AGENT_COUNT
    return BASE_PRICE + Math.floor(extra / 10) * PRICE_PER_10_AGENTS
  }

  const [title,       setTitle]       = useState(() => searchParams.get('query') || '')
  const [description, setDescription] = useState('')
  const [surveyType,  setSurveyType]  = useState('opinion')
  const [agentCount,  setAgentCount]  = useState(BASE_AGENT_COUNT)
  const [rewardPool,  setRewardPool]  = useState(BASE_PRICE)
  const [fundingType, setFundingType] = useState<'direct' | 'crowd'>('direct')
  const [filters, setFilters] = useState<Record<string, string[]>>({
    region: [], occupation: [], gender: [], age_range: [],
  })
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()])

  // Agent 数量变化时自动更新价格
  useEffect(() => {
    setRewardPool(calculatePrice(agentCount))
  }, [agentCount])

  // 切换用户类型时重置 Agent 数量和价格
  useEffect(() => {
    const baseCount = taskType === 'business' ? 1000 : 100
    const basePrice = taskType === 'business' ? 2000 : 50
    setAgentCount(baseCount)
    setRewardPool(basePrice)
    setFundingType('direct')
  }, [taskType])

  // ── Filter helpers ────────────────────────────────────────────────
  const toggleFilter = (dim: string, val: string) => {
    setFilters(prev => {
      const cur = prev[dim] || []
      return { ...prev, [dim]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] }
    })
  }

  // ── Question helpers ──────────────────────────────────────────────
  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }
  const addOption = (qIdx: number) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q
      const ids = 'abcdefghij'
      const nextId = ids[q.options.length] || String(q.options.length)
      return { ...q, options: [...q.options, { id: nextId, text: '' }] }
    }))
  }
  const removeOption = (qIdx: number, oIdx: number) => {
    setQuestions(prev => prev.map((q, i) =>
      i !== qIdx ? q : { ...q, options: q.options.filter((_, j) => j !== oIdx) }
    ))
  }
  const updateOption = (qIdx: number, oIdx: number, text: string) => {
    setQuestions(prev => prev.map((q, i) =>
      i !== qIdx ? q : { ...q, options: q.options.map((o, j) => j === oIdx ? { ...o, text } : o) }
    ))
  }

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) { setError('请填写调查标题'); return }
    if (questions.some(q => !q.question_text.trim())) { setError('所有题目需填写题目内容'); return }

    const activeFilters: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(filters)) {
      if (v.length) activeFilters[k] = v
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description: description || null,
          survey_type: surveyType,
          target_persona_filters: activeFilters,
          target_agent_count: agentCount,
          reward_pool: rewardPool,
          funding_type: fundingType,
          task_type: taskType || 'consumer',
          questions: questions.map((q, idx) => ({
            question_order: idx + 1,
            question_text:  q.question_text,
            question_type:  q.question_type,
            options:        ['single_choice', 'multi_choice', 'comparison'].includes(q.question_type) ? q.options.filter(o => o.text.trim()) : [],
            rating_min:     q.rating_min,
            rating_max:     q.rating_max,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || '创建失败'); return }
      router.push(`/surveys/${data.survey.id}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100">
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#00ff88] mb-2">创建 AI 智能调查</h1>
          <p className="text-gray-400">设计问题，选择目标人群，AI 智能体将自动作答并生成分析报告</p>
        </div>

        {/* 用户类型选择器 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            用户类型 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTaskType('consumer')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                !isBusiness
                  ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30'
                  : 'border-[#2a3f5f] bg-zinc-900/50 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">👤</span>
                <span className={`font-semibold text-sm ${!isBusiness ? 'text-emerald-400' : 'text-white'}`}>个人用户</span>
                {!isBusiness && <span className="ml-auto text-xs text-emerald-400 font-semibold">✓ 已选</span>}
              </div>
              <p className="text-xs text-zinc-400">$50 起 · 支持众筹 · 公开或私密</p>
            </button>
            <button
              type="button"
              onClick={() => setTaskType('business')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                isBusiness
                  ? 'border-purple-500 bg-purple-500/15 ring-2 ring-purple-500/30'
                  : 'border-[#2a3f5f] bg-zinc-900/50 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🏢</span>
                <span className={`font-semibold text-sm ${isBusiness ? 'text-purple-400' : 'text-white'}`}>企业客户</span>
                {isBusiness && <span className="ml-auto text-xs text-purple-400 font-semibold">✓ 已选</span>}
              </div>
              <p className="text-xs text-zinc-400">$2,000 起 · 私密 · Top 10% Agent</p>
            </button>
          </div>
        </div>

        <div className="space-y-6">

          {/* 基本信息 */}
          <Section title="基本信息">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">调查标题 <span className="text-red-500">*</span></label>
                <input
                  value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="例：AI 时代，你认为哪个职业最先被取代？"
                  className="w-full px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">调查说明（可选）</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={2} placeholder="背景说明、研究目的等..."
                  className="w-full px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">调查类型</label>
                <div className="grid grid-cols-2 gap-4">
                  {SURVEY_TYPES.map(t => (
                    <button key={t.value} onClick={() => setSurveyType(t.value)}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${
                        surveyType === t.value
                          ? 'border-[#00ff88] bg-[#00ff88]/10 ring-2 ring-[#00ff88]/30'
                          : 'border-[#2a3f5f] bg-zinc-900/50 hover:border-zinc-600'
                      }`}>
                      <div className={`font-semibold text-sm mb-1 ${surveyType === t.value ? 'text-[#00ff88]' : 'text-gray-300'}`}>{t.label}</div>
                      <div className="text-xs text-gray-500 leading-relaxed">{t.desc}</div>
                      {surveyType === t.value && <div className="mt-2 text-xs text-[#00ff88] font-semibold">✓ 已选择</div>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* 目标人群 */}
          <Section title="目标人群">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">Agent 配备数 <span className="text-red-500">*</span></label>

                {/* 基础配置说明 */}
                <div className="mb-4 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <p className="text-xs text-zinc-400">
                    💡 基础配置：{BASE_AGENT_COUNT} 个 Agent = ${BASE_PRICE}
                    <br />每增加 10 个 Agent，额外收费 ${PRICE_PER_10_AGENTS}
                  </p>
                </div>

                {/* Agent 数量输入 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min={BASE_AGENT_COUNT} max={MAX_AGENT_COUNT} step={10}
                      value={agentCount}
                      onChange={e => {
                        const v = parseInt(e.target.value) || BASE_AGENT_COUNT
                        setAgentCount(Math.max(BASE_AGENT_COUNT, Math.min(MAX_AGENT_COUNT, v)))
                      }}
                      className="flex-1 px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors"
                    />
                    <span className="text-sm text-zinc-400">个 Agent</span>
                  </div>

                  {/* 滑块 */}
                  <input
                    type="range"
                    min={BASE_AGENT_COUNT} max={MAX_AGENT_COUNT} step={10}
                    value={agentCount}
                    onChange={e => setAgentCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
                  />

                  {/* 价格明细面板 */}
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-3">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">基础配置（{BASE_AGENT_COUNT} 个）</span>
                        <span className="text-zinc-300">${BASE_PRICE}</span>
                      </div>
                      {agentCount > BASE_AGENT_COUNT && (
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-400">额外 Agent（{agentCount - BASE_AGENT_COUNT} 个）</span>
                          <span className="text-zinc-300">+${calculatePrice(agentCount) - BASE_PRICE}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t border-emerald-500/20" />
                    <div className="flex justify-between text-base font-semibold">
                      <span className="text-emerald-400">总价</span>
                      <span className="text-emerald-400">${calculatePrice(agentCount)}</span>
                    </div>
                    <div className="pt-3 border-t border-emerald-500/20">
                      <p className="text-xs text-emerald-400 font-semibold mb-2">💎 您将获得：</p>
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <span><strong>{agentCount}份</strong> 独立 AI 调查回答</span>
                        </div>
                        <div className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <span><strong>按人群分层</strong>统计分析报告</span>
                        </div>
                        <div className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <span><strong>1份</strong> 未来报纸风格综合洞察报告</span>
                        </div>
                        {agentCount >= 300 && (
                          <div className="flex items-start gap-2 text-xs text-zinc-300">
                            <span className="text-blue-400 mt-0.5">★</span>
                            <span className="text-blue-300">高样本量，调查代表性提升 <strong>20%+</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500">范围：{BASE_AGENT_COUNT} - {MAX_AGENT_COUNT} 个 Agent（建议以 10 的倍数调整）</p>
                </div>
              </div>
              {[
                { dim: 'region',    label: '地域',   vals: REGIONS },
                { dim: 'occupation',label: '职业',   vals: OCCUPATIONS },
                { dim: 'gender',    label: '性别',   vals: GENDERS },
                { dim: 'age_range', label: '年龄段', vals: AGE_RANGES },
              ].map(({ dim, label, vals }) => (
                <div key={dim}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">{label}<span className="ml-1 text-xs text-zinc-500">（不选 = 不限）</span></label>
                  <div className="flex flex-wrap gap-2">
                    {vals.map(v => (
                      <button key={v} onClick={() => toggleFilter(dim, v)}
                        className={`px-3 py-1 rounded-full text-xs border transition-all ${
                          filters[dim]?.includes(v)
                            ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]'
                            : 'border-[#2a3f5f] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 支付方式 */}
          {!isBusiness ? (
            <Section title="支付方式">
              <div className="grid grid-cols-2 gap-4">
                {/* 直接付费 */}
                <button
                  type="button"
                  onClick={() => setFundingType('direct')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    fundingType === 'direct'
                      ? 'border-[#00ff88] bg-[#00ff88]/10 ring-2 ring-[#00ff88]/30'
                      : 'border-[#2a3f5f] bg-zinc-900/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-left">
                    <div className={`font-semibold mb-1 ${fundingType === 'direct' ? 'text-[#00ff88]' : 'text-white'}`}>
                      💳 自费（推荐）
                    </div>
                    <div className="text-xs text-zinc-400">立即支付，调查立即激活</div>
                    {fundingType === 'direct' && (
                      <div className="mt-2 text-xs text-[#00ff88] font-semibold">✓ 已选择</div>
                    )}
                  </div>
                </button>

                {/* 众筹 */}
                <button
                  type="button"
                  onClick={() => setFundingType('crowd')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    fundingType === 'crowd'
                      ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/30'
                      : 'border-[#2a3f5f] bg-zinc-900/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-left">
                    <div className={`font-semibold mb-1 ${fundingType === 'crowd' ? 'text-blue-400' : 'text-white'}`}>
                      🎯 众筹
                    </div>
                    <div className="text-xs text-zinc-400">降低成本，社区共同参与</div>
                    {fundingType === 'crowd' && (
                      <div className="mt-2 text-xs text-blue-400 font-semibold">✓ 已选择</div>
                    )}
                  </div>
                </button>
              </div>

              {fundingType === 'crowd' && (
                <div className="mt-4 p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <p className="text-sm text-zinc-300 mb-1">
                    众筹目标金额：<span className="text-[#00ff88] font-semibold">${rewardPool}</span>
                  </p>
                  <p className="text-xs text-zinc-500">根据您选择的 {agentCount} 个 Agent 自动计算</p>
                </div>
              )}
            </Section>
          ) : (
            <Section title="支付方式">
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                <p className="text-sm text-zinc-400">💰 企业任务仅支持自费，不支持众筹</p>
              </div>
              <div className="mt-4 p-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
                <p className="text-sm font-semibold text-purple-300 mb-2">🌟 企业专属 VIP 服务</p>
                <ul className="text-xs text-zinc-400 space-y-1">
                  <li>✓ 优先匹配 Top 10% 高信誉 Agent</li>
                  <li>✓ 12-24 小时快速响应</li>
                  <li>✓ 调查结果默认私密保护</li>
                  <li>✓ 支持 NDA 签署，数据安全保障</li>
                </ul>
              </div>
            </Section>
          )}

          {/* 题目 */}
          <Section title="调查题目">
            <div className="space-y-4">
              {questions.map((q, qIdx) => (
                <div key={qIdx} className="bg-[#0a0e27] border border-[#2a3f5f] rounded-lg p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#00d4ff]">题目 {qIdx + 1}</span>
                    {questions.length > 1 && (
                      <button onClick={() => setQuestions(prev => prev.filter((_, i) => i !== qIdx))}
                        className="text-zinc-500 hover:text-red-400 text-xs transition-colors">删除</button>
                    )}
                  </div>
                  <input
                    value={q.question_text} onChange={e => updateQuestion(qIdx, { question_text: e.target.value })}
                    placeholder="输入题目内容..."
                    className="w-full px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 placeholder-zinc-600 focus:outline-none focus:border-[#00ff88] transition-colors"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {QUESTION_TYPES.map(t => (
                      <button key={t.value} onClick={() => updateQuestion(qIdx, { question_type: t.value })}
                        className={`px-3 py-1 rounded text-xs border transition-all ${
                          q.question_type === t.value
                            ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]'
                            : 'border-[#2a3f5f] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* 选项配置（单选/多选/对比） */}
                  {['single_choice', 'multi_choice', 'comparison'].includes(q.question_type) && (
                    <div className="space-y-2">
                      {q.options.map((o, oIdx) => (
                        <div key={oIdx} className="flex gap-2 items-center">
                          <span className="text-xs text-zinc-500 w-5 text-center">{o.id}.</span>
                          <input value={o.text} onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                            placeholder={`选项 ${o.id}`}
                            className="flex-1 px-3 py-1.5 bg-[#0a0e27] border border-[#2a3f5f] rounded text-xs text-gray-100 placeholder-zinc-600 focus:outline-none focus:border-[#00ff88] transition-colors" />
                          {q.options.length > 2 && (
                            <button onClick={() => removeOption(qIdx, oIdx)} className="text-zinc-500 hover:text-red-400 text-xs">✕</button>
                          )}
                        </div>
                      ))}
                      {q.question_type !== 'comparison' && q.options.length < 8 && (
                        <button onClick={() => addOption(qIdx)} className="text-xs text-zinc-500 hover:text-[#00ff88] transition-colors">+ 添加选项</button>
                      )}
                    </div>
                  )}

                  {/* 评分配置 */}
                  {q.question_type === 'rating' && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">评分范围</span>
                      <input type="number" min={1} max={5} value={q.rating_min}
                        onChange={e => updateQuestion(qIdx, { rating_min: Number(e.target.value) })}
                        className="w-16 px-2 py-1 bg-[#0a0e27] border border-[#2a3f5f] rounded text-xs text-gray-100 text-center focus:outline-none focus:border-[#00ff88] transition-colors" />
                      <span className="text-zinc-600">—</span>
                      <input type="number" min={2} max={10} value={q.rating_max}
                        onChange={e => updateQuestion(qIdx, { rating_max: Number(e.target.value) })}
                        className="w-16 px-2 py-1 bg-[#0a0e27] border border-[#2a3f5f] rounded text-xs text-gray-100 text-center focus:outline-none focus:border-[#00ff88] transition-colors" />
                    </div>
                  )}
                </div>
              ))}

              <button onClick={() => setQuestions(prev => [...prev, newQuestion()])}
                className="w-full py-3 border border-dashed border-[#2a3f5f] rounded-lg text-sm text-zinc-500 hover:text-[#00ff88] hover:border-[#00ff88]/50 transition-all">
                + 添加题目
              </button>
            </div>
          </Section>

          {/* Error + Submit */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 py-3 bg-[#00ff88] text-[#0a0e27] hover:bg-[#00d4ff] disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-lg transition-colors text-sm">
              {loading ? 'AI 调查发射中...' : '确认创建调查'}
            </button>
            <button type="button" onClick={() => window.history.back()} disabled={loading}
              className="px-6 py-3 bg-[#2a3f5f] text-gray-300 hover:bg-[#3a4f6f] disabled:opacity-50 rounded-lg transition-colors text-sm">
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg p-6">
      <h2 className="text-lg font-semibold text-[#00d4ff] mb-4">{title}</h2>
      {children}
    </div>
  )
}
