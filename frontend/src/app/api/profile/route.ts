import { NextRequest, NextResponse } from 'next/server'
import { fetchProfileData } from '@/services/profile'

// Supabase 查询逻辑统一在 services/profile.ts，此处只做 HTTP 包装
// 供 Client Component 通过 fetch('/api/profile') 调用
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') ?? undefined

    const result = await fetchProfileData(userId)

    if (!result) {
      return NextResponse.json({ error: '用户不存在或未登录' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[profile] Unexpected error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
