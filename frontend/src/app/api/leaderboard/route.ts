import { NextRequest, NextResponse } from 'next/server'
import { fetchLeaderboard } from '@/services/leaderboard'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sort  = searchParams.get('sort') || 'reputation'
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

    const result = await fetchLeaderboard(sort, limit)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Leaderboard API error:', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
