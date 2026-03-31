// AgentOracle - 管理员市场结算功能（MVP简化版）
// 实现简单的二元判断和平分奖金池逻辑
// 
// 注意：此文件在本地TypeScript检查时会显示错误，这是正常的。
// 这些代码在Supabase Deno运行时环境中会正常工作。

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createErrorResponse, Errors } from '../_shared/errors.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

const logger = createLogger('admin-resolve-market')

interface ResolveMarketRequest {
  taskId: string
  outcome: boolean  // true = Yes, false = No
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received market resolution request')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 验证用户身份
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw Errors.missingAuth()
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      logger.warn('Unauthorized access attempt')
      throw Errors.unauthorized()
    }

    // 验证管理员权限
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      logger.warn('Non-admin user attempted market resolution', { userId: user.id })
      throw Errors.forbidden('Admin access required')
    }

    // 解析请求体
    const { taskId, outcome }: ResolveMarketRequest = await req.json()

    if (!taskId || outcome === undefined) {
      throw Errors.missingFields(['taskId', 'outcome'])
    }

    logger.info('Resolving market', { taskId, outcome, adminId: user.id })

    // 获取市场信息
    const { data: market, error: marketError } = await supabaseClient
      .from('markets')
      .select('*')
      .eq('id', taskId)
      .single()

    if (marketError || !market) {
      throw Errors.marketNotFound()
    }

    if (market.status === 'resolved') {
      throw Errors.alreadyResolved()
    }

    // 获取所有预测
    const { data: predictions, error: predictionsError } = await supabaseClient
      .from('predictions')
      .select('*')
      .eq('task_id', taskId)

    if (predictionsError) {
      logger.error('Failed to fetch predictions', predictionsError)
      throw Errors.databaseError(predictionsError.message)
    }

    // 简单匹配逻辑：判断预测是否正确
    const correctPredictions = predictions.filter(p => {
      // 将概率转换为布尔值：>= 0.5 视为预测Yes，< 0.5视为预测No
      const predictedOutcome = p.probability >= 0.5
      return predictedOutcome === outcome
    })

    const incorrectPredictions = predictions.filter(p => {
      const predictedOutcome = p.probability >= 0.5
      return predictedOutcome !== outcome
    })

    // 计算每个获胜者的奖励（平分奖金池）
    const rewardPerWinner = correctPredictions.length > 0 
      ? market.reward_pool / correctPredictions.length 
      : 0

    logger.info('Calculated rewards', {
      totalPredictions: predictions.length,
      correctCount: correctPredictions.length,
      rewardPerWinner
    })

    // 更新用户信誉分和收益
    const updates = []
    
    for (const prediction of correctPredictions) {
      updates.push(
        supabaseClient.rpc('update_user_reputation_and_earnings', {
          p_user_id: prediction.user_id,
          p_reputation_change: 10,
          p_earnings_change: rewardPerWinner
        })
      )
    }

    for (const prediction of incorrectPredictions) {
      updates.push(
        supabaseClient.rpc('update_user_reputation_and_earnings', {
          p_user_id: prediction.user_id,
          p_reputation_change: -20,
          p_earnings_change: 0
        })
      )
    }

    await Promise.all(updates)

    // 更新市场状态为已解决
    const { error: updateError } = await supabaseClient
      .from('markets')
      .update({
        status: 'resolved',
        actual_outcome: outcome ? 1 : 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)

    if (updateError) {
      logger.error('Failed to update market status', updateError)
      throw Errors.databaseError(updateError.message)
    }

    // 记录审计日志
    await supabaseClient.rpc('log_audit', {
      p_user_id: user.id,
      p_action: 'resolve',
      p_entity_type: 'market',
      p_entity_id: taskId,
      p_old_data: { status: market.status },
      p_new_data: { status: 'resolved', outcome },
      p_metadata: {
        admin_id: user.id,
        correct_predictions: correctPredictions.length,
        incorrect_predictions: incorrectPredictions.length,
        reward_per_winner: rewardPerWinner,
      },
    })

    logger.info('Market resolved successfully', { taskId, outcome })

    // 返回结算结果
    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        outcome,
        totalPredictions: predictions.length,
        correctPredictions: correctPredictions.length,
        incorrectPredictions: incorrectPredictions.length,
        rewardPerWinner,
        totalRewardsDistributed: rewardPerWinner * correctPredictions.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
