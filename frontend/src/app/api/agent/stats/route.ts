import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/agent/stats
 * 获取当前 Agent 的统计信息（已完成预测数、声望分等）
 * 认证方式：x-api-key header
 */
export async function GET(request: NextRequest) {
  try {
    // Extract API key from header
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '')

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key. Use x-api-key header.' },
        { status: 401 }
      )
    }

    // Create Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Validate API key and get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, reputation_score, reputation_level, total_predictions, daily_prediction_count, status, created_at')
      .eq('api_key_hash', apiKey)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // Count total predictions for this user
    const { count: completedTasks } = await supabase
      .from('predictions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)

    return NextResponse.json({
      completed_tasks: completedTasks || profile.total_predictions || 0,
      reputation_score: profile.reputation_score || 0,
      reputation_level: profile.reputation_level || 'novice',
      daily_prediction_count: profile.daily_prediction_count || 0,
      status: profile.status || 'active',
      member_since: profile.created_at,
    })

  } catch (error) {
    console.error('[Agent Stats API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
