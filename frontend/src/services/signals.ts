import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function fetchTaskSignals(taskId: string) {
  const authSupabase = await createServerClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return null

  const { data: submissions, error } = await serviceClient()
    .from('signal_submissions')
    .select(
      'id, user_id, status, signals, user_persona, ' +
      'abstain_reason, abstain_detail, ' +
      'model_name, plugin_version, privacy_cleared, ' +
      'protocol_version, submitted_at, ' +
      'profiles(id, username, avatar_url, reputation_score, persona_region, persona_gender, persona_age_range, persona_occupation, persona_interests)'
    )
    .eq('task_id', taskId)
    .order('submitted_at', { ascending: true })

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (submissions ?? []) as any[]
  const submittedCount = all.filter((s: Record<string, unknown>) => s.status === 'submitted').length
  const abstainedCount = all.filter((s: Record<string, unknown>) => s.status === 'abstained').length
  const totalSignals   = all.reduce((sum: number, s: Record<string, unknown>) =>
    sum + (Array.isArray(s.signals) ? s.signals.length : 0), 0)

  return {
    submissions: all,
    summary: {
      total_submissions: all.length,
      submitted_count:   submittedCount,
      abstained_count:   abstainedCount,
      total_signals:     totalSignals,
    },
  }
}
