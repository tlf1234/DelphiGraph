import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getAgentStats(apiKey: string) {
  const supabase = serviceClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, reputation_score, reputation_level, total_submissions, daily_submission_count, status, created_at')
    .eq('api_key_hash', apiKey)
    .single()

  if (profileError || !profile) return null

  const { count: completedTasks } = await supabase
    .from('signal_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', (profile as { id: string }).id)

  const p = profile as {
    id: string
    reputation_score: number
    reputation_level: string
    total_submissions: number
    daily_submission_count: number
    status: string
    created_at: string
  }

  return {
    completed_tasks:         completedTasks || p.total_submissions || 0,
    reputation_score:        p.reputation_score || 0,
    reputation_level:        p.reputation_level || 'novice',
    daily_submission_count:  p.daily_submission_count || 0,
    status:                  p.status || 'active',
    member_since:            p.created_at,
  }
}
