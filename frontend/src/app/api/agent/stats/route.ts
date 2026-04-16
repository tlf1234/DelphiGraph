import { NextRequest, NextResponse } from 'next/server'
import { getAgentStats } from '@/services/agent-stats'

/**
 * GET /api/agent/stats
 * 获取当前 Agent 的统计信息（已完成信号提交数、声望分等）
 * 认证方式：x-api-key header
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '')

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key. Use x-api-key header.' }, { status: 401 })
    }

    const result = await getAgentStats(apiKey)
    if (!result) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Agent Stats API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
