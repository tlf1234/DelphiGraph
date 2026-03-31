// AgentOracle - Submit Calibration Answer Edge Function
// 提交校准任务答案并处理救赎逻辑

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface SubmitAnswerRequest {
  taskId: string
  answer: boolean
  rationale?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request
    const requestData: SubmitAnswerRequest = await req.json()
    const { taskId, answer, rationale } = requestData

    if (!taskId || answer === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify user is in purgatory mode
    if (profile.status !== 'restricted') {
      return new Response(
        JSON.stringify({ 
          error: 'Not in purgatory mode',
          message: '您不在炼狱模式'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get calibration task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('calibration_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return new Response(
        JSON.stringify({ error: 'Task not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate answer
    const isCorrect = answer === task.correct_answer
    const reputationBefore = parseFloat(profile.reputation_score)
    const streakBefore = profile.redemption_streak || 0

    // Calculate reputation change
    let reputationChange = 0
    let streakAfter = streakBefore

    if (isCorrect) {
      reputationChange = 2 // 正确答案 +2
      streakAfter = streakBefore + 1
    } else {
      reputationChange = -5 // 错误答案 -5
      streakAfter = 0 // 重置连胜
    }

    const reputationAfter = Math.max(0, reputationBefore + reputationChange)

    // Check redemption conditions (连胜≥5 且 信誉分≥60)
    const canRedeem = streakAfter >= 5 && reputationAfter >= 60
    let newStatus = profile.status

    if (canRedeem) {
      newStatus = 'active' // 恢复正常状态
    }

    // Update profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        reputation_score: reputationAfter,
        redemption_streak: streakAfter,
        redemption_attempts: (profile.redemption_attempts || 0) + 1,
        status: newStatus,
        purgatory_entered_at: newStatus === 'active' ? null : profile.purgatory_entered_at,
        purgatory_reason: newStatus === 'active' ? null : profile.purgatory_reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to update profile:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Record redemption attempt
    await supabaseAdmin
      .from('redemption_attempts')
      .insert({
        user_id: user.id,
        task_id: taskId,
        answer,
        rationale: rationale || '',
        is_correct: isCorrect,
        reputation_before: reputationBefore,
        reputation_after: reputationAfter,
        reputation_change: reputationChange,
        streak_before: streakBefore,
        streak_after: streakAfter,
      })

    // Record reputation history
    await supabaseAdmin
      .from('reputation_history')
      .insert({
        agent_id: user.id,
        change_amount: reputationChange,
        reason: isCorrect ? 'calibration_correct' : 'calibration_wrong',
        old_score: reputationBefore,
        new_score: reputationAfter,
        old_level: profile.reputation_level,
        new_level: profile.reputation_level,
      })

    return new Response(
      JSON.stringify({
        success: true,
        isCorrect,
        reputationChange,
        reputationBefore,
        reputationAfter,
        streakBefore,
        streakAfter,
        redeemed: canRedeem,
        newStatus,
        message: canRedeem 
          ? '🎉 恭喜！您已成功救赎，账号已恢复正常状态'
          : isCorrect
            ? `✅ 答案正确！连胜 ${streakAfter}/5，信誉分 ${reputationAfter.toFixed(0)}/60`
            : `❌ 答案错误，连胜已重置。信誉分 ${reputationAfter.toFixed(0)}/60`,
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
