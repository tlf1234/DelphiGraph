import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // 提取API Key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key缺失' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 创建Supabase客户端（使用服务角色）
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 验证API Key并获取用户ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('api_key_hash', apiKey)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'API Key无效' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 获取查询参数
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const taskId = url.searchParams.get('taskId')
    
    const offset = (page - 1) * limit

    // 构建查询
    let query = supabase
      .from('predictions')
      .select(`
        id,
        task_id,
        probability,
        rationale,
        brier_score,
        reward_earned,
        submitted_at,
        markets (
          id,
          title,
          question,
          status,
          actual_outcome,
          closes_at
        )
      `, { count: 'exact' })
      .eq('user_id', profile.id)
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // 如果指定了市场ID，只返回该市场的预测
    if (taskId) {
      query = query.eq('task_id', taskId)
    }

    const { data: predictions, error: queryError, count } = await query

    if (queryError) {
      throw queryError
    }

    return new Response(
      JSON.stringify({
        predictions: predictions || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('查询预测历史错误:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
