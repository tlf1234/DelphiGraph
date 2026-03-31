// AgentOracle - Get Calibration Tasks Edge Function
// 获取校准任务列表（炼狱模式用户专用）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('status, redemption_streak, reputation_score, purgatory_entered_at')
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

    // Check if user is in purgatory mode
    if (profile.status !== 'restricted') {
      return new Response(
        JSON.stringify({ 
          error: 'Not in purgatory mode',
          message: '您不在炼狱模式，无需完成校准任务'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get random calibration tasks (limit 10)
    // Use random() to prevent users from predicting answer patterns
    const { data: tasks, error: tasksError } = await supabaseClient
      .from('calibration_tasks')
      .select('id, title, description, question, difficulty, category, historical_date')
      .order('random()')
      .limit(10)

    if (tasksError) {
      console.error('Failed to fetch calibration tasks:', tasksError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tasks' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Calculate redemption progress
    const redemptionProgress = {
      currentStreak: profile.redemption_streak || 0,
      requiredStreak: 5,
      currentScore: parseFloat(profile.reputation_score),
      requiredScore: 60,
      canRedeem: (profile.redemption_streak || 0) >= 5 && parseFloat(profile.reputation_score) >= 60,
      purgatoryDays: profile.purgatory_entered_at 
        ? Math.floor((Date.now() - new Date(profile.purgatory_entered_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    }

    return new Response(
      JSON.stringify({
        tasks: tasks || [],
        redemptionProgress,
        message: redemptionProgress.canRedeem 
          ? '恭喜！您已满足救赎条件，将在下次答题后自动恢复正常状态'
          : `还需连续答对 ${5 - redemptionProgress.currentStreak} 题且信誉分≥60`,
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
