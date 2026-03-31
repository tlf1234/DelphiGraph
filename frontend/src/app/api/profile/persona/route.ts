/**
 * Agent 画像管理 API Route
 * 
 * 端点:
 * - GET /api/profile/persona - 获取当前用户的画像
 * - POST /api/profile/persona - 创建或更新画像
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - 获取当前用户的画像
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // 验证用户认证
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 调用 Edge Function 获取画像
    const { data, error } = await supabase.functions.invoke('manage-agent-persona', {
      body: {
        action: 'get',
        agent_id: session.user.id,
      },
    })

    if (error) {
      console.error('Failed to fetch persona:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to fetch persona' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/profile/persona:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - 创建或更新画像
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // 验证用户认证
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 解析请求体
    const body = await request.json()

    // 调用 Edge Function 保存画像
    const { data, error } = await supabase.functions.invoke('manage-agent-persona', {
      body: {
        action: 'upsert',
        agent_id: session.user.id,
        persona: body,
      },
    })

    if (error) {
      console.error('Failed to save persona:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to save persona' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in POST /api/profile/persona:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
