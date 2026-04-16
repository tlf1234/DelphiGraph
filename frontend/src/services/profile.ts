import { createClient } from '@/lib/supabase/server'

export interface ProfileData {
  id: string
  username: string
  twitter_handle: string | null
  avatar_url: string | null
  api_key_hash: string | null
  reputation_score: number
  reputation_level: string
  total_earnings: number
  submission_count: number
  total_submissions: number
  correct_submissions: number
  win_streak: number
  status?: string
  is_banned?: boolean
  created_at: string
  niche_tags?: string[]
  accuracy_rate: number
  recent_submissions: unknown[]
  reputation_history: unknown[]
  is_top_agent: boolean
  accessible_private_tasks: number
}

export interface ProfileResult {
  profile: ProfileData
  is_own_profile: boolean
}

/**
 * 获取用户 profile 数据（含最近提交、信誉历史、顶级 Agent 判定）。
 * Server Component (page.tsx) 和 API route (route.ts) 共同使用，避免重复逻辑。
 *
 * @param targetId 要查询的用户 ID（不传则查当前登录用户）
 */
export async function fetchProfileData(targetId?: string): Promise<ProfileResult | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const resolvedId = targetId ?? user.id
  const isOwnProfile = resolvedId === user.id

  // 1. 基础 profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, twitter_handle, avatar_url, api_key_hash, reputation_score, reputation_level, total_earnings, submission_count, total_submissions, correct_submissions, win_streak, status, is_banned, created_at, niche_tags')
    .eq('id', resolvedId)
    .single()

  if (profileError || !profile) return null

  // 2. 最近提交 + 信誉历史（仅自己可见）
  let recentSubmissions: unknown[] = []
  let reputationHistory: unknown[] = []

  if (isOwnProfile) {
    const [subRes, histRes] = await Promise.all([
      supabase
        .from('signal_submissions')
        .select('id, submitted_at, brier_score, reward_earned, signals, task:prediction_tasks(id, title, status)')
        .eq('user_id', resolvedId)
        .order('submitted_at', { ascending: false })
        .limit(10),
      supabase
        .from('reputation_history')
        .select('id, change_amount, new_score, reason, created_at')
        .eq('agent_id', resolvedId)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    recentSubmissions = subRes.data ?? []
    reputationHistory = histRes.data ?? []
  }

  // 3. 是否顶级 Agent（信誉分前 10%）
  const [{ count: totalAgents }, { count: aboveCount }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active').gt('reputation_score', profile.reputation_score),
  ])
  const isTopAgent =
    totalAgents != null && aboveCount != null && totalAgents > 0 && aboveCount / totalAgents < 0.1

  // 4. 准确率
  const accuracyRate =
    profile.total_submissions > 0 ? profile.correct_submissions / profile.total_submissions : 0

  return {
    profile: {
      ...profile,
      accuracy_rate: accuracyRate,
      recent_submissions: recentSubmissions,
      reputation_history: reputationHistory,
      is_top_agent: isTopAgent,
      accessible_private_tasks: 0,
    },
    is_own_profile: isOwnProfile,
  }
}

/**
 * 为当前登录用户重新生成 API Key，并写回 profiles 表。
 * 返回新 key 字符串；未登录或写入失败返回 null。
 */
export async function regenerateUserApiKey(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const newKey = `dg_${crypto.randomUUID().replace(/-/g, '')}`
  const { error } = await supabase
    .from('profiles')
    .update({ api_key_hash: newKey })
    .eq('id', user.id)

  if (error) return null
  return newKey
}
