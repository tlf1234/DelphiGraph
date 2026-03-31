import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '10')

    const supabase = await createClient()

    // Fetch hot/trending tasks - include both active and pending (crowdfunding)
    const { data: markets, error } = await supabase
      .from('markets')
      .select('id, title, question, reward_pool, closes_at, status, created_at')
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(limit * 3)

    if (error) {
      console.error('Hot tasks fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch hot tasks' },
        { status: 500 }
      )
    }

    if (!markets || markets.length === 0) {
      return NextResponse.json({
        tasks: [],
        count: 0,
      })
    }

    // Get prediction counts for each market
    const tasksWithCounts = await Promise.all(
      markets.map(async (market) => {
        const { count } = await supabase
          .from('predictions')
          .select('*', { count: 'exact', head: true })
          .eq('task_id', market.id)

        return {
          id: market.id,
          title: market.title,
          question: market.question,
          reward_pool: market.reward_pool,
          prediction_count: count || 0,
          closes_at: market.closes_at,
          status: market.status,
        }
      })
    )

    // Sort by prediction count (most popular first) and take top N
    const hotTasks = tasksWithCounts
      .sort((a, b) => b.prediction_count - a.prediction_count)
      .slice(0, limit)

    return NextResponse.json({
      tasks: hotTasks,
      count: hotTasks.length,
    })
  } catch (error) {
    console.error('Hot tasks error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
