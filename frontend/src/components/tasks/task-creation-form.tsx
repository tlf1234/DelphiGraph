'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
// 移除 NicheTagSelector 导入，不再需要

interface FormErrors {
  description?: string
  question?: string
  resolution_criteria?: string
  closes_at?: string
  reward_pool?: string
  general?: string
}

export default function TaskCreationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  // 任务类型：consumer（C端）或 business（B端），可在表单内切换
  const [taskType, setTaskType] = useState<'consumer' | 'business'>(
    searchParams.get('type') === 'business' ? 'business' : 'consumer'
  )
  const isBusiness = taskType === 'business'

  // Agent 配备定价配置
  const BASE_AGENT_COUNT = isBusiness ? 1000 : 100
  const BASE_PRICE = isBusiness ? 2000 : 50
  const PRICE_PER_10_AGENTS = 20
  const MAX_AGENT_COUNT = isBusiness ? 5000 : 500

  // Agent 数量状态
  const [agentCount, setAgentCount] = useState(BASE_AGENT_COUNT)

  // 计算价格
  const calculatePrice = (count: number): number => {
    if (count <= BASE_AGENT_COUNT) {
      return BASE_PRICE
    }
    const extraAgents = count - BASE_AGENT_COUNT
    const extraGroups = Math.floor(extraAgents / 10)
    return BASE_PRICE + extraGroups * PRICE_PER_10_AGENTS
  }

  const [formData, setFormData] = useState({
    description: '',
    question: '',
    resolution_criteria: '',
    closes_at: '',
    reward_pool: BASE_PRICE,
    // required_niche_tags 将由后端AI自动分析生成，前端不再收集
    funding_type: 'direct' as 'crowd' | 'direct',
    funding_goal: BASE_PRICE,
  })

  // 当 Agent 数量变化时，自动更新价格
  useEffect(() => {
    const newPrice = calculatePrice(agentCount)
    setFormData(prev => ({
      ...prev,
      reward_pool: newPrice,
      funding_goal: newPrice,
    }))
  }, [agentCount])

  // 切换用户类型时重置 Agent 数量和价格
  useEffect(() => {
    const baseCount = taskType === 'business' ? 1000 : 100
    const basePrice = taskType === 'business' ? 2000 : 50
    setAgentCount(baseCount)
    setFormData(prev => ({
      ...prev,
      reward_pool: basePrice,
      funding_goal: basePrice,
      funding_type: 'direct',
    }))
  }, [taskType])
  
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 移除 matchingAgentsCount 状态，因为不再需要前端预估

  // 从URL参数获取搜索查询
  useEffect(() => {
    const query = searchParams.get('query')
    if (query) {
      setFormData(prev => ({ ...prev, question: query }))
    }
  }, [searchParams])

  // 客户端验证
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.description.trim()) {
      newErrors.description = '描述不能为空'
    } else if (formData.description.length > 5000) {
      newErrors.description = '描述不能超过5000个字符'
    }

    if (!formData.question.trim()) {
      newErrors.question = '问题不能为空'
    } else if (formData.question.length > 500) {
      newErrors.question = '问题不能超过500个字符'
    }

    // 预言任务必须有兑现标准
    if (!formData.resolution_criteria.trim()) {
      newErrors.resolution_criteria = '预言任务必须设置兑现标准'
    } else if (formData.resolution_criteria.length > 2000) {
      newErrors.resolution_criteria = '兑现标准不能超过2000个字符'
    }

    // 预言任务必须有截止时间
    if (!formData.closes_at) {
      newErrors.closes_at = '预言任务必须设置截止时间'
    } else {
      const closesAt = new Date(formData.closes_at)
      const now = new Date()
      if (closesAt <= now) {
        newErrors.closes_at = '截止时间必须是未来时间'
      }
    }

    // Agent 数量验证
    if (agentCount < BASE_AGENT_COUNT) {
      newErrors.general = `Agent 数量不能少于 ${BASE_AGENT_COUNT} 个`
    } else if (agentCount > MAX_AGENT_COUNT) {
      newErrors.general = `Agent 数量不能超过 ${MAX_AGENT_COUNT} 个`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[TaskCreationForm] 开始提交表单')

    if (!validateForm()) {
      console.log('[TaskCreationForm] 表单验证失败', errors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      console.log('[TaskCreationForm] 获取用户 session...')
      // 获取当前用户session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.error('[TaskCreationForm] 用户未登录')
        setErrors({ general: '请先登录' })
        return
      }

      console.log('[TaskCreationForm] 用户已认证', {
        userId: session.user.id,
        email: session.user.email,
      })

      // 构建请求数据
      const requestData = {
        ...formData,
        title: formData.question, // 使用问题作为标题
        task_category: 'signal',
        task_type: taskType,
        target_agent_count: agentCount, // Agent 配备数
        // B端任务：强制直接付费、私密、高信誉要求
        ...(isBusiness && {
          funding_type: 'direct',
          visibility: 'private',
          result_visibility: 'private',
          min_reputation: 500,
          priority_level: 'high',
        }),
      }

      console.log('[TaskCreationForm] 准备调用 API', {
        endpoint: '/api/tasks/create',
        taskType,
        agentCount,
        rewardPool: formData.reward_pool,
        fundingType: requestData.funding_type,
        questionLength: formData.question.length,
        descriptionLength: formData.description.length,
      })

      // 调用 API 创建预言任务
      const response = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      console.log('[TaskCreationForm] API 响应状态', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('[TaskCreationForm] API 返回错误', {
          status: response.status,
          error: result.error,
          code: result.code,
        })
        throw new Error(result.error || '执行搜索未来任务失败')
      }

      console.log('[TaskCreationForm] 任务创建成功', {
        taskId: result.task_id,
        task: result.task,
      })

      // 成功：跳转到任务详情页
      console.log('[TaskCreationForm] 跳转到任务详情页', {
        url: `/searchs/${result.task_id}`,
      })
      router.push(`/searchs/${result.task_id}`)
    } catch (error) {
      console.error('[TaskCreationForm] 任务创建失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      setErrors({
        general: error instanceof Error ? error.message : '执行搜索未来任务失败，请重试',
      })
    } finally {
      setIsSubmitting(false)
      console.log('[TaskCreationForm] 表单提交流程结束')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 用户类型选择器 */}
      <div>
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
                : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
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
                : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
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

      {/* 问题/主题 */}
      <div>
        <label htmlFor="question" className="block text-sm font-medium text-gray-300 mb-2">
          预言问题 <span className="text-red-500">*</span>
        </label>
        <input
          id="question"
          type="text"
          value={formData.question}
          onChange={(e) => setFormData({ ...formData, question: e.target.value })}
          className="w-full px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors"
          placeholder="例如：特朗普会赢得2024年美国总统大选吗？"
          maxLength={500}
        />
        {errors.question && (
          <p className="mt-1 text-sm text-red-500">{errors.question}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">{formData.question.length}/500</p>
      </div>

      {/* 详细描述 */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
          详细描述 <span className="text-red-500">*</span>
        </label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full min-h-[120px] px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors resize-y"
          placeholder="提供任务的详细背景信息、相关数据来源等..."
          maxLength={5000}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-500">{errors.description}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">{formData.description.length}/5000</p>
      </div>

      {/* 兑现标准 */}
      <div>
        <label htmlFor="resolution_criteria" className="block text-sm font-medium text-gray-300 mb-2">
            兑现标准 <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="resolution_criteria"
            value={formData.resolution_criteria}
            onChange={(e) => setFormData({ ...formData, resolution_criteria: e.target.value })}
            className="w-full min-h-[100px] px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors resize-y"
            placeholder="明确说明如何判定任务结果，例如：根据官方选举结果公告..."
            maxLength={2000}
          />
          {errors.resolution_criteria && (
            <p className="mt-1 text-sm text-red-500">{errors.resolution_criteria}</p>
          )}
        <p className="mt-1 text-xs text-gray-500">{formData.resolution_criteria.length}/2000</p>
      </div>

      {/* 截止时间 */}
      <div>
        <label htmlFor="closes_at" className="block text-sm font-medium text-gray-300 mb-2">
            截止时间 <span className="text-red-500">*</span>
          </label>
          <input
            id="closes_at"
            type="date"
            value={formData.closes_at ? new Date(formData.closes_at).toISOString().split('T')[0] : ''}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              if (e.target.value) {
                // 将选择的日期设置为当天的23:59:59
                const selectedDate = new Date(e.target.value)
                selectedDate.setHours(23, 59, 59, 999)
                setFormData({ ...formData, closes_at: selectedDate.toISOString() })
              } else {
                setFormData({ ...formData, closes_at: '' })
              }
            }}
            className="w-full px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors [color-scheme:dark]"
          />
          {errors.closes_at && (
            <p className="mt-1 text-sm text-red-500">{errors.closes_at}</p>
          )}
        {formData.closes_at && (
          <p className="mt-1 text-xs text-gray-500">
            预言提交截止于：{new Date(formData.closes_at).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        )}
      </div>

      {/* Agent 配备数 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Agent 配备数 <span className="text-red-500">*</span>
        </label>
        
        {/* 基础配置说明 */}
        <div className="mb-4 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <p className="text-xs text-zinc-400">
            💡 基础配置：{BASE_AGENT_COUNT} 个 Agent = ${BASE_PRICE}
            <br />
            每增加 10 个 Agent，额外收费 ${PRICE_PER_10_AGENTS}
          </p>
        </div>

        {/* Agent 数量输入 */}
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <input
              type="number"
              min={BASE_AGENT_COUNT}
              max={MAX_AGENT_COUNT}
              step={10}
              value={agentCount}
              onChange={(e) => {
                const value = parseInt(e.target.value) || BASE_AGENT_COUNT
                const clamped = Math.max(BASE_AGENT_COUNT, Math.min(MAX_AGENT_COUNT, value))
                setAgentCount(clamped)
              }}
              className="flex-1 px-4 py-2 bg-[#0a0e27] border border-[#2a3f5f] rounded-md text-gray-100 focus:outline-none focus:border-[#00ff88] transition-colors"
            />
            <span className="text-sm text-zinc-400">个 Agent</span>
          </div>

          {/* 滑块 */}
          <input
            type="range"
            min={BASE_AGENT_COUNT}
            max={MAX_AGENT_COUNT}
            step={10}
            value={agentCount}
            onChange={(e) => setAgentCount(parseInt(e.target.value))}
            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />

          {/* 价格明细 - 展示价值 */}
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-3">
            {/* 价格计算 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">基础配置（{BASE_AGENT_COUNT} 个）</span>
                <span className="text-zinc-300">${BASE_PRICE}</span>
              </div>
              {agentCount > BASE_AGENT_COUNT && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">
                    额外 Agent（{agentCount - BASE_AGENT_COUNT} 个）
                  </span>
                  <span className="text-zinc-300">
                    +${calculatePrice(agentCount) - BASE_PRICE}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-emerald-500/20"></div>

            {/* 总价 */}
            <div className="flex justify-between text-base font-semibold">
              <span className="text-emerald-400">总价</span>
              <span className="text-emerald-400">${calculatePrice(agentCount)}</span>
            </div>

            {/* 价值展示 */}
            <div className="pt-3 border-t border-emerald-500/20">
              <p className="text-xs text-emerald-400 font-semibold mb-2">💎 您将获得：</p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong>{agentCount}份</strong> 独立AI分析报告</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong>{agentCount}条</strong> 详细推理理由（脱敏后）</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong>1份</strong> AI生成的综合洞察报告</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong>实时</strong> 概率趋势图表和数据分析</span>
                </div>
                {agentCount >= 300 && (
                  <div className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="text-blue-400 mt-0.5">★</span>
                    <span className="text-blue-300">高样本量，预测准确率提升 <strong>20%+</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* 性价比提示 */}
            {agentCount >= BASE_AGENT_COUNT * 3 && (
              <div className="pt-2 mt-2 border-t border-emerald-500/20">
                <p className="text-xs text-emerald-400">
                  🎯 高配置方案：更多样化观点，更可靠的决策依据
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            范围：{BASE_AGENT_COUNT} - {MAX_AGENT_COUNT} 个 Agent（建议以 10 的倍数调整）
          </p>
        </div>
      </div>

      {/* 资金类型（仅 C端可选，B端固定直接付费） */}
      {!isBusiness ? (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            支付方式 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            {/* 直接付费 */}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, funding_type: 'direct' })}
              className={`p-4 rounded-lg border-2 transition-all ${
                formData.funding_type === 'direct'
                  ? 'border-emerald-500 bg-emerald-500/20 ring-2 ring-emerald-500/50'
                  : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
              }`}
            >
              <div className="text-left">
                <div className={`font-semibold mb-1 ${formData.funding_type === 'direct' ? 'text-emerald-400' : 'text-white'}`}>
                  💳 自费（推荐）
                </div>
                <div className="text-xs text-zinc-400">立即支付，任务立即激活</div>
                {formData.funding_type === 'direct' && (
                  <div className="mt-2 text-xs text-emerald-400 font-semibold">✓ 已选择</div>
                )}
              </div>
            </button>

            {/* 众筹 */}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, funding_type: 'crowd' })}
              className={`p-4 rounded-lg border-2 transition-all ${
                formData.funding_type === 'crowd'
                  ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                  : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
              }`}
            >
              <div className="text-left">
                <div className={`font-semibold mb-1 ${formData.funding_type === 'crowd' ? 'text-blue-400' : 'text-white'}`}>
                  🎯 众筹
                </div>
                <div className="text-xs text-zinc-400">降低成本，社区共同参与</div>
                {formData.funding_type === 'crowd' && (
                  <div className="mt-2 text-xs text-blue-400 font-semibold">✓ 已选择</div>
                )}
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <p className="text-sm text-zinc-400">💰 企业任务仅支持自费，不支持众筹</p>
        </div>
      )}

      {/* 众筹目标（仅 C端众筹模式显示） */}
      {!isBusiness && formData.funding_type === 'crowd' && (
        <div>
          <label htmlFor="funding_goal" className="block text-sm font-medium text-gray-300 mb-2">
            众筹目标 <span className="text-red-500">*</span>
          </label>
          <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <p className="text-sm text-zinc-300 mb-2">
              众筹目标金额：<span className="text-emerald-400 font-semibold">${formData.reward_pool}</span>
            </p>
            <p className="text-xs text-zinc-500">
              根据您选择的 {agentCount} 个 Agent 自动计算
            </p>
          </div>
        </div>
      )}

      {/* 智能匹配说明 - 不再让用户手动选择专业领域 */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-sm text-blue-300 mb-2 font-semibold">🤖 智能Agent匹配</p>
        <p className="text-xs text-zinc-400">
          系统将根据您的任务内容，自动匹配最合适的专业领域Agent。
          我们的AI会分析任务描述和问题，智能推荐给具备相关画像知识的Agent。
        </p>
      </div>

      {/* B端 VIP 服务说明 */}
      {isBusiness && (
        <div className="p-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
          <p className="text-sm font-semibold text-purple-300 mb-2">🌟 企业专属 VIP 服务</p>
          <ul className="text-xs text-zinc-400 space-y-1">
            <li>✓ 优先匹配 Top 10% 高信誉 Agent</li>
            <li>✓ 12-24 小时快速响应</li>
            <li>✓ 任务和结果默认私密保护</li>
            <li>✓ 支持 NDA 签署，数据安全保障</li>
          </ul>
        </div>
      )}

      {/* 通用错误 */}
      {errors.general && (
        <Card className="p-4 bg-red-500/10 border-red-500">
          <p className="text-sm text-red-500">{errors.general}</p>
        </Card>
      )}

      {/* 提交按钮 */}
      <div className="flex gap-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-[#00ff88] text-[#0a0e27] hover:bg-[#00d4ff] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              未来搜索中...
            </>
          ) : (
            '确认'
          )}
        </Button>
        <Button
          type="button"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className="px-6 bg-[#2a3f5f] text-gray-300 hover:bg-[#3a4f6f]"
        >
          取消
        </Button>
      </div>
    </form>
  )
}
