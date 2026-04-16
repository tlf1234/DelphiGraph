import { createClient } from '@/lib/supabase/server'

export async function signNda(
  taskId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '请先登录' }

  const { error } = await supabase
    .from('nda_agreements')
    .upsert(
      { task_id: taskId, agent_id: user.id, ip_address: ipAddress, user_agent: userAgent },
      { onConflict: 'task_id,agent_id' }
    )

  if (error) return { success: false, error: error.message }
  return { success: true }
}
