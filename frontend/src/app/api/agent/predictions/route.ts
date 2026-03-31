import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * 新格式 payload（插件标准格式）
 * API key 通过 x-api-key header 传递
 */
interface NewPredictionPayload {
  taskId: string
  probability: number
  rationale: string
  evidence_type?: 'hard_fact' | 'persona_inference'
  evidence_text?: string
  relevance_score?: number
  entity_tags?: Array<{ text: string; type: string; role: string }>
  privacy_cleared?: boolean
  source_url?: string
  user_persona?: Record<string, unknown>
}

/**
 * 旧格式 payload（向后兼容）
 * API key 在 body 中
 */
interface LegacyPredictionPayload {
  task_id: string
  api_key: string
  prediction_data: {
    prediction: string
    confidence: number
    reasoning: string
  }
  telemetry_data?: {
    memory_entropy: any
    interaction_heartbeat: number
    inference_latency_ms: number
  }
  evidence_type?: 'hard_fact' | 'persona_inference'
  evidence_text?: string
  relevance_score?: number
  entity_tags?: Array<{ text: string; type: string; role: string }>
  privacy_cleared?: boolean
  source_url?: string
  user_persona?: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()

    // Detect format: new format has 'taskId', legacy has 'task_id' + 'prediction_data'
    const isNewFormat = 'taskId' in body && 'probability' in body

    // Extract API key: prefer x-api-key header, fallback to body (legacy)
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '') ||
                   body.api_key

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key. Use x-api-key header.' },
        { status: 401 }
      )
    }

    // Normalize payload to unified internal format
    let taskId: string
    let probability: number
    let rationale: string
    let evidence_type: string | undefined
    let evidence_text: string | undefined
    let relevance_score: number | undefined
    let entity_tags: Array<{ text: string; type: string; role: string }> | undefined
    let privacy_cleared: boolean | undefined
    let source_url: string | undefined
    let user_persona: Record<string, unknown> | undefined

    if (isNewFormat) {
      // New format: taskId, probability, rationale
      const payload = body as NewPredictionPayload
      taskId = payload.taskId
      probability = payload.probability
      rationale = payload.rationale
      evidence_type = payload.evidence_type
      evidence_text = payload.evidence_text
      relevance_score = payload.relevance_score
      entity_tags = payload.entity_tags
      privacy_cleared = payload.privacy_cleared
      source_url = payload.source_url
      user_persona = payload.user_persona

      if (!taskId || probability === undefined || !rationale) {
        return NextResponse.json(
          { error: 'Validation failed', details: { missing_fields: ['taskId', 'probability', 'rationale'] } },
          { status: 400 }
        )
      }
    } else {
      // Legacy format: task_id, prediction_data
      const payload = body as LegacyPredictionPayload
      if (!payload.task_id || !payload.prediction_data) {
        return NextResponse.json(
          { error: 'Validation failed', details: { missing_fields: ['task_id', 'prediction_data'] } },
          { status: 400 }
        )
      }
      taskId = payload.task_id
      probability = payload.prediction_data.confidence
      rationale = `${payload.prediction_data.prediction}\n\nReasoning: ${payload.prediction_data.reasoning}`
      evidence_type = payload.evidence_type
      evidence_text = payload.evidence_text
      relevance_score = payload.relevance_score
      entity_tags = payload.entity_tags
      privacy_cleared = payload.privacy_cleared
      source_url = payload.source_url
      user_persona = payload.user_persona
    }

    // Validate probability range
    if (probability < 0 || probability > 1) {
      return NextResponse.json(
        { error: 'Validation failed', details: { probability: 'Must be between 0 and 1' } },
        { status: 400 }
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
      .select('id, status, reputation_level, reputation_score, total_predictions, daily_prediction_count, daily_reset_at, created_at')
      .eq('api_key_hash', apiKey)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // Check if user is in purgatory
    if (profile.status === 'restricted') {
      return NextResponse.json(
        { error: 'Account restricted' },
        { status: 403 }
      )
    }

    // Check market status
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('status, reward_pool, is_calibration, requires_nda')
      .eq('id', taskId)
      .single()

    if (marketError || !market) {
      return NextResponse.json(
        { error: 'Market not found' },
        { status: 404 }
      )
    }

    if (market.status !== 'active') {
      return NextResponse.json(
        { error: 'Market is not active' },
        { status: 400 }
      )
    }

    // Check NDA requirement
    if (market.requires_nda) {
      const { data: ndaAgreement } = await supabase
        .from('nda_agreements')
        .select('id')
        .eq('task_id', taskId)
        .eq('agent_id', profile.id)
        .single()

      if (!ndaAgreement) {
        return NextResponse.json(
          { error: 'NDA signature required' },
          { status: 403 }
        )
      }
    }

    // Check daily prediction limit
    const now = new Date()
    const lastReset = profile.daily_reset_at ? new Date(profile.daily_reset_at) : new Date(0)
    const isSameDay = now.toDateString() === lastReset.toDateString()

    let dailyCount = profile.daily_prediction_count || 0

    if (!isSameDay) {
      dailyCount = 0
      await supabase
        .from('profiles')
        .update({
          daily_prediction_count: 0,
          daily_reset_at: now.toISOString(),
        })
        .eq('id', profile.id)
    }

    // Get daily limit based on reputation level
    const { data: levelConfig } = await supabase
      .from('reputation_levels')
      .select('daily_prediction_limit, max_market_value')
      .eq('level_key', profile.reputation_level)
      .single()

    const dailyLimit = levelConfig?.daily_prediction_limit ?? 5
    const maxMarketValue = levelConfig?.max_market_value ?? 100

    // Check daily limit
    if (dailyLimit !== -1 && dailyCount >= dailyLimit) {
      return NextResponse.json(
        { 
          error: 'Daily prediction limit reached',
          details: {
            dailyLimit,
            dailyCount,
            resetAt: new Date(now.setHours(24, 0, 0, 0)).toISOString()
          }
        },
        { status: 429 }
      )
    }

    // Check market value limit
    if (maxMarketValue !== -1 && market.reward_pool > maxMarketValue) {
      return NextResponse.json(
        { 
          error: 'Insufficient reputation level for this market',
          details: {
            currentLevel: profile.reputation_level,
            maxMarketValue,
            marketValue: market.reward_pool
          }
        },
        { status: 403 }
      )
    }

    // Build insert data with optional structured signal fields
    const insertData: Record<string, unknown> = {
      task_id: taskId,
      user_id: profile.id,
      probability,
      rationale,
    }
    if (evidence_type) insertData.evidence_type = evidence_type
    if (evidence_text) insertData.evidence_text = evidence_text
    if (relevance_score !== undefined) insertData.relevance_score = relevance_score
    if (entity_tags) insertData.entity_tags = entity_tags
    if (privacy_cleared !== undefined) insertData.privacy_cleared = privacy_cleared
    if (source_url) insertData.source_url = source_url
    if (user_persona && typeof user_persona === 'object') insertData.user_persona = user_persona

    // Insert prediction
    const { data: prediction, error: insertError } = await supabase
      .from('predictions')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Failed to insert prediction:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit prediction' },
        { status: 500 }
      )
    }

    // Update daily prediction count
    await supabase
      .from('profiles')
      .update({
        daily_prediction_count: dailyCount + 1,
      })
      .eq('id', profile.id)

    // Return success response
    return NextResponse.json({
      success: true,
      predictionId: prediction.id,
      timestamp: prediction.submitted_at,
      dailyCount: dailyCount + 1,
      dailyLimit,
      message: 'Submission successful, metadata health verified'
    })

  } catch (error) {
    console.error('Agent predictions API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
