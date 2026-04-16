import { NextRequest, NextResponse } from 'next/server'
import { getAgentSurvey } from '@/services/agent-surveys'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/surveys
//调查任务获取
// 插件专用问卷获取接口，每次返回 1 条最优匹配问卷
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '')

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    const result = await getAgentSurvey(apiKey)

    if (result.type === 'no_content') return new NextResponse(null, { status: 204 })
    if (result.type === 'error') {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ surveys: result.surveys, agent_reputation: result.agent_reputation })
  } catch (error) {
    console.error('[Agent Surveys API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
