import { createClient } from '@/lib/supabase/server'

// ──────────────────────────────────────────────────────────
// Hot Tasks
// ──────────────────────────────────────────────────────────
export async function fetchHotTasks(limit = 10) {
  const supabase = await createClient()

  const { data: tasks, error } = await supabase
    .from('prediction_tasks')
    .select('id, title, question, reward_pool, closes_at, status, created_at')
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false })
    .limit(limit * 3)

  if (error || !tasks?.length) return { tasks: [], count: 0 }

  const tasksWithCounts = await Promise.all(
    tasks.map(async (task) => {
      const { count } = await supabase
        .from('signal_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)
      return { ...task, signal_count: count || 0 }
    })
  )

  const hotTasks = tasksWithCounts
    .sort((a, b) => b.signal_count - a.signal_count)
    .slice(0, limit)

  return { tasks: hotTasks, count: hotTasks.length }
}

// ──────────────────────────────────────────────────────────
// Search Tasks
// ──────────────────────────────────────────────────────────
export async function searchTasks(query: string, limit = 10) {
  const supabase = await createClient()

  const { data: tasks, error } = await supabase
    .from('prediction_tasks')
    .select('id, title, question, description, status, created_at')
    .or('status.eq.resolved,status.eq.closed')
    .or(`title.ilike.%${query}%,question.ilike.%${query}%,description.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return null

  const results = await Promise.all(
    (tasks ?? []).map(async (task) => {
      const { count } = await supabase
        .from('signal_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)
      return {
        taskId:               task.id,
        title:                task.title,
        question:             task.question,
        summary:              (task.description || '').substring(0, 200) + '...',
        consensusProbability: 0,
        submissionCount:      count || 0,
        status:               task.status,
      }
    })
  )

  return { results, hasResults: results.length > 0 }
}

// ──────────────────────────────────────────────────────────
// Create Task（替换 create-quest Edge Function）
// ──────────────────────────────────────────────────────────
export interface CreateTaskInput {
  title: string
  question: string
  description: string
  resolution_criteria: string
  closes_at: string
  reward_pool: number
  funding_type?: 'direct' | 'crowdfunding'
  target_agent_count?: number
  task_category?: 'signal' | 'research'
  task_type?: 'consumer' | 'business'
  requires_nda?: boolean
  nda_text?: string
  visibility?: 'public' | 'private'
}

export async function createTask(input: CreateTaskInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '请先登录' }

  const { data: task, error } = await supabase
    .from('prediction_tasks')
    .insert({
      created_by:          user.id,
      title:               input.title,
      question:            input.question,
      description:         input.description,
      resolution_criteria: input.resolution_criteria,
      closes_at:           input.closes_at,
      reward_pool:         input.reward_pool,
      funding_type:        input.funding_type ?? 'direct',
      target_agent_count:  input.target_agent_count ?? 10,
      task_category:       input.task_category ?? 'signal',
      task_type:           input.task_type ?? 'consumer',
      requires_nda:        input.requires_nda ?? false,
      nda_text:            input.nda_text,
      status:              'pending',
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, task_id: task.id }
}
