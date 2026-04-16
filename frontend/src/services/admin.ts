import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── 管理员权限检查 ────────────────────────────────────────────────────────────

export async function checkAdminRole(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return (profile as { role: string } | null)?.role === 'admin' ? user.id : null
}

// ── 获取已关闭任务（含提交数） ────────────────────────────────────────────────

export async function getClosedTasksWithCounts() {
  const svc = serviceClient()

  const { data, error } = await svc
    .from('prediction_tasks')
    .select('*')
    .eq('status', 'closed')
    .order('closes_at', { ascending: false })

  if (error) {
    console.error('Error loading tasks:', error)
    throw error
  }

  const tasksWithCounts = await Promise.all(
    (data || []).map(async (task) => {
      const { count } = await svc
        .from('signal_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)

      return { ...task, submission_count: count || 0 }
    })
  )

  return tasksWithCounts
}

// ── 任务结算 ──────────────────────────────────────────────────────────────────

export async function settleTask(taskId: string, outcome: boolean, adminUserId: string) {
  const svc = serviceClient()

  const { data: task } = await svc
    .from('prediction_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task not found')

  const { data: submissions } = await svc
    .from('signal_submissions')
    .select('*')
    .eq('task_id', taskId)

  if (!submissions) throw new Error('No signal submissions found')

  // v3.0: signal_submissions 不含 probability，结算按提交状态分
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSubmissions = submissions.filter((s: any) => s.status === 'submitted')
  const rewardPerWinner = activeSubmissions.length > 0
    ? (task as Record<string, unknown>).reward_pool as number / activeSubmissions.length
    : 0

  for (const sub of activeSubmissions) {
    await svc.rpc('update_user_reputation_and_earnings', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p_user_id:         (sub as any).user_id,
      p_reputation_change: 10,
      p_earnings_change:   rewardPerWinner
    })
  }

  await svc
    .from('prediction_tasks')
    .update({
      status:         'resolved',
      actual_outcome: outcome ? 1 : 0,
      updated_at:     new Date().toISOString()
    })
    .eq('id', taskId)

  await svc
    .from('task_status_audit')
    .insert({
      task_id:     taskId,
      old_status:  'closed',
      new_status:  'resolved',
      changed_by:  `admin:${adminUserId}`
    })

  return {
    activeSubmissions: activeSubmissions.length,
    rewardPerWinner,
  }
}
