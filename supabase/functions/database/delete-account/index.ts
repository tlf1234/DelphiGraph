// AgentOracle - 用户账号删除功能
// 实现级联删除所有关联数据
// 
// 注意：此文件在本地TypeScript检查时会显示错误，这是正常的。
// 这些代码在Supabase Deno运行时环境中会正常工作。

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createErrorResponse, Errors } from '../_shared/errors.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

const logger = createLogger('delete-account')

interface DeleteAccountRequest {
  confirmationText: string  // 用户必须输入"DELETE"确认
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received account deletion request')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 验证用户身份
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw Errors.missingAuth()
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      logger.warn('Unauthorized account deletion attempt')
      throw Errors.unauthorized()
    }

    // 解析请求体
    const { confirmationText }: DeleteAccountRequest = await req.json()

    // 验证确认文本
    if (confirmationText !== 'DELETE') {
      throw Errors.invalidInput('确认文本不正确，请输入"DELETE"')
    }

    logger.info('Starting account deletion', { userId: user.id })

    // 开始事务：级联删除所有关联数据
    // 注意：Supabase会根据外键约束自动处理级联删除
    // 但我们手动删除以确保完整性和记录日志

    // 1. 删除用户的预测记录
    const { error: predictionsError } = await supabaseClient
      .from('predictions')
      .delete()
      .eq('user_id', user.id)

    if (predictionsError) {
      logger.error('Failed to delete predictions', predictionsError)
      throw Errors.databaseError(predictionsError.message)
    }

    logger.info('Deleted user predictions', { userId: user.id })

    // 2. 删除用户的模拟记录
    const { error: simulationsError } = await supabaseClient
      .from('simulations')
      .delete()
      .eq('created_by', user.id)

    if (simulationsError) {
      logger.error('Failed to delete simulations', simulationsError)
      throw Errors.databaseError(simulationsError.message)
    }

    logger.info('Deleted user simulations', { userId: user.id })

    // 3. 删除用户的救赎尝试记录
    const { error: redemptionError } = await supabaseClient
      .from('redemption_attempts')
      .delete()
      .eq('user_id', user.id)

    if (redemptionError) {
      logger.error('Failed to delete redemption attempts', redemptionError)
      // 不抛出错误，继续删除
    }

    // 4. 删除用户档案
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .delete()
      .eq('id', user.id)

    if (profileError) {
      logger.error('Failed to delete profile', profileError)
      throw Errors.databaseError(profileError.message)
    }

    logger.info('Deleted user profile', { userId: user.id })

    // 5. 删除Auth用户（这会触发级联删除）
    const { error: authDeleteError } = await supabaseClient.auth.admin.deleteUser(
      user.id
    )

    if (authDeleteError) {
      logger.error('Failed to delete auth user', authDeleteError)
      throw Errors.databaseError(authDeleteError.message)
    }

    logger.info('Account deletion completed successfully', { userId: user.id })

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        message: '账号已成功删除',
        deletedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
