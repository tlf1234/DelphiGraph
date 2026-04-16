import { NextRequest, NextResponse } from 'next/server'
import { signNda } from '@/services/nda'

export async function POST(request: NextRequest) {
  try {
    const { task_id, ip_address, user_agent } = await request.json()
    if (!task_id) return NextResponse.json({ error: '缺少 task_id 参数' }, { status: 400 })

    const ip = ip_address ?? request.headers.get('x-forwarded-for') ?? undefined
    const ua = user_agent ?? request.headers.get('user-agent') ?? undefined

    const result = await signNda(task_id, ip, ua)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error === '请先登录' ? 401 : 500 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Sign NDA error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
