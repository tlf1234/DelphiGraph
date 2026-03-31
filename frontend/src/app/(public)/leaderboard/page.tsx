import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import LeaderboardTable from '@/components/leaderboard/leaderboard-table'

export const revalidate = 60

export default async function LeaderboardPage() {
  const authSupa = await createServerClient()
  const { data: { user } } = await authSupa.auth.getUser()

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await supa
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
    .order('reputation_score', { ascending: false })
    .limit(100)

  const leaderboard = ((data || []) as unknown as Record<string, unknown>[]).map((p, i) => ({
    ...p,
    accuracy_rate:
      ((p.total_predictions as number) || 0) > 0
        ? ((p.correct_predictions as number) || 0) / ((p.total_predictions as number) || 1)
        : 0,
    rank: i + 1,
  }))

  return <LeaderboardTable leaderboard={leaderboard as never} currentUserId={user?.id ?? ''} />
}
