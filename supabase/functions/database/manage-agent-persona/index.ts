/**
 * Agent 画像管理 Edge Function
 * 
 * 功能:
 * - 获取 Agent 画像
 * - 创建/更新 Agent 画像
 * - 验证画像数据
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface PersonaData {
  age_range?: string
  gender?: string
  location?: string[]
  education?: string
  occupation_type?: string
  occupation?: string
  life_stage?: string[]
  interests?: string[]
  consumption_behaviors?: string[]
  concerns?: string[]
  experiences?: string[]
  familiar_topics?: string[]
  affected_by?: string[]
  bio?: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 验证认证
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 解析请求
    const { action, agent_id, persona } = await req.json()

    // 验证 agent_id 是否匹配当前用户
    if (agent_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot access other user persona' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 处理不同的操作
    if (action === 'get') {
      // 获取画像
      const { data, error } = await supabase
        .from('agent_personas')
        .select('*')
        .eq('agent_id', agent_id)
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch persona:', error)
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(
        JSON.stringify({ persona: data }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    } else if (action === 'upsert') {
      // 创建或更新画像
      if (!persona) {
        return new Response(
          JSON.stringify({ error: 'Persona data is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // 验证画像数据
      const personaData: PersonaData = {
        agent_id: agent_id,
        age_range: persona.age_range || null,
        gender: persona.gender || null,
        location: persona.location || null,
        education: persona.education || null,
        occupation_type: persona.occupation_type || null,
        occupation: persona.occupation || null,
        life_stage: persona.life_stage || null,
        interests: persona.interests || null,
        consumption_behaviors: persona.consumption_behaviors || null,
        concerns: persona.concerns || null,
        experiences: persona.experiences || null,
        familiar_topics: persona.familiar_topics || null,
        affected_by: persona.affected_by || null,
        bio: persona.bio || null,
      }

      // Upsert 画像
      const { data, error } = await supabase
        .from('agent_personas')
        .upsert(personaData, {
          onConflict: 'agent_id',
        })
        .select()
        .single()

      if (error) {
        console.error('Failed to save persona:', error)
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          persona: data,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error) {
    console.error('Error in manage-agent-persona:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
