import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('[API /api/searchs/create] 收到创建任务请求')

  try {
    const supabase = await createClient()
    
    // 验证用户认证
    console.log('[API /api/searchs/create] 验证用户认证...')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.error('[API /api/searchs/create] 用户未认证')
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      )
    }

    console.log('[API /api/searchs/create] 用户已认证', {
      userId: session.user.id,
      email: session.user.email,
    })

    // 获取请求体
    const body = await request.json()
    console.log('[API /api/searchs/create] 请求参数', {
      taskCategory: body.task_category,
      taskType: body.task_type,
      question: body.question?.substring(0, 50) + '...',
      rewardPool: body.reward_pool,
      fundingType: body.funding_type,
      targetAgentCount: body.target_agent_count,
      hasResolutionCriteria: !!body.resolution_criteria,
      hasClosesAt: !!body.closes_at,
    })

    // 调用 Supabase Edge Function
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-quest`
    console.log('[API /api/searchs/create] 调用 Edge Function', {
      url: edgeFunctionUrl,
    })

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    })

    console.log('[API /api/searchs/create] Edge Function 响应', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('[API /api/searchs/create] Edge Function 返回错误', {
        status: response.status,
        error: result.error,
        code: result.code,
      })
      return NextResponse.json(
        { error: result.error || '创建任务失败' },
        { status: response.status }
      )
    }

    const duration = Date.now() - startTime
    console.log('[API /api/searchs/create] 任务创建成功', {
      taskId: result.task_id,
      duration: `${duration}ms`,
    })

    return NextResponse.json(result)
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[API /api/searchs/create] 服务器错误', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    })
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    )
  }
}
