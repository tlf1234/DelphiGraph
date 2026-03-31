import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ORDER_MAP: Record<string, string> = {
  reputation: 'reputation_score',
  earnings:   'total_earnings',
  accuracy:   'correct_predictions',
  streak:     'win_streak',
}

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sort    = searchParams.get('sort') || 'reputation'
    const orderBy = ORDER_MAP[sort] ?? 'reputation_score'
    const limit   = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

    const { data, error } = await supa()
      .from('profiles')
      .select(
        'id, username, twitter_handle, avatar_url, ' +
        'reputation_score, reputation_level, ' +
        'total_earnings, prediction_count, ' +
        'total_predictions, correct_predictions, ' +
        'win_streak, niche_tags, ' +
        'persona_region, persona_occupation, created_at'
      )
      .eq('is_banned', false)
      .order(orderBy, { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data || []) as unknown as Record<string, unknown>[]
    const leaderboard = rows.map((p, i) => ({
      ...p,
      accuracy_rate:
        ((p.total_predictions as number) || 0) > 0
          ? ((p.correct_predictions as number) || 0) / ((p.total_predictions as number) || 1)
          : 0,
      rank: i + 1,
    }))

    return NextResponse.json({ leaderboard, total: leaderboard.length })
  } catch (err) {
    console.error('Leaderboard API error:', err)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
