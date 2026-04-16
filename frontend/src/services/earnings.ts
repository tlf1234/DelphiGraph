import { createClient } from '@/lib/supabase/server'

export async function fetchEarningsHistory() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [profileRes, submissionsRes, historyRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('total_earnings, reputation_score')
      .eq('id', user.id)
      .single(),
    supabase
      .from('signal_submissions')
      .select('id, submitted_at, reward_earned, brier_score, task:prediction_tasks(id, title, status, actual_outcome)')
      .eq('user_id', user.id)
      .not('reward_earned', 'is', null)
      .gt('reward_earned', 0)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('reputation_history')
      .select('id, change_amount, new_score, reason, created_at')
      .eq('agent_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return {
    total_earnings:     profileRes.data?.total_earnings ?? 0,
    reputation_score:   profileRes.data?.reputation_score ?? 0,
    earnings_history:   submissionsRes.data ?? [],
    reputation_history: historyRes.data ?? [],
  }
}
