import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Market {
  id: string
  title: string
  question: string
  description: string
  status: string
  created_at: string
}

interface Prediction {
  probability: number
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Search in markets table (only resolved or closed markets)
    const { data: markets, error } = await supabase
      .from('markets')
      .select(`
        id,
        title,
        question,
        description,
        status,
        created_at
      `)
      .or(`status.eq.resolved,status.eq.closed`)
      .or(`title.ilike.%${query}%,question.ilike.%${query}%,description.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Search error:', error)
      return NextResponse.json(
        { error: 'Search failed' },
        { status: 500 }
      )
    }

    // For each market, get prediction count and consensus probability
    const results = await Promise.all(
      (markets as Market[]).map(async (market) => {
        // Get prediction count
        const { count } = await supabase
          .from('predictions')
          .select('*', { count: 'exact', head: true })
          .eq('task_id', market.id)

        // Get consensus probability (average)
        const { data: predictions } = await supabase
          .from('predictions')
          .select('probability')
          .eq('task_id', market.id)

        const consensusProbability =
          predictions && predictions.length > 0
            ? (predictions as Prediction[]).reduce((sum: number, p: Prediction) => sum + p.probability, 0) / predictions.length
            : 0

        return {
          taskId: market.id,
          title: market.title,
          question: market.question,
          summary: market.description.substring(0, 200) + '...',
          consensusProbability: Math.round(consensusProbability * 100) / 100,
          predictionCount: count || 0,
          status: market.status,
        }
      })
    )

    return NextResponse.json({
      results,
      hasResults: results.length > 0,
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
