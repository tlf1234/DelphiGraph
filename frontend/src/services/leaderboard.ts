import { createClient } from '@supabase/supabase-js'

const ORDER_MAP: Record<string, string> = {
  reputation: 'reputation_score',
  earnings:   'total_earnings',
  accuracy:   'correct_submissions',
  streak:     'win_streak',
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function fetchLeaderboard(sort = 'reputation', limit = 100) {
  const supabase = serviceClient()
  const orderBy   = ORDER_MAP[sort] ?? 'reputation_score'
  const safeLimit = Math.min(limit, 500)

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, username, twitter_handle, avatar_url, ' +
      'reputation_score, reputation_level, ' +
      'total_earnings, submission_count, ' +
      'total_submissions, correct_submissions, ' +
      'win_streak, niche_tags, ' +
      'persona_region, persona_occupation, created_at'
    )
    .eq('is_banned', false)
    .order(orderBy, { ascending: false })
    .limit(safeLimit)

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const leaderboard = rows.map((p, i) => ({
    ...p,
    accuracy_rate:
      (p.total_submissions || 0) > 0
        ? (p.correct_submissions || 0) / (p.total_submissions || 1)
        : 0,
    rank: i + 1,
  }))

  return { leaderboard, total: leaderboard.length }
}
