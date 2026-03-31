// AgentOracle - Update Reputation Edge Function
// 更新用户信誉分，计算等级变化,检查封禁条件

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface UpdateReputationRequest {
  userId: string
  predictionId: string
  isCorrect: boolean
  confidence: number // 预测概率（0-1）
  marketDifficulty?: 'easy' | 'medium' | 'hard'
  marketParticipants?: number
}

interface ReputationLevel {
  level_key: string
  level_name: string
  min_score: number
  max_score: number
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key for admin operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Parse request
    const requestData: UpdateReputationRequest = await req.json()
    const { userId, predictionId, isCorrect, confidence, marketDifficulty, marketParticipants } = requestData

    // Validate input
    if (!userId || !predictionId || confidence === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Calculate reputation change
    let reputationChange = 0
    let reason = ''

    // Base score
    if (isCorrect) {
      reputationChange = 10 // 基础奖励
      reason = 'prediction_correct'
    } else {
      reputationChange = -20 // 基础惩罚（2倍）
      reason = 'prediction_wrong'
    }

    // Confidence bonus/penalty (高信心度加成/惩罚)
    if (confidence > 0.8) {
      if (isCorrect) {
        reputationChange += 5 // 高信心正确额外奖励
        reason = 'prediction_correct_high_confidence'
      } else {
        reputationChange -= 10 // 高信心错误额外惩罚
        reason = 'prediction_wrong_high_confidence'
      }
    }

    // Market difficulty multiplier (市场难度系数)
    let difficultyMultiplier = 1.0
    if (marketParticipants !== undefined) {
      if (marketParticipants < 100) {
        difficultyMultiplier = 2.0
      } else if (marketParticipants <= 1000) {
        difficultyMultiplier = 1.5
      } else {
        difficultyMultiplier = 1.0
      }
    } else if (marketDifficulty) {
      switch (marketDifficulty) {
        case 'hard':
          difficultyMultiplier = 2.0
          break
        case 'medium':
          difficultyMultiplier = 1.5
          break
        case 'easy':
          difficultyMultiplier = 1.0
          break
      }
    }

    reputationChange = Math.round(reputationChange * difficultyMultiplier)

    // Win streak bonus (连胜奖励)
    let winStreak = profile.win_streak || 0
    if (isCorrect) {
      winStreak += 1
      
      // Streak bonuses
      if (winStreak === 3) {
        reputationChange += 5
        reason = 'prediction_correct_streak_3'
      } else if (winStreak === 5) {
        reputationChange += 10
        reason = 'prediction_correct_streak_5'
      } else if (winStreak === 10) {
        reputationChange += 20
        reason = 'prediction_correct_streak_10'
      }
    } else {
      winStreak = 0 // Reset streak on wrong prediction
    }

    // Calculate new reputation score
    const oldScore = parseFloat(profile.reputation_score)
    const newScore = Math.max(0, oldScore + reputationChange) // 不能低于0

    // Get reputation levels
    const { data: levels } = await supabaseClient
      .from('reputation_levels')
      .select('*')
      .order('min_score', { ascending: true })

    // Determine old and new level
    const oldLevel = profile.reputation_level
    let newLevel = oldLevel

    if (levels) {
      for (const level of levels) {
        if (newScore >= level.min_score && newScore <= level.max_score) {
          newLevel = level.level_key
          break
        }
      }
    }

    // Check if user should enter purgatory (炼狱模式)
    let newStatus = profile.status
    let purgatoryEnteredAt = profile.purgatory_entered_at
    let purgatoryReason = profile.purgatory_reason

    if (newScore < 60 && profile.status === 'active') {
      newStatus = 'restricted'
      purgatoryEnteredAt = new Date().toISOString()
      purgatoryReason = '信誉分低于60分'
    }

    // Update correct/total predictions count
    const totalPredictions = (profile.total_predictions || 0) + 1
    const correctPredictions = (profile.correct_predictions || 0) + (isCorrect ? 1 : 0)

    // Update profile
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({
        reputation_score: newScore,
        reputation_level: newLevel,
        win_streak: winStreak,
        status: newStatus,
        purgatory_entered_at: purgatoryEnteredAt,
        purgatory_reason: purgatoryReason,
        total_predictions: totalPredictions,
        correct_predictions: correctPredictions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to update profile:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update reputation' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Record reputation history
    await supabaseClient
      .from('reputation_history')
      .insert({
        agent_id: userId,
        change_amount: reputationChange,
        reason: reason,
        prediction_id: predictionId,
        old_score: oldScore,
        new_score: newScore,
        old_level: oldLevel,
        new_level: newLevel,
      })

    return new Response(
      JSON.stringify({
        success: true,
        oldScore: oldScore,
        newScore: newScore,
        change: reputationChange,
        oldLevel: oldLevel,
        newLevel: newLevel,
        winStreak: winStreak,
        status: newStatus,
        enteredPurgatory: newStatus === 'restricted' && profile.status === 'active',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
