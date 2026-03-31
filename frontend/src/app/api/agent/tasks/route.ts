import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    console.log('[Agent Tasks API] Request received')
    
    // Extract API key from header
    const apiKey = request.headers.get('x-api-key') || 
                   request.headers.get('authorization')?.replace('Bearer ', '')
    
    console.log('[Agent Tasks API] API key present:', !!apiKey)
    
    if (!apiKey) {
      console.log('[Agent Tasks API] Missing API key')
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      )
    }

    // Create Supabase client with service role key
    console.log('[Agent Tasks API] Creating Supabase client')
    console.log('[Agent Tasks API] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('[Agent Tasks API] SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Validate API key and get user profile
    console.log('[Agent Tasks API] Validating API key...')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, status, reputation_score, niche_tags')
      .eq('api_key_hash', apiKey)
      .single()

    if (profileError) {
      console.error('[Agent Tasks API] Profile error:', profileError)
      return NextResponse.json(
        { error: 'Invalid API key', details: profileError.message },
        { status: 401 }
      )
    }
    
    if (!profile) {
      console.log('[Agent Tasks API] Profile not found')
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    console.log('[Agent Tasks API] Profile found:', profile.id)

    // Check if user is in purgatory
    if (profile.status === 'restricted') {
      console.log('[Agent Tasks API] User is restricted')
      return NextResponse.json(
        { 
          error: 'Account restricted',
          message: 'You are in purgatory mode. Please complete calibration tasks to restore access.'
        },
        { status: 403 }
      )
    }

    // Get cached Top 10% threshold
    console.log('[Agent Tasks API] Getting top 10% threshold...')
    const { data: thresholdData } = await supabase
      .rpc('get_cached_top_10_threshold')

    const top10Threshold = thresholdData || 0
    const isTopAgent = profile.reputation_score >= top10Threshold
    console.log('[Agent Tasks API] Top 10% threshold:', top10Threshold, 'Is top agent:', isTopAgent)

    // Get smart distributed tasks
    console.log('[Agent Tasks API] Getting smart distributed tasks...')
    const { data: tasks, error: tasksError } = await supabase
      .rpc('get_smart_distributed_tasks', {
        p_agent_id: profile.id,
        p_limit: 50
      })

    if (tasksError) {
      console.error('[Agent Tasks API] Tasks error:', tasksError)
      return NextResponse.json(
        { error: 'Failed to fetch tasks', details: tasksError.message },
        { status: 500 }
      )
    }

    console.log('[Agent Tasks API] Tasks fetched:', tasks?.length || 0)

    // Return tasks in plugin-friendly format (new structured format)
    // If no tasks, return 204 No Content
    if (!tasks || tasks.length === 0) {
      console.log('[Agent Tasks API] No tasks available, returning 204')
      return new NextResponse(null, { status: 204 })
    }

    // Return full tasks array with all fields from get_smart_distributed_tasks
    console.log('[Agent Tasks API] Returning', tasks.length, 'tasks')
    return NextResponse.json({
      tasks: tasks.map((task: any) => ({
        id: task.id,
        title: task.title || '',
        question: task.question || task.title || '',
        description: task.description || '',
        reward_pool: task.reward_pool || 0,
        closes_at: task.resolution_date || task.closes_at || null,
        visibility: task.visibility || 'public',
        funding_type: task.funding_type || '',
        funding_goal: task.funding_goal || null,
        funding_current: task.funding_current || null,
        funding_progress: task.funding_progress || null,
        required_niche_tags: task.required_niche_tags || task.keywords || null,
        requires_nda: task.requires_nda || false,
        min_reputation: task.min_reputation || 0,
        match_score: task.match_score || 0,
        match_reason: task.match_reason || '',
        created_at: task.created_at || '',
      })),
      agent_reputation: profile.reputation_score,
      is_top_agent: isTopAgent,
    })

  } catch (error) {
    console.error('[Agent Tasks API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
