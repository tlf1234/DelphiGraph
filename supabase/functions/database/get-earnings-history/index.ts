// AgentOracle - 收益历史查询功能
// 返回用户在每个市场的收益明细
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

const logger = createLogger('get-earnings-history')

interface EarningsRecord {
  task_id: string
  market_title: string
  market_question: string
  prediction_probability: number
  prediction_rationale: string
  predicted_at: string
  market_outcome: boolean | null
  was_correct: boolean | null
  earnings: number
  reputation_change: number
  settled_at: string | null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received earnings history request')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
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

    logger.info('Fetching earnings history', { userId: user.id })

    // 获取用户的所有预测
    const { data: predictions, error: predictionsError } = await supabaseClient
      .from('predictions')
      .select(`
        id,
        task_id,
        probability,
        rationale,
        created_at,
        markets (
          id,
          title,
          question,
          status,
          actual_outcome,
          reward_pool,
          updated_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (predictionsError) {
      logger.error('Failed to fetch predictions', predictionsError)
      throw Errors.databaseError(predictionsError.message)
    }

    if (!predictions || predictions.length === 0) {
      logger.info('No predictions found for user', { userId: user.id })
      return new Response(
        JSON.stringify({
          earnings: [],
          summary: {
            total_earnings: 0,
            total_markets: 0,
            resolved_markets: 0,
            correct_predictions: 0,
            incorrect_predictions: 0,
            pending_markets: 0
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 处理每个预测的收益信息
    const earningsHistory: EarningsRecord[] = []
    let totalEarnings = 0
    let correctCount = 0
    let incorrectCount = 0
    let resolvedCount = 0
    let pendingCount = 0

    for (const prediction of predictions) {
      const market = prediction.markets

      if (!market) continue

      const isResolved = market.status === 'resolved'
      const marketOutcome = market.actual_outcome !== null ? market.actual_outcome === 1 : null
      
      let wasCorrect: boolean | null = null
      let earnings = 0
      let reputationChange = 0

      if (isResolved && marketOutcome !== null) {
        resolvedCount++
        
        // 判断预测是否正确
        const predictedOutcome = prediction.probability >= 0.5
        wasCorrect = predictedOutcome === marketOutcome

        if (wasCorrect) {
          correctCount++
          reputationChange = 10
          
          // 计算收益：需要查询该市场的所有正确预测数量
          const { data: correctPredictions, error: countError } = await supabaseClient
            .from('predictions')
            .select('id', { count: 'exact', head: true })
            .eq('task_id', market.id)
            .gte('probability', marketOutcome ? 0.5 : 0)
            .lt('probability', marketOutcome ? 1.01 : 0.5)

          if (!countError && correctPredictions) {
            const correctCount = correctPredictions.length || 1
            earnings = market.reward_pool / correctCount
            totalEarnings += earnings
          }
        } else {
          incorrectCount++
          reputationChange = -20
          earnings = 0
        }
      } else {
        pendingCount++
      }

      earningsHistory.push({
        task_id: market.id,
        market_title: market.title,
        market_question: market.question,
        prediction_probability: prediction.probability,
        prediction_rationale: prediction.rationale || '',
        predicted_at: prediction.created_at,
        market_outcome: marketOutcome,
        was_correct: wasCorrect,
        earnings,
        reputation_change: reputationChange,
        settled_at: isResolved ? market.updated_at : null
      })
    }

    logger.info('Earnings history calculated', {
      userId: user.id,
      totalMarkets: predictions.length,
      totalEarnings
    })

    // 返回收益历史和汇总信息
    return new Response(
      JSON.stringify({
        earnings: earningsHistory,
        summary: {
          total_earnings: totalEarnings,
          total_markets: predictions.length,
          resolved_markets: resolvedCount,
          correct_predictions: correctCount,
          incorrect_predictions: incorrectCount,
          pending_markets: pendingCount,
          accuracy_rate: resolvedCount > 0 ? (correctCount / resolvedCount * 100).toFixed(2) : 0
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
