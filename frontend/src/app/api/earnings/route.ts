import { NextResponse } from 'next/server'
import { fetchEarningsHistory } from '@/services/earnings'

export async function GET() {
  try {
    const result = await fetchEarningsHistory()
    if (!result) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[earnings] Unexpected error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
