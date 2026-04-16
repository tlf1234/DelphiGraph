import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function fetchSearchDetail(taskId: string) {
  const supabase = await createClient()
  const svc      = serviceClient()

  // 获取任务详情（使用 auth client，遵循 RLS）
  const { data: task, error } = await supabase
    .from('prediction_tasks')
    .select('id, title, question, description, status, closes_at, reward_pool, target_agent_count, created_at, causal_analysis_status')
    .eq('id', taskId)
    .single()

  if (error || !task) return null

  // 获取信号提交（使用 service role 绕过 user-scoped RLS，用于生成 agent/signal 节点）
  const { data: submissions } = await svc
    .from('signal_submissions')
    .select(
      'id, user_id, status, signals, submitted_at, ' +
      'profiles(id, username, avatar_url, reputation_score, persona_region, persona_gender, persona_age_range, persona_occupation, persona_interests)'
    )
    .eq('task_id', taskId)
    .order('submitted_at', { ascending: true })

  // 获取最新因果分析（含图谱、结论、报纸）
  const { data: analysis } = await supabase
    .from('causal_analyses')
    .select(
      'id, status, signal_count, hard_fact_count, persona_count, ' +
      'graph_data, conclusion, newspaper_content, preprocess_summary, ' +
      'is_final, version, created_at'
    )
    .eq('task_id', taskId)
    .eq('is_latest', true)
    .maybeSingle()

  return {
    task:        task as Record<string, unknown>,
    submissions: (submissions ?? []) as unknown[],
    analysis:    (analysis ?? null) as Record<string, unknown> | null,
  }
}
