import { createClient } from '@/lib/supabase/server'

export async function fetchCausalAnalysis(taskId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: analysis, error } = await supabase
    .from('causal_analyses')
    .select('*')
    .eq('task_id', taskId)
    .eq('is_latest', true)
    .single()

  if (error || !analysis) return { status: 'none', message: '该市场暂无因果分析结果' }
  return analysis
}
