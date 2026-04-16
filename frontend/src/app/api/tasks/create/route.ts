import { NextRequest, NextResponse } from 'next/server'
import { createTask, type CreateTaskInput } from '@/services/tasks'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const body: CreateTaskInput = await request.json()
    console.log('[API /api/tasks/create] 请求参数', {
      question: body.question?.substring(0, 50),
      reward_pool: body.reward_pool,
    })

    const result = await createTask(body)
    const duration = Date.now() - startTime

    if (!result.success) {
      console.error('[API /api/tasks/create] 创建失败', result.error)
      return NextResponse.json({ error: result.error }, { status: result.error === '请先登录' ? 401 : 400 })
    }

    console.log('[API /api/tasks/create] 创建成功', { taskId: result.task_id, duration: `${duration}ms` })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[API /api/tasks/create] 服务器错误', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
