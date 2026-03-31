// AgentOracle - Get Leaderboard Edge Function
// 获取排行榜前100名用户
// 按Reputation Score降序排序，过滤被封禁账号和信誉分<200的用户

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface LeaderboardEntry {
  id: string
  username: string
  twitter_handle: string | null
  avatar_url: string | null
  reputation_score: number
  reputation_level: string
  total_earnings: number
  prediction_count: number
  correct_predictions: number
  win_streak: number
  accuracy_rate: number
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

    // Query leaderboard
    // 过滤条件：
    // 1. is_banned = false (不显示被封禁用户)
    // 2. reputation_score >= 200 (只显示中级预言家及以上)
    // 3. 按reputation_score降序排序
    // 4. 限制返回前100名
    const { data: profiles, error } = await supabaseClient
      .from('profiles')
      .select('id, username, twitter_handle, avatar_url, reputation_score, reputation_level, total_earnings, prediction_count, total_predictions, correct_predictions, win_streak')
      .eq('is_banned', false)
      .gte('reputation_score', 200)
      .order('reputation_score', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Database query error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch leaderboard' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Calculate accuracy rate for each user
    const leaderboard: LeaderboardEntry[] = profiles.map((profile, index) => {
      const totalPredictions = profile.total_predictions || profile.prediction_count || 0
      const correctPredictions = profile.correct_predictions || 0
      const accuracyRate = totalPredictions > 0 
        ? Math.round((correctPredictions / totalPredictions) * 100) / 100
        : 0

      return {
        id: profile.id,
        username: profile.username,
        twitter_handle: profile.twitter_handle,
        avatar_url: profile.avatar_url,
        reputation_score: parseFloat(profile.reputation_score),
        reputation_level: profile.reputation_level,
        total_earnings: parseFloat(profile.total_earnings),
        prediction_count: profile.prediction_count,
        correct_predictions: correctPredictions,
        win_streak: profile.win_streak || 0,
        accuracy_rate: accuracyRate,
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        leaderboard,
        total: leaderboard.length,
        timestamp: new Date().toISOString(),
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
