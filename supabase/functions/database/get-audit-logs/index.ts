// AgentOracle - 审计日志查询API
// 仅管理员可以访问
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

const logger = createLogger('get-audit-logs')

interface QueryParams {
  userId?: string
  entityType?: string
  action?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    logger.info('Received audit logs query request')
    
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
      logger.warn('Unauthorized audit logs access attempt')
      throw Errors.unauthorized()
    }

    // 验证管理员权限
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      logger.warn('Non-admin user attempted to access audit logs', { userId: user.id })
      throw Errors.forbidden('只有管理员可以查看审计日志')
    }

    // 解析查询参数
    const url = new URL(req.url)
    const params: QueryParams = {
      userId: url.searchParams.get('userId') || undefined,
      entityType: url.searchParams.get('entityType') || undefined,
      action: url.searchParams.get('action') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
    }

    logger.info('Query parameters', params)

    // 构建查询
    let query = supabaseClient
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // 应用过滤条件
    if (params.userId) {
      query = query.eq('user_id', params.userId)
    }

    if (params.entityType) {
      query = query.eq('entity_type', params.entityType)
    }

    if (params.action) {
      query = query.eq('action', params.action)
    }

    if (params.startDate) {
      query = query.gte('created_at', params.startDate)
    }

    if (params.endDate) {
      query = query.lte('created_at', params.endDate)
    }

    // 应用分页
    query = query.range(params.offset, params.offset + params.limit - 1)

    // 执行查询
    const { data: logs, error: logsError, count } = await query

    if (logsError) {
      logger.error('Failed to query audit logs', logsError)
      throw Errors.databaseError(logsError.message)
    }

    logger.info('Audit logs query successful', { count, returned: logs?.length })

    // 返回结果
    return new Response(
      JSON.stringify({
        logs,
        pagination: {
          total: count || 0,
          limit: params.limit,
          offset: params.offset,
          hasMore: (count || 0) > params.offset + params.limit,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return createErrorResponse(error, corsHeaders)
  }
})
