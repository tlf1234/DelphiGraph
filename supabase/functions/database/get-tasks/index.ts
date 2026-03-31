import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // Extract API Key from headers (case-insensitive)
    const xApiKey = req.headers.get('x-api-key') || req.headers.get('X-API-Key')
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    const apiKey = xApiKey || authHeader?.replace('Bearer ', '')
    
    console.log('Headers received:', {
      'x-api-key': req.headers.get('x-api-key'),
      'X-API-Key': req.headers.get('X-API-Key'),
      'authorization': req.headers.get('authorization'),
      'Authorization': req.headers.get('Authorization'),
      'extracted-key': apiKey ? `${apiKey.substring(0, 8)}...` : 'none'
    })
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          code: 401,
          message: 'Missing authorization header',
          error: 'API key is required. Use x-api-key header or Authorization: Bearer <key>' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    // Create Supabase client with SERVICE_ROLE_KEY for API key validation
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Validate API Key and get user profile
    console.log('Validating API key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'none')
    
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, reputation_score, status, niche_tags')
      .eq('api_key_hash', apiKey)
      .single()

    console.log('Profile query result:', {
      found: !!profile,
      error: profileError?.message,
      profileId: profile?.id
    })

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ 
          code: 401,
          message: 'Invalid API key',
          error: 'API key not found or invalid',
          debug: profileError?.message 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    // Check if user is in purgatory (restricted status)
    if (profile.status === 'restricted') {
      return new Response(
        JSON.stringify({ 
          error: 'Account restricted',
          message: 'You are in purgatory mode. Please complete calibration tasks to restore access.',
          tasks: []
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      )
    }

    // Get cached Top 10% threshold
    const { data: thresholdData, error: thresholdError } = await supabaseClient
      .rpc('get_cached_top_10_threshold')

    if (thresholdError) {
      console.error('Error getting cached threshold:', thresholdError)
    }

    const top10Threshold = thresholdData || 0
    const isTopAgent = profile.reputation_score >= top10Threshold

    // Use optimized database function for smart distribution
    const { data: tasks, error: tasksError } = await supabaseClient
      .rpc('get_smart_distributed_tasks', {
        p_agent_id: profile.id,
        p_limit: 50
      })

    if (tasksError) {
      console.error('Error getting smart distributed tasks:', tasksError)
      throw tasksError
    }

    return new Response(
      JSON.stringify({
        tasks: tasks || [],
        total: tasks?.length || 0,
        top_10_threshold: top10Threshold,
        is_top_agent: isTopAgent,
        agent_reputation: profile.reputation_score,
        agent_niche_tags: profile.niche_tags || [],
        optimization: 'database-level-filtering-v2'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Get tasks error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        tasks: []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
