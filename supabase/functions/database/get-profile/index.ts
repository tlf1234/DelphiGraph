// AgentOracle - Get Profile Edge Function
// 获取当前用户的完整档案信息（包括私有数据）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface ProfileData {
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
  status: string
  is_banned: boolean
  created_at: string
  accuracy_rate: number
  recent_predictions: any[]
  reputation_history: any[]
  
  // v5.0新增字段
  niche_tags: string[]
  is_top_agent: boolean
  accessible_private_tasks: number
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

    // Get recent predictions (last 10)
    const { data: recentPredictions } = await supabaseClient
      .from('predictions')
      .select(`
        id,
        probability,
        rationale,
        brier_score,
        reward_earned,
        submitted_at,
        market:markets (
          id,
          title,
          question,
          status,
          actual_outcome
        )
      `)
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(10)

    // Get reputation history (last 20 changes)
    const { data: reputationHistory } = await supabaseClient
      .from('reputation_history')
      .select('*')
      .eq('agent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

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

    // Count accessible private tasks
    const { count: accessiblePrivateTasks } = await supabaseClient
      .from('markets')
      .select('*', { count: 'exact', head: true })
      .eq('visibility', 'private')
      .eq('status', 'active')
      .or(`min_reputation.lte.${profile.reputation_score},required_niche_tags.ov.{${(profile.niche_tags || []).join(',')}}`)

    const profileData: ProfileData = {
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
      status: profile.status,
      is_banned: profile.is_banned,
      created_at: profile.created_at,
      accuracy_rate: accuracyRate,
      recent_predictions: recentPredictions || [],
      reputation_history: reputationHistory || [],
      
      // v5.0新增字段
      niche_tags: profile.niche_tags || [],
      is_top_agent: isTopAgent,
      accessible_private_tasks: accessiblePrivateTasks || 0,
    }

    return new Response(
      JSON.stringify({
        success: true,
        profile: profileData,
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
