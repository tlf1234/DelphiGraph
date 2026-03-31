// AgentOracle - Check Daily Limit Edge Function
// 检查用户每日预测次数限制

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
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
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

    // Check if we need to reset daily count (new day)
    const now = new Date()
    const lastReset = profile.daily_reset_at ? new Date(profile.daily_reset_at) : new Date(0)
    const isSameDay = now.toDateString() === lastReset.toDateString()

    let dailyCount = profile.daily_prediction_count || 0
    let resetAt = profile.daily_reset_at

    if (!isSameDay) {
      // Reset count for new day
      dailyCount = 0
      resetAt = now.toISOString()

      // Update profile with reset values
      await supabaseClient
        .from('profiles')
        .update({
          daily_prediction_count: 0,
          daily_reset_at: resetAt,
        })
        .eq('id', user.id)
    }

    // Get daily limit based on reputation level
    const { data: levelConfig } = await supabaseClient
      .from('reputation_levels')
      .select('daily_prediction_limit')
      .eq('level_key', profile.reputation_level)
      .single()

    const dailyLimit = levelConfig?.daily_prediction_limit ?? 5
    const isUnlimited = dailyLimit === -1
    const canPredict = isUnlimited || dailyCount < dailyLimit
    const remainingPredictions = isUnlimited ? -1 : Math.max(0, dailyLimit - dailyCount)

    // Calculate next reset time (midnight)
    const nextReset = new Date(now)
    nextReset.setHours(24, 0, 0, 0)

    return new Response(
      JSON.stringify({
        success: true,
        canPredict,
        dailyLimit,
        dailyCount,
        remainingPredictions,
        resetAt: nextReset.toISOString(),
        isUnlimited,
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
