// AI智能匹配目标人群画像
// 使用大模型分析任务，识别最适合提供信息的人群画像
// 核心理念：找有相关经验的人提供信息，而不是找专家做预测

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // CORS处理
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { question, description } = await req.json()

    if (!question && !description) {
      return new Response(
        JSON.stringify({ error: '需要提供问题或描述' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 获取AI配置（支持千问或OpenAI）
    const qwenApiKey = Deno.env.get('QWEN_API_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!qwenApiKey && !openaiApiKey) {
      console.error('No AI API key configured (QWEN_API_KEY or OPENAI_API_KEY)')
      return new Response(
        JSON.stringify({ error: 'AI API未配置' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    
    // 优先使用千问，如果没有则使用OpenAI
    const useQwen = !!qwenApiKey
    const apiKey = useQwen ? qwenApiKey : openaiApiKey
    const apiBase = useQwen 
      ? (Deno.env.get('QWEN_API_BASE') || 'https://dashscope.aliyuncs.com/compatible-mode/v1')
      : (Deno.env.get('OPENAI_API_BASE') || 'https://api.openai.com/v1')
    const model = useQwen
      ? (Deno.env.get('QWEN_MODEL') || 'qwen-max')
      : (Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini')

    // 构建AI Prompt - 基于用户画像匹配
    const systemPrompt = `你是 DelphiGraph 平台的智能任务分析助手。你的任务是分析预测/调查任务，并识别出最适合回答该问题的"目标人群画像"。

核心原则：
1. 不要找"专家"，要找"有相关经验的普通人"
2. 强调"多样化" - 不同职业、年龄、背景的人
3. 关键是"相关经验"和"实际体验"，而不是专业知识
4. 通过群体智慧（Wisdom of Crowds）获得最佳预测

分析维度：
1. 基础人口统计：年龄、性别、地理位置、教育、职业类型
2. 生活经验：生活阶段、兴趣、消费行为、关注点
3. 相关经验：有过什么经历、熟悉什么、受什么影响

输出格式（JSON）：
{
  "target_persona": {
    "demographic": {
      "age_range": ["年龄范围"],
      "gender": ["性别要求"],
      "location": ["地理位置"],
      "education": ["教育背景"],
      "occupation_type": ["职业类型"]
    },
    "life_experience": {
      "life_stage": ["生活阶段"],
      "interests": ["兴趣爱好"],
      "consumption": ["消费行为"],
      "concerns": ["关注点"]
    },
    "relevant_experience": {
      "has_experience_with": ["有过什么经历"],
      "familiar_with": ["熟悉什么"],
      "affected_by": ["受什么影响"]
    }
  },
  "diversity_requirements": {
    "occupation_diversity": true/false,
    "age_diversity": true/false,
    "education_diversity": true/false,
    "geographic_diversity": true/false
  },
  "reasoning": "为什么需要这些人群？强调多样性和群体智慧",
  "sample_personas": ["示例人群1", "示例人群2", ...],
  "information_types": ["期望的信息类型1", "期望的信息类型2", ...]
}

示例：
任务: "特朗普会赢得2028年美国总统大选吗？"
输出:
{
  "target_persona": {
    "demographic": {
      "age_range": ["18+"],
      "gender": ["any"],
      "location": ["美国", "关注美国政治的国际人士"],
      "education": ["any"],
      "occupation_type": ["any"]
    },
    "life_experience": {
      "interests": ["政治", "时事"],
      "concerns": ["关注美国大选"]
    },
    "relevant_experience": {
      "has_experience_with": ["参与过投票", "关注过选举"],
      "familiar_with": ["美国政治"],
      "affected_by": ["美国政策影响"]
    }
  },
  "diversity_requirements": {
    "occupation_diversity": true,
    "age_diversity": true,
    "education_diversity": true
  },
  "reasoning": "需要关注美国大选的普通公民，通过不同职业、年龄、教育背景的多样化人群的集体判断来预测选举结果。不需要专业政治分析师，而是需要代表不同群体的普通选民视角。",
  "sample_personas": [
    "美国教师 - 关注教育政策",
    "美国司机 - 关注经济民生",
    "美国学生 - 关注就业前景"
  ],
  "information_types": [
    "个人观察：周围人的政治倾向变化",
    "实际经验：参与投票的体验和感受",
    "相关数据：了解的民调数据、新闻报道",
    "独特见解：从自己职业/生活角度的观察"
  ]
}`

    const userPrompt = `请分析以下任务，识别最适合提供信息的目标人群画像：

任务问题：${question || '无'}

任务描述：${description || '无'}

请返回JSON格式的分析结果。记住：我们要找的是有相关经验能提供有价值信息的普通人，而不是专家。`

    // 调用AI API
    console.log(`Calling ${useQwen ? 'Qwen' : 'OpenAI'} API for persona matching...`)
    const aiResponse = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // 降低随机性，提高一致性
        response_format: { type: 'json_object' }, // 强制JSON输出
      }),
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      console.error('AI API error:', errorText)
      throw new Error(`AI API调用失败: ${aiResponse.status}`)
    }

    const aiResult = await aiResponse.json()
    const aiResponseContent = aiResult.choices[0].message.content

    // 解析AI返回的JSON
    let personaResult
    try {
      personaResult = JSON.parse(aiResponseContent)
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponseContent)
      throw new Error('AI返回格式错误')
    }

    console.log('AI persona matching result:', {
      has_target_persona: !!personaResult.target_persona,
      has_diversity_requirements: !!personaResult.diversity_requirements,
      sample_personas_count: personaResult.sample_personas?.length || 0,
      reasoning: personaResult.reasoning,
    })

    return new Response(
      JSON.stringify({
        target_persona: personaResult.target_persona || {},
        diversity_requirements: personaResult.diversity_requirements || {},
        reasoning: personaResult.reasoning || '基于任务内容的智能分析',
        sample_personas: personaResult.sample_personas || [],
        information_types: personaResult.information_types || [],
        confidence: 'high',
        message: '成功识别目标人群画像',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('AI persona matching error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        target_persona: {}, // 失败时返回空对象，不影响任务创建
        diversity_requirements: {},
        confidence: 'low',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})
