import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createErrorResponse, Errors } from '../_shared/errors.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

const logger = createLogger('contribute-crowdfunding')

interface ContributeCrowdfundingRequest {
  taskId: string
  amount: number
  paymentMethod: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received crowdfunding contribution request')
    
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

    // 验证API Key并获取用户ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('api_key_hash', apiKey)
      .single()

    if (profileError || !profile) {
      logger.warn('Invalid API key attempt')
      throw Errors.invalidApiKey()
    }

    logger.info('User authenticated', { userId: profile.id })

    // 解析请求体
    const body: ContributeCrowdfundingRequest = await req.json()
    const { taskId, amount, paymentMethod } = body

    // 验证输入
    if (!taskId || !amount || !paymentMethod) {
      throw Errors.missingFields(['taskId', 'amount', 'paymentMethod'])
    }

    if (amount < 1) {
      throw Errors.invalidInput('贡献金额必须至少为$1', { amount })
    }

    // 检查市场是否存在且是众筹模式
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, funding_type, funding_goal, funding_current, status')
      .eq('id', taskId)
      .single()

    if (marketError || !market) {
      throw Errors.marketNotFound()
    }

    if (market.funding_type !== 'crowd') {
      throw Errors.invalidInput('此任务不是众筹模式')
    }

    if (market.status === 'active') {
      throw Errors.invalidInput('此任务已激活，无需继续众筹')
    }

    // TODO: 实际的支付处理逻辑
    // 这里应该集成支付网关（如Stripe, PayPal等）
    // 目前简化处理，假设支付成功
    const paymentStatus = 'completed'
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 插入众筹贡献记录
    const { data: contribution, error: insertError } = await supabase
      .from('crowdfunding_contributions')
      .insert({
        task_id: taskId,
        contributor_id: profile.id,
        amount: amount,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        transaction_id: transactionId,
      })
      .select()
      .single()

    if (insertError) {
      logger.error('Failed to insert contribution', insertError)
      throw Errors.databaseError(insertError.message)
    }

    // 更新市场的funding_current
    const newFundingCurrent = (market.funding_current || 0) + amount
    const { error: updateError } = await supabase
      .from('markets')
      .update({ funding_current: newFundingCurrent })
      .eq('id', taskId)

    if (updateError) {
      logger.error('Failed to update market funding', updateError)
      throw Errors.databaseError(updateError.message)
    }

    // 检查是否达到目标
    const isGoalReached = newFundingCurrent >= market.funding_goal
    const fundingProgress = newFundingCurrent / market.funding_goal

    // 如果达到目标，激活任务
    if (isGoalReached && market.status === 'pending') {
      const { error: activateError } = await supabase
        .from('markets')
        .update({ status: 'active' })
        .eq('id', taskId)

      if (activateError) {
        logger.error('Failed to activate market', activateError)
      } else {
        logger.info('Market activated after reaching funding goal', { taskId })
      }
    }

    logger.info('Crowdfunding contribution successful', { 
      contributionId: contribution.id, 
      userId: profile.id,
      taskId,
      amount,
      isGoalReached
    })

    return new Response(
      JSON.stringify({
        success: true,
        contributionId: contribution.id,
        newFundingCurrent: newFundingCurrent,
        fundingProgress: fundingProgress,
        isGoalReached: isGoalReached,
        message: isGoalReached ? '众筹目标已达成，任务已激活！' : '贡献成功',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
