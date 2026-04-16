import { createClient } from '@/lib/supabase/server'

export async function fetchUserSubmissions() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('signal_submissions')
    .select(`
      id,
      status,
      signals,
      brier_score,
      reward_earned,
      submitted_at,
      abstain_reason,
      prediction_tasks (
        id,
        title,
        question,
        status,
        actual_outcome,
        closes_at
      )
    `)
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  if (error) return null
  return { submissions: data ?? [], userId: user.id }
}
