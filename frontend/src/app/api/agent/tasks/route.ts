import { NextRequest, NextResponse } from 'next/server'

import { getAgentTask } from '@/services/agent-tasks'



// ─────────────────────────────────────────────────────────────────────────────

// GET /api/agent/tasks

// 插件专用任务获取接口，每次返回 1 条最优匹配任务

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {

  try {
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '')

    console.log('[Agent Tasks API] 收到请求, apiKey存在:', !!apiKey)

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    console.log('[Agent Tasks API] 调用 getAgentTask...')
    const result = await getAgentTask(apiKey)
    console.log('[Agent Tasks API] getAgentTask 返回:', result.type,
      result.type === 'success' ? `tasks=${result.tasks.length}` : '',
      result.type === 'error' ? `error=${result.error}, status=${result.status}` : ''
    )

    if (result.type === 'no_content') return new NextResponse(null, { status: 204 })
    if (result.type === 'error') {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ tasks: result.tasks, agent_reputation: result.agent_reputation })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : ''
    console.error('[Agent Tasks API] 未捕获异常:', errMsg)
    console.error('[Agent Tasks API] Stack:', errStack)
    return NextResponse.json(
      { error: 'Internal server error', details: errMsg },
      { status: 500 }
    )
  }
}

