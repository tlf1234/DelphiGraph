import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createErrorResponse, Errors } from '../_shared/errors.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

const logger = createLogger('submit-prediction')

interface PredictionRequest {
  taskId: string
  probability: number
  rationale: string
  // 结构化信号字段（可选，向后兼容）
  evidence_type?: 'hard_fact' | 'persona_inference'
  evidence_text?: string
  relevance_score?: number
  entity_tags?: Array<{ text: string; type: string; role: string }>
  privacy_cleared?: boolean
  source_url?: string
  // UAP v2.0: 端侧脱敏后的用户画像
  user_persona?: Record<string, unknown>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received prediction submission request')
    
    // 提取API Key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!apiKey) {
      throw Errors.missingApiKey()
    }

    // 创建Supabase客户端（使用服务角色）
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 验证API Key并获取用户ID和完整档案
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, status, reputation_level, reputation_score, total_predictions, daily_prediction_count, daily_reset_at, created_at')
      .eq('api_key_hash', apiKey)
      .single()

    if (profileError || !profile) {
      logger.warn('Invalid API key attempt')
      throw Errors.invalidApiKey()
    }

    logger.info('User authenticated', { userId: profile.id, level: profile.reputation_level })

    // 检查用户状态（炼狱模式检查）
    if (profile.status === 'restricted') {
      throw Errors.accountRestricted()
    }

    // 解析请求体
    const body: PredictionRequest = await req.json()
    const { taskId, probability, rationale,
            evidence_type, evidence_text, relevance_score,
            entity_tags, privacy_cleared, source_url,
            user_persona } = body

    // 验证输入
    if (!taskId || probability === undefined || !rationale) {
      throw Errors.missingFields(['taskId', 'probability', 'rationale'])
    }

    if (probability < 0 || probability > 1) {
      throw Errors.invalidInput('概率值必须在0-1之间', { probability })
    }

    if (rationale.length > 10000) {
      throw Errors.invalidInput('rationale长度不能超过10000字符', { length: rationale.length })
    }

    // 检查市场状态和类型
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('status, reward_pool, is_calibration, requires_nda')
      .eq('id', taskId)
      .single()

    if (marketError || !market) {
      throw Errors.marketNotFound()
    }

    if (market.status !== 'active') {
      throw Errors.marketClosed()
    }

    // 检查NDA要求
    if (market.requires_nda) {
      const { data: ndaAgreement, error: ndaError } = await supabase
        .from('nda_agreements')
        .select('id')
        .eq('task_id', taskId)
        .eq('agent_id', profile.id)
        .single()

      if (ndaError || !ndaAgreement) {
        throw Errors.ndaRequired()
      }
    }

    // 炼狱模式用户只能参与校准任务
    if (profile.status === 'restricted' && !market.is_calibration) {
      throw Errors.accountRestricted()
    }

    // 检查每日预测限制
    const now = new Date()
    const lastReset = profile.daily_reset_at ? new Date(profile.daily_reset_at) : new Date(0)
    const isSameDay = now.toDateString() === lastReset.toDateString()

    let dailyCount = profile.daily_prediction_count || 0

    if (!isSameDay) {
      // Reset count for new day
      dailyCount = 0
      await supabase
        .from('profiles')
        .update({
          daily_prediction_count: 0,
          daily_reset_at: now.toISOString(),
        })
        .eq('id', profile.id)
    }

    // Get daily limit based on reputation level
    const { data: levelConfig } = await supabase
      .from('reputation_levels')
      .select('daily_prediction_limit, max_market_value')
      .eq('level_key', profile.reputation_level)
      .single()

    const dailyLimit = levelConfig?.daily_prediction_limit ?? 5
    const maxMarketValue = levelConfig?.max_market_value ?? 100

    // Check daily limit (-1 means unlimited)
    if (dailyLimit !== -1 && dailyCount >= dailyLimit) {
      throw Errors.dailyLimit({
        dailyLimit,
        dailyCount,
        resetAt: new Date(now.setHours(24, 0, 0, 0)).toISOString()
      })
    }

    // Check market value limit (-1 means unlimited)
    if (maxMarketValue !== -1 && market.reward_pool > maxMarketValue) {
      throw Errors.insufficientLevel({
        currentLevel: profile.reputation_level,
        maxMarketValue,
        marketValue: market.reward_pool
      })
    }

    // 新账号观察期限制（7天内只能参与低价值市场）
    const accountAge = (now.getTime() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
    if (accountAge < 7 && market.reward_pool > 100) {
      throw Errors.observationPeriod(accountAge, market.reward_pool)
    }

    // 练习期标记（前10次预测）
    const isPractice = (profile.total_predictions || 0) < 10

    // 验证 relevance_score 范围
    if (relevance_score !== undefined && (relevance_score < 0 || relevance_score > 1)) {
      throw Errors.invalidInput('relevance_score 必须在 0-1 之间', { relevance_score })
    }

    // 插入预测（含结构化信号字段）
    const insertData: Record<string, unknown> = {
      task_id: taskId,
      user_id: profile.id,
      probability,
      rationale,
    }
    // 结构化信号字段（仅在提供时写入，向后兼容）
    if (evidence_type) insertData.evidence_type = evidence_type
    if (evidence_text) insertData.evidence_text = evidence_text
    if (relevance_score !== undefined) insertData.relevance_score = relevance_score
    if (entity_tags) insertData.entity_tags = entity_tags
    if (privacy_cleared !== undefined) insertData.privacy_cleared = privacy_cleared
    if (source_url) insertData.source_url = source_url
    if (user_persona && typeof user_persona === 'object') insertData.user_persona = user_persona

    const { data: prediction, error: insertError } = await supabase
      .from('predictions')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      logger.error('Failed to insert prediction', insertError)
      throw Errors.databaseError(insertError.message)
    }

    // 更新每日预测计数
    await supabase
      .from('profiles')
      .update({
        daily_prediction_count: dailyCount + 1,
      })
      .eq('id', profile.id)

    logger.info('Prediction submitted successfully', { 
      predictionId: prediction.id, 
      userId: profile.id,
      taskId 
    })

    return new Response(
      JSON.stringify({
        success: true,
        predictionId: prediction.id,
        timestamp: prediction.submitted_at,
        isPractice,
        dailyCount: dailyCount + 1,
        dailyLimit,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
