import { NextRequest, NextResponse } from 'next/server'
import { checkAdminRole, getClosedTasksWithCounts, settleTask } from '@/services/admin'

// GET /api/admin/settlement — 获取所有已关闭任务（含提交数）
export async function GET() {
  const adminUserId = await checkAdminRole()
  if (!adminUserId) {
    return NextResponse.json({ error: '访问被拒绝' }, { status: 403 })
  }

  try {
    const tasks = await getClosedTasksWithCounts()
    return NextResponse.json({ tasks })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

// POST /api/admin/settlement — 结算指定任务
export async function POST(request: NextRequest) {
  const adminUserId = await checkAdminRole()
  if (!adminUserId) {
    return NextResponse.json({ error: '访问被拒绝' }, { status: 403 })
  }

  const { taskId, outcome } = await request.json()
  if (!taskId || outcome === undefined) {
    return NextResponse.json({ error: 'taskId and outcome are required' }, { status: 400 })
  }

  try {
    const result = await settleTask(taskId, outcome, adminUserId)
    return NextResponse.json({
      success: true,
      activeSubmissions: result.activeSubmissions,
      rewardPerWinner:   result.rewardPerWinner,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
