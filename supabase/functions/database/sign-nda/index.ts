import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createErrorResponse, Errors } from '../_shared/errors.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

const logger = createLogger('sign-nda')

interface SignNDARequest {
  taskId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received NDA signing request')
    
    // 提取API Key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!apiKey) {
      throw Errors.missingApiKey()
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
      logger.warn('Invalid API key attempt')
      throw Errors.invalidApiKey()
    }

    logger.info('User authenticated', { userId: profile.id })

    // 解析请求体
    const body: SignNDARequest = await req.json()
    const { taskId } = body

    // 验证输入
    if (!taskId) {
      throw Errors.missingFields(['taskId'])
    }

    // 检查市场是否存在且需要NDA
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, requires_nda, nda_text')
      .eq('id', taskId)
      .single()

    if (marketError || !market) {
      throw Errors.marketNotFound()
    }

    if (!market.requires_nda) {
      throw Errors.invalidInput('此任务不需要签署NDA')
    }

    // 检查是否已签署
    const { data: existingAgreement } = await supabase
      .from('nda_agreements')
      .select('id')
      .eq('task_id', taskId)
      .eq('agent_id', profile.id)
      .single()

    if (existingAgreement) {
      logger.info('NDA already signed', { userId: profile.id, taskId })
      return new Response(
        JSON.stringify({
          success: true,
          message: '您已签署过此NDA',
          agreementId: existingAgreement.id,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 获取IP地址和User-Agent
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // 插入NDA签署记录
    const { data: agreement, error: insertError } = await supabase
      .from('nda_agreements')
      .insert({
        task_id: taskId,
        agent_id: profile.id,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select()
      .single()

    if (insertError) {
      logger.error('Failed to insert NDA agreement', insertError)
      throw Errors.databaseError(insertError.message)
    }

    logger.info('NDA signed successfully', { 
      agreementId: agreement.id, 
      userId: profile.id,
      taskId 
    })

    return new Response(
      JSON.stringify({
        success: true,
        agreementId: agreement.id,
        signedAt: agreement.agreed_at,
        message: 'NDA签署成功',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
