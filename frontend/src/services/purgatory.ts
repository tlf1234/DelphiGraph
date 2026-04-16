import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface PurgatoryPageData {
  profile: {
    status: string
    redemption_streak: number
    reputation_score: number
    purgatory_entered_at: string | null
    purgatory_reason: string | null
    username: string
  } | null
  purgatoryUsers: unknown[]
  purgatoryCount: number
  recentlyRedeemed: Array<{
    user_id: string
    created_at: string
    streak_after: number
    reputation_after: number
    profiles: { username: string; avatar_url: string | null } | null
  }>
}

export async function fetchPurgatoryPageData(): Promise<PurgatoryPageData> {
  const supabase    = await createClient()
  const svc         = serviceClient()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: { user } } = await supabase.auth.getUser()

  // Get user profile if logged in
  let profile: PurgatoryPageData['profile'] = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('status, redemption_streak, reputation_score, purgatory_entered_at, purgatory_reason, username')
      .eq('id', user.id)
      .single()
    profile = data as PurgatoryPageData['profile']
  }

  // Get purgatory statistics (public data — use service role to bypass RLS)
  const { data: purgatoryUsers, count: purgatoryCount } = await svc
    .from('profiles')
    .select('id, username, avatar_url, reputation_score, redemption_streak, purgatory_entered_at, purgatory_reason', { count: 'exact' })
    .eq('status', 'restricted')
    .order('redemption_streak', { ascending: false })
    .limit(20)

  // Get recently redeemed users (last 7 days)
  const { data: recentlyRedeemed } = await svc
    .from('redemption_attempts')
    .select(`
      user_id,
      created_at,
      streak_after,
      reputation_after,
      profiles!inner(username, avatar_url)
    `)
    .eq('is_correct', true)
    .gte('streak_after', 5)
    .gte('reputation_after', 60)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  // Transform to expected type (profiles may be array or object depending on Supabase version)
  const transformedRedeemed = (recentlyRedeemed ?? []).map((item: Record<string, unknown>) => ({
    user_id:        item.user_id as string,
    created_at:     item.created_at as string,
    streak_after:   item.streak_after as number,
    reputation_after: item.reputation_after as number,
    profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles as { username: string; avatar_url: string | null } | null,
  }))

  return {
    profile,
    purgatoryUsers:   purgatoryUsers ?? [],
    purgatoryCount:   purgatoryCount ?? 0,
    recentlyRedeemed: transformedRedeemed,
  }
}

export async function getCalibrationTasks() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 找出用户已经尝试过的任务 ID
  const { data: attempted } = await supabase
    .from('redemption_attempts')
    .select('task_id')
    .eq('user_id', user.id)

  const attemptedIds = (attempted ?? []).map((a: { task_id: string }) => a.task_id)

  // 查询尚未尝试的校准任务
  let query = supabase
    .from('calibration_tasks')
    .select('id, title, description, question, difficulty, category, historical_date, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (attemptedIds.length > 0) {
    query = query.not('id', 'in', `(${attemptedIds.join(',')})`)
  }

  const { data: tasks, error } = await query
  if (error) return null

  return { tasks: tasks ?? [] }
}

export async function submitCalibrationAnswer(
  taskId: string,
  answer: boolean,
  rationale?: string
): Promise<{ success: boolean; is_correct?: boolean; reputation_change?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  // 获取校准任务
  const { data: task, error: taskError } = await supabase
    .from('calibration_tasks')
    .select('correct_answer')
    .eq('id', taskId)
    .single()

  if (taskError || !task) return { success: false, error: '任务不存在' }

  // 检查是否已提交
  const { data: existing } = await supabase
    .from('redemption_attempts')
    .select('id')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .maybeSingle()

  if (existing) return { success: false, error: '已经提交过此任务' }

  const isCorrect   = answer === (task as { correct_answer: boolean }).correct_answer
  const repChange   = isCorrect ? 20 : -10

  // 获取当前信誉分和连胜
  const { data: profile } = await supabase
    .from('profiles')
    .select('reputation_score, win_streak')
    .eq('id', user.id)
    .single()

  const repBefore    = (profile as { reputation_score: number; win_streak: number } | null)?.reputation_score ?? 0
  const streakBefore = (profile as { reputation_score: number; win_streak: number } | null)?.win_streak ?? 0
  const repAfter     = Math.max(0, repBefore + repChange)
  const streakAfter  = isCorrect ? streakBefore + 1 : 0

  // 插入救赎尝试记录
  const { error: insertError } = await supabase
    .from('redemption_attempts')
    .insert({
      user_id:          user.id,
      task_id:          taskId,
      answer,
      rationale,
      is_correct:       isCorrect,
      reputation_before: repBefore,
      reputation_after:  repAfter,
      reputation_change: repChange,
      streak_before:     streakBefore,
      streak_after:      streakAfter,
    })

  if (insertError) return { success: false, error: insertError.message }

  // 更新用户信誉分和连胜
  await supabase
    .from('profiles')
    .update({ reputation_score: repAfter, win_streak: streakAfter })
    .eq('id', user.id)

  return { success: true, is_correct: isCorrect, reputation_change: repChange }
}
