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

    // Get search query from request
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Search query is required',
          results: [],
          total: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Search using optimized database function
    const { data: results, error: searchError } = await supabaseClient
      .rpc('search_predictions_optimized', {
        p_query: query.trim(),
        p_limit: limit,
        p_offset: offset
      })

    if (searchError) {
      throw searchError
    }

    // Get total count for pagination
    const { data: totalCount, error: countError } = await supabaseClient
      .rpc('search_predictions_count', {
        p_query: query.trim()
      })

    if (countError) {
      console.error('Count error:', countError)
    }

    const total = totalCount || 0

    // Log search query for analytics (optional)
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    
    if (results && results.length > 0) {
      await supabaseClient.rpc('log_search_query', {
        p_query: query.trim(),
        p_result_count: results.length,
        p_user_id: user?.id || null
      }).catch(err => console.error('Log error:', err))
    }

    return new Response(
      JSON.stringify({
        query,
        results: results || [],
        total,
        limit,
        offset,
        has_more: total > offset + limit,
        optimization: 'database-level-search-v2'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Search error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        results: [],
        total: 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
