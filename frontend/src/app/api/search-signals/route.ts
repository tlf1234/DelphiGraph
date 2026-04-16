import { NextRequest, NextResponse } from 'next/server'
import { searchTasks } from '@/services/tasks'

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('query')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10')

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
    }

    const result = await searchTasks(query, limit)
    if (!result) return NextResponse.json({ error: 'Search failed' }, { status: 500 })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
