/**
 * 创建预言任务 (Create Prophecy Quest)
 * 
 * API端点: /functions/v1/create-quest
 * 
 * 功能说明:
 * - 允许B端用户发布新的预言任务
 * - 支持众筹模式和直接付费模式
 * - 无需等待agent在线即可创建任务
 * - 众筹模式任务初始状态为 'pending'
 * - 直接付费任务初始状态为 'active'
 * 
 * 术语说明:
 * - 预言任务 (Prophecy Quest) = 原"市场" (Market)
 * - 数据库表名仍为 'markets'（技术债务）
 * - 用户可见文本使用"预言任务"术语
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// CORS Headers
// ============================================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

// ============================================================================
// Logger (Inlined from _shared/logger.ts)
// ============================================================================
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  level: LogLevel
  timestamp: string
  functionName?: string
  message: string
  data?: Record<string, any>
  error?: {
    name: string
    message: string
    stack?: string
  }
}

class Logger {
  constructor(private functionName: string) {}

  private log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      functionName: this.functionName,
      message,
      data,
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    const logString = JSON.stringify(entry, null, 2)
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(logString)
        break
      case LogLevel.WARN:
        console.warn(logString)
        break
      case LogLevel.INFO:
        console.info(logString)
        break
      case LogLevel.DEBUG:
        console.debug(logString)
        break
    }
  }

  info(message: string, data?: Record<string, any>) {
    this.log(LogLevel.INFO, message, data)
  }

  error(message: string, data?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, data)
  }
}

const logger = new Logger('create-quest')

// ============================================================================
// Error Handling (Inlined from _shared/errors.ts)
// ============================================================================
class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

function handleError(error: unknown, logger: Logger): Response {
  const timestamp = new Date().toISOString()
  
  if (error instanceof ValidationError) {
    logger.error('Validation error', { error: error.message })
    return new Response(
      JSON.stringify({
        error: error.message,
        code: 'VALIDATION_ERROR',
        timestamp,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
  
  if (error instanceof AuthenticationError) {
    logger.error('Authentication error', { error: error.message })
    return new Response(
      JSON.stringify({
        error: error.message,
        code: 'UNAUTHORIZED',
        timestamp,
      }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
  
  if (error instanceof Error) {
    logger.error('Internal error', { error: error.message, stack: error.stack })
    return new Response(
      JSON.stringify({
        error: error.message,
        code: 'INTERNAL_ERROR',
        timestamp,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
  
  logger.error('Unknown error', { error: String(error) })
  return new Response(
    JSON.stringify({
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      timestamp,
    }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}

// ============================================================================
// Request Interface
// ============================================================================
interface CreateQuestRequest {
  title?: string // 可选，如果不提供则使用question作为title
  description: string
  question: string
  resolution_criteria?: string // 调查任务可选
  closes_at?: string // ISO 8601 timestamp，调查任务可选
  reward_pool: number
  
  // 任务分类
  task_category?: 'prediction' | 'research' // 预言任务 or 调查任务
  task_type?: 'consumer' | 'business' // C端 or B端
  
  // v5.0新增字段
  visibility?: 'public' | 'private'
  result_visibility?: 'public' | 'private'
  priority_level?: 'standard' | 'high' | 'urgent'
  funding_type?: 'crowd' | 'direct'
  funding_goal?: number
  min_reputation?: number
  required_niche_tags?: string[]
  target_agent_count?: number
  requires_nda?: boolean
  nda_text?: string
  report_access?: 'open' | 'exclusive' | 'subscription'
  allowed_viewers?: string[]
}

// ============================================================================
// Main Handler
// ============================================================================
serve(async (req) => {
  const startTime = Date.now()
  logger.info('收到创建任务请求', {
    method: req.method,
    url: req.url,
  })

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    logger.info('处理 CORS preflight 请求')
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    // 1. 验证认证
    logger.info('步骤 1: 验证用户认证')
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      logger.error('缺少 Authorization header')
      throw new AuthenticationError('Missing authorization header')
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
      logger.error('用户认证失败', { error: authError?.message })
      throw new AuthenticationError('Invalid or expired token')
    }

    logger.info('用户认证成功', { 
      userId: user.id,
      email: user.email,
    })

    // 2. 解析请求体
    logger.info('步骤 2: 解析请求体')
    const body: CreateQuestRequest = await req.json()
    logger.info('请求体解析成功', {
      hasTitle: !!body.title,
      hasDescription: !!body.description,
      hasQuestion: !!body.question,
      taskCategory: body.task_category,
      taskType: body.task_type,
      rewardPool: body.reward_pool,
      fundingType: body.funding_type,
      targetAgentCount: body.target_agent_count,
    })

    // 2.5 获取任务类别和类型
    const taskCategory = body.task_category || 'prediction'
    const taskType = body.task_type || 'consumer'
    logger.info('任务分类', { taskCategory, taskType })

    // 3. 验证必填字段
    logger.info('步骤 3: 验证必填字段')
    // 如果没有提供title，使用question作为title
    const title = body.title?.trim() || body.question?.trim()
    
    if (!title || title.length === 0) {
      logger.error('验证失败: Question 为空')
      throw new ValidationError('Question is required')
    }
    if (!body.description || body.description.trim().length === 0) {
      logger.error('验证失败: Description 为空')
      throw new ValidationError('Description is required')
    }
    if (!body.question || body.question.trim().length === 0) {
      logger.error('验证失败: Question 为空')
      throw new ValidationError('Question is required')
    }
    
    // 预言任务必须有兑现标准和截止时间
    if (taskCategory === 'prediction') {
      if (!body.resolution_criteria || body.resolution_criteria.trim().length === 0) {
        logger.error('验证失败: 预言任务缺少 resolution_criteria')
        throw new ValidationError('Resolution criteria is required for prediction tasks')
      }
      if (!body.closes_at) {
        logger.error('验证失败: 预言任务缺少 closes_at')
        throw new ValidationError('Closing time is required for prediction tasks')
      }
    }
    
    if (!body.reward_pool || body.reward_pool <= 0) {
      logger.error('验证失败: reward_pool 无效', { rewardPool: body.reward_pool })
      throw new ValidationError('Reward pool must be greater than 0')
    }

    logger.info('必填字段验证通过')

    // 4. 验证字段长度
    logger.info('步骤 4: 验证字段长度')
    if (title.length > 200) {
      throw new ValidationError('Question must be 200 characters or less')
    }
    if (body.description.length > 5000) {
      throw new ValidationError('Description must be 5000 characters or less')
    }
    if (body.question.length > 500) {
      throw new ValidationError('Question must be 500 characters or less')
    }
    if (body.resolution_criteria && body.resolution_criteria.length > 2000) {
      throw new ValidationError('Resolution criteria must be 2000 characters or less')
    }
    logger.info('字段长度验证通过', {
      titleLength: title.length,
      descriptionLength: body.description.length,
      questionLength: body.question.length,
    })

    // 5. 验证截止时间（仅预言任务）
    logger.info('步骤 5: 验证截止时间')
    let closesAt: Date | null = null
    if (taskCategory === 'prediction' && body.closes_at) {
      closesAt = new Date(body.closes_at)
      const now = new Date()

      if (isNaN(closesAt.getTime())) {
        logger.error('验证失败: 截止时间格式无效', { closesAt: body.closes_at })
        throw new ValidationError('Invalid closing time format')
      }

      if (closesAt <= now) {
        logger.error('验证失败: 截止时间必须是未来时间', {
          closesAt: closesAt.toISOString(),
          now: now.toISOString(),
        })
        throw new ValidationError('Closing time must be in the future')
      }

      logger.info('截止时间验证通过', { closesAt: closesAt.toISOString() })
    } else {
      logger.info('调查任务，跳过截止时间验证')
    }

    // 6. 验证奖金池范围
    logger.info('步骤 6: 验证奖金池和 Agent 数量')
    if (body.reward_pool > 1000000) {
      throw new ValidationError('Reward pool cannot exceed 1,000,000')
    }
    
    // Agent 数量验证
    const targetAgentCount = body.target_agent_count || 0
    if (taskType === 'consumer') {
      if (targetAgentCount < 100) {
        throw new ValidationError('Consumer task minimum agent count is 100')
      }
      if (targetAgentCount > 500) {
        throw new ValidationError('Consumer task maximum agent count is 500')
      }
    } else if (taskType === 'business') {
      if (targetAgentCount < 1000) {
        throw new ValidationError('Business task minimum agent count is 1000')
      }
      if (targetAgentCount > 5000) {
        throw new ValidationError('Business task maximum agent count is 5000')
      }
    }
    
    // 验证价格与 Agent 数量的匹配
    const baseAgentCount = taskType === 'consumer' ? 100 : 1000
    const basePrice = taskType === 'consumer' ? 50 : 2000
    const expectedPrice = basePrice + Math.floor((targetAgentCount - baseAgentCount) / 10) * 20
    
    if (Math.abs(body.reward_pool - expectedPrice) > 1) {
      logger.error('验证失败: 价格与 Agent 数量不匹配', {
        rewardPool: body.reward_pool,
        expectedPrice,
        targetAgentCount,
      })
      throw new ValidationError(`Price mismatch: expected ${expectedPrice} for ${targetAgentCount} agents`)
    }

    logger.info('奖金池和 Agent 数量验证通过', {
      rewardPool: body.reward_pool,
      targetAgentCount,
      expectedPrice,
    })

    // 6.5. v5.0字段验证
    logger.info('步骤 6.5: v5.0 字段验证')
    const visibility = body.visibility || 'public'
    const fundingType = body.funding_type || 'direct'
    
    // 众筹模式验证
    if (fundingType === 'crowd') {
      const fundingGoal = body.funding_goal || body.reward_pool
      if (fundingGoal < 50 || fundingGoal > 200) {
        throw new ValidationError('Crowdfunding goal must be between $50 and $200')
      }
      logger.info('众筹模式验证通过', { fundingGoal })
    }
    
    // 直接付费验证
    if (fundingType === 'direct') {
      logger.info('直接付费模式验证通过')
    }
    
    // 私密任务验证
    if (visibility === 'private') {
      if (body.min_reputation !== undefined && body.min_reputation < 0) {
        throw new ValidationError('Minimum reputation must be non-negative')
      }
      logger.info('私密任务验证通过', { minReputation: body.min_reputation })
    }
    
    // NDA验证
    if (body.requires_nda && (!body.nda_text || body.nda_text.trim() === '')) {
      throw new ValidationError('NDA text is required when requires_nda is true')
    }
    if (body.requires_nda) {
      logger.info('NDA 验证通过')
    }

    // 7. 清理输入（防止XSS）
    logger.info('步骤 7: 清理输入数据')
    const sanitizedTitle = title
    const sanitizedDescription = body.description.trim()
    const sanitizedQuestion = body.question.trim()
    const sanitizedResolutionCriteria = body.resolution_criteria ? body.resolution_criteria.trim() : null
    logger.info('输入数据清理完成')

    // 8. AI智能匹配目标人群画像
    logger.info('步骤 8: 调用 AI 匹配目标人群画像')
    let personaData: any = null
    
    try {
      logger.info('准备调用 AI 画像匹配服务', {
        questionPreview: sanitizedQuestion.substring(0, 50) + '...',
        descriptionPreview: sanitizedDescription.substring(0, 100) + '...',
      })
      
      // 调用AI匹配Edge Function
      const aiMatchResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai/ai-match-niche-tags`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            question: sanitizedQuestion,
            description: sanitizedDescription,
          }),
        }
      )
      
      logger.info('AI 画像匹配服务响应', {
        status: aiMatchResponse.status,
        ok: aiMatchResponse.ok,
      })
      
      if (aiMatchResponse.ok) {
        personaData = await aiMatchResponse.json()
        logger.info('AI 画像匹配成功', {
          has_target_persona: !!personaData.target_persona,
          has_diversity_requirements: !!personaData.diversity_requirements,
          sample_personas_count: personaData.sample_personas?.length || 0,
          confidence: personaData.confidence,
        })
      } else {
        const errorText = await aiMatchResponse.text()
        logger.error('AI 画像匹配失败', {
          status: aiMatchResponse.status,
          error: errorText,
        })
      }
    } catch (aiError) {
      logger.error('AI 画像匹配异常', {
        error: aiError instanceof Error ? aiError.message : String(aiError),
      })
      // AI匹配失败不影响任务创建，继续使用空数据
    }

    // 9. 插入预言任务记录
    logger.info('步骤 9: 插入任务记录到数据库')
    // 状态逻辑：
    // - 直接付费(direct): 立即激活 (active)
    // - 众筹(crowd): 等待众筹完成 (pending)
    // 无论是否有agent在线，都允许创建任务
    const taskStatus = fundingType === 'direct' ? 'active' : 'pending'
    const insertData: any = {
      title: sanitizedTitle,
      description: sanitizedDescription,
      question: sanitizedQuestion,
      resolution_criteria: sanitizedResolutionCriteria,
      closes_at: closesAt ? closesAt.toISOString() : null,
      reward_pool: body.reward_pool,
      status: taskStatus,
      created_by: user.id,
      
      // 任务分类
      task_category: taskCategory,
      task_type: taskType,
      
      // v5.0新增字段
      visibility: visibility,
      result_visibility: body.result_visibility || 'public',
      priority_level: body.priority_level || 'standard',
      funding_type: fundingType,
      funding_goal: fundingType === 'crowd' ? (body.funding_goal || body.reward_pool) : null,
      funding_current: 0,
      min_reputation: body.min_reputation || 0,
      required_niche_tags: body.required_niche_tags || null, // 保留旧字段用于向后兼容
      target_agent_count: body.target_agent_count || null,
      requires_nda: body.requires_nda || false,
      nda_text: body.nda_text ? body.nda_text.trim() : null,
      report_access: body.report_access || 'open',
      allowed_viewers: body.allowed_viewers || null,
    }
    
    logger.info('准备插入数据', {
      status: taskStatus,
      fundingType,
      visibility,
      hasPersonaData: !!personaData,
      requiresNda: body.requires_nda || false,
    })
    
    const { data: market, error: insertError } = await supabase
      .from('markets')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      logger.error('数据库插入失败', { 
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
      })
      throw new Error(`Failed to create quest: ${insertError.message}`)
    }

    logger.info('任务创建成功', { 
      taskId: market.id,
      userId: user.id,
      taskCategory,
      taskType,
      status: taskStatus,
    })

    // 10. 插入任务画像数据到 task_personas 表
    if (personaData && personaData.target_persona) {
      logger.info('步骤 10: 插入任务画像数据')
      
      // 获取 AI 模型信息
      const qwenApiKey = Deno.env.get('QWEN_API_KEY')
      const useQwen = !!qwenApiKey
      const aiModel = useQwen 
        ? (Deno.env.get('QWEN_MODEL') || 'qwen-max')
        : (Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini')
      
      try {
        const { error: personaInsertError } = await supabase
          .from('task_personas')
          .insert({
            task_id: market.id,
            target_demographic: personaData.target_persona.demographic || {},
            target_life_experience: personaData.target_persona.life_experience || {},
            target_relevant_experience: personaData.target_persona.relevant_experience || {},
            diversity_requirements: personaData.diversity_requirements || {},
            reasoning: personaData.reasoning || null,
            sample_personas: personaData.sample_personas || null,
            information_types: personaData.information_types || null,
            confidence: personaData.confidence || 'medium',
            ai_model: aiModel,
            ai_version: '1.0',
          })

        if (personaInsertError) {
          logger.error('任务画像插入失败（不影响任务创建）', {
            error: personaInsertError.message,
            code: personaInsertError.code,
          })
        } else {
          logger.info('任务画像插入成功', {
            taskId: market.id,
            has_demographic: !!personaData.target_persona.demographic,
            has_life_experience: !!personaData.target_persona.life_experience,
            has_relevant_experience: !!personaData.target_persona.relevant_experience,
          })
        }
      } catch (personaError) {
        logger.error('任务画像插入异常（不影响任务创建）', {
          error: personaError instanceof Error ? personaError.message : String(personaError),
        })
      }
    } else {
      logger.info('步骤 10: 跳过任务画像插入（无画像数据）')
    }

    const duration = Date.now() - startTime
    logger.info('任务创建流程完成', { 
      taskId: market.id,
      duration: `${duration}ms`,
    })

    // 11. 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        task_id: market.id,
        market: market,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('任务创建流程失败', {
      duration: `${duration}ms`,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    })
    return handleError(error, logger)
  }
})
