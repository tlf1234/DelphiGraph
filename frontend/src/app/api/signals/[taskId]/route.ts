/**
 * GET /api/signals/[taskId]
 * 获取某任务的所有信号提交数据（v3.0）
 * 用于因果图谱查看器渲染 Agent/Signal 层
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchTaskSignals } from '@/services/signals'

export async function GET(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const result = await fetchTaskSignals(params.taskId)
    if (!result) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    console.log(
      `[api/signals GET] taskId=${params.taskId} ` +
      `submissions=${result.summary.total_submissions} totalSignals=${result.summary.total_signals}`
    )

    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/signals GET] unexpected:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
