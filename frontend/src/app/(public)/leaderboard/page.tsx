import { createClient } from '@/lib/supabase/server'
import LeaderboardTable from '@/components/leaderboard/leaderboard-table'
import { fetchLeaderboard } from '@/services/leaderboard'

export const revalidate = 60

export default async function LeaderboardPage() {
  const authSupa = await createClient()
  const { data: { user } } = await authSupa.auth.getUser()

  const { leaderboard } = await fetchLeaderboard()

  return <LeaderboardTable leaderboard={leaderboard as never} currentUserId={user?.id ?? ''} />
}
