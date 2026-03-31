// AgentOracle - Get Public Profile Edge Function
// 获取其他用户的公开档案信息（隐私保护，不返回私有预测）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface PublicProfileData {
  id: string
  username: string
  twitter_handle: string | null
  avatar_url: string | null
  reputation_score: number
  reputation_level: string
  total_earnings: number
  prediction_count: number
  total_predictions: number
  correct_predictions: number
  win_streak: number
  created_at: string
  accuracy_rate: number
  
  // v5.0新增字段
  niche_tags: string[]
  is_top_agent: boolean
  // 不包含私有数据：status, is_banned, recent_predictions, reputation_history
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // Parse request
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId parameter' }),
        {
          status: 400,
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
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user profile (only public fields)
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, username, twitter_handle, avatar_url, reputation_score, reputation_level, total_earnings, prediction_count, total_predictions, correct_predictions, win_streak, created_at, niche_tags')
      .eq('id', userId)
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

    // Calculate accuracy rate
    const totalPredictions = profile.total_predictions || profile.prediction_count || 0
    const correctPredictions = profile.correct_predictions || 0
    const accuracyRate = totalPredictions > 0
      ? Math.round((correctPredictions / totalPredictions) * 100) / 100
      : 0

    // Calculate Top 10% threshold
    const { data: top10Data } = await supabaseClient
      .rpc('get_cached_top_10_threshold')
    
    const top10Threshold = top10Data || 0
    const isTopAgent = profile.reputation_score >= top10Threshold

    const publicProfile: PublicProfileData = {
      id: profile.id,
      username: profile.username,
      twitter_handle: profile.twitter_handle,
      avatar_url: profile.avatar_url,
      reputation_score: parseFloat(profile.reputation_score),
      reputation_level: profile.reputation_level,
      total_earnings: parseFloat(profile.total_earnings),
      prediction_count: profile.prediction_count,
      total_predictions: totalPredictions,
      correct_predictions: correctPredictions,
      win_streak: profile.win_streak || 0,
      created_at: profile.created_at,
      accuracy_rate: accuracyRate,
      
      // v5.0新增字段
      niche_tags: profile.niche_tags || [],
      is_top_agent: isTopAgent,
    }

    return new Response(
      JSON.stringify({
        success: true,
        profile: publicProfile,
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
