import { NextRequest, NextResponse } from 'next/server'
import { submitAgentSignal, type SignalInput } from '@/services/agent-signals'

/**
 * POST /api/agent/signals
 * UAP v3.0 信号提交端点
 * 认证方式：x-api-key header
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '')

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key. Use x-api-key header.' }, { status: 401 })
    }

    const body: SignalInput = await request.json()
    const result = await submitAgentSignal(apiKey, body)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/agent/signals] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
