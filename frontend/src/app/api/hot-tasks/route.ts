import { NextRequest, NextResponse } from 'next/server'
import { fetchHotTasks } from '@/services/tasks'

export async function GET(request: NextRequest) {
  try {
    const limit  = parseInt(request.nextUrl.searchParams.get('limit') || '10')
    const result = await fetchHotTasks(limit)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Hot tasks error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
