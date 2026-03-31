// Edge Function: generate-simulation
// 功能：聚合市场所有预测推理，调用千问AI生成"未来报纸"内容
// 限制：每个市场每24小时只能生成一次

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface GenerateSimulationRequest {
  taskId: string
}

interface Prediction {
  id: string
  probability: number
  rationale: string
  user_id: string
  submitted_at: string
}

interface Market {
  id: string
  title: string
  question: string
  description: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // 创建 Supabase 客户端
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // 验证用户身份
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 解析请求
    const { taskId }: GenerateSimulationRequest = await req.json()

    if (!taskId) {
      return new Response(JSON.stringify({ error: '缺少 taskId 参数' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 检查24小时内是否已生成过模拟
    const { data: recentSimulation } = await supabaseClient
      .from('simulations')
      .select('id, generated_at')
      .eq('task_id', taskId)
      .gte('generated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (recentSimulation) {
      return new Response(
        JSON.stringify({
          error: '该市场在24小时内已生成过模拟',
          existingSimulation: recentSimulation,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 获取市场信息
    const { data: market, error: marketError } = await supabaseClient
      .from('markets')
      .select('id, title, question, description')
      .eq('id', taskId)
      .single()

    if (marketError || !market) {
      return new Response(JSON.stringify({ error: '市场不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 获取所有预测和推理
    const { data: predictions, error: predictionsError } = await supabaseClient
      .from('predictions')
      .select('id, probability, rationale, user_id, submitted_at')
      .eq('task_id', taskId)
      .order('submitted_at', { ascending: false })

    if (predictionsError) {
      return new Response(JSON.stringify({ error: '获取预测数据失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!predictions || predictions.length === 0) {
      return new Response(JSON.stringify({ error: '该市场暂无预测数据' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 计算共识概率和分歧分数
    const consensusProbability =
      predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length

    // 计算标准差作为分歧分数
    const variance =
      predictions.reduce((sum, p) => sum + Math.pow(p.probability - consensusProbability, 2), 0) /
      predictions.length
    const divergenceScore = Math.sqrt(variance)

    // 聚合预测数据用于 OpenAI prompt
    const aggregatedPredictions = predictions
      .map(
        (p, index) =>
          `预测 ${index + 1}:\n` +
          `- 概率: ${(p.probability * 100).toFixed(1)}%\n` +
          `- 推理: ${p.rationale || '无推理说明'}\n` +
          `- 提交时间: ${new Date(p.submitted_at).toLocaleString('zh-CN')}`
      )
      .join('\n\n')

    // 构建 OpenAI prompt
    const prompt = `你是一位来自未来的记者。基于以下AI智能体的预测和推理，撰写一篇新闻报道，描述事件"${market.question}"的结果。

市场背景：
${market.description}

预测数据（共${predictions.length}个预测）：
${aggregatedPredictions}

统计信息：
- 共识概率: ${(consensusProbability * 100).toFixed(1)}%
- 分歧程度: ${(divergenceScore * 100).toFixed(1)}%

要求：
1. 以新闻报道的形式撰写，标题醒目
2. 客观、专业，基于预测数据推断未来结果
3. 突出显示共识点和分歧点
4. 综合多个智能体的推理，提供全面的未来洞察
5. 使用中文撰写
6. 字数控制在500-800字

请开始撰写：`

    // 调用千问 API
    const qwenApiKey = Deno.env.get('QWEN_API_KEY')
    if (!qwenApiKey) {
      return new Response(JSON.stringify({ error: '千问 API Key 未配置' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const qwenApiBase = Deno.env.get('QWEN_API_BASE') || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    const qwenModel = Deno.env.get('QWEN_MODEL') || 'qwen-max'

    const qwenResponse = await fetch(`${qwenApiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${qwenApiKey}`,
      },
      body: JSON.stringify({
        model: qwenModel,
        messages: [
          {
            role: 'system',
            content: '你是一位专业的未来记者，擅长基于预测数据撰写新闻报道。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    if (!qwenResponse.ok) {
      const error = await qwenResponse.text()
      console.error('千问 API 错误:', error)
      return new Response(JSON.stringify({ error: 'AI生成失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const qwenData = await qwenResponse.json()
    const simulationContent = qwenData.choices[0].message.content

    // 存储模拟结果
    const { data: simulation, error: insertError } = await supabaseClient
      .from('simulations')
      .insert({
        task_id: taskId,
        content: simulationContent,
        consensus_probability: consensusProbability,
        divergence_score: divergenceScore,
        prediction_count: predictions.length,
      })
      .select()
      .single()

    if (insertError) {
      console.error('存储模拟失败:', insertError)
      return new Response(JSON.stringify({ error: '存储模拟失败' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        simulation: {
          id: simulation.id,
          content: simulation.content,
          consensusProbability: simulation.consensus_probability,
          divergenceScore: simulation.divergence_score,
          predictionCount: simulation.prediction_count,
          generatedAt: simulation.generated_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('生成模拟错误:', error)
    return new Response(
      JSON.stringify({
        error: '服务器内部错误',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
