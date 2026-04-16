import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/agent/signals 的请求体结构（UAP v3.0）
 * {
 *   task_id: string,                   // 必填
 *   status: 'submitted' | 'abstained', // 必填
 *   privacy_cleared: true,             // 必填，必须为 true
 *   protocol_version: '3.0',           // 建议填写
 *   signals: Array<{                   // 非弃权时必填
 *     signal_id?: string,
 *     evidence_type: 'hard_fact' | 'persona_inference',
 *     source_type?: string,
 *     data_exclusivity?: 'public' | 'semi_private' | 'private',
 *     source_description?: string,     // UAP v3.0 数据源描述
 *     observed_at?: string,            // UAP v3.0 观察时间 (ISO 8601)
 *     evidence_text: string,           // 必填
 *     relevance_reasoning?: string,
 *     relevance_score?: number,
 *     source_urls?: string[],
 *     entity_tags?: Array<{ text: string; type: string; role: string }>
 *   }>,
 *   abstain_reason?: string,           // 弃权时可填
 *   abstain_detail?: string,
 *   user_persona?: Record<string, unknown>,
 *   model_name?: string,
 *   plugin_version?: string
 * }
 */
export interface SignalInput {
  task_id?: string
  taskId?: string
  status?: string
  abstain?: boolean
  signals?: Array<{
    signal_id?: string
    evidence_type?: string
    source_type?: string
    data_exclusivity?: string
    source_description?: string    // UAP v3.0 数据源描述
    observed_at?: string          // UAP v3.0 观察时间
    evidence_text?: string
    relevance_reasoning?: string
    relevance_score?: number
    source_urls?: string[]
    entity_tags?: Array<{ text: string; type: string; role: string }>
  }>
  abstain_reason?: string
  abstain_detail?: string
  user_persona?: Record<string, unknown>
  model_name?: string
  plugin_version?: string
  privacy_cleared?: boolean
  protocol_version?: string
}

export type SubmitSignalResult =
  | { success: true; submission_id: string; timestamp: string; signal_count: number }
  | { success: false; error: string; status: number }

export async function submitAgentSignal(
  apiKey: string,
  body: SignalInput
): Promise<SubmitSignalResult> {
  const supabase = serviceClient()

  // 验证 API Key
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, status, daily_submission_count, daily_reset_at')
    .eq('api_key_hash', apiKey)
    .single()

  if (profileError || !profile) return { success: false, error: 'Invalid API key', status: 401 }

  const p = profile as {
    id: string
    status: string
    daily_submission_count: number
    daily_reset_at: string | null
  }

  if (p.status === 'restricted') return { success: false, error: 'Account restricted', status: 403 }

  // 解析字段：兼容插件 v3.0（task_id, status）和旧格式（taskId, abstain）
  const taskId        = body.taskId || body.task_id
  const signals       = body.signals
  const abstain       = body.abstain === true || body.status === 'abstained'
  const privacyCleared = body.privacy_cleared

  if (!taskId) return { success: false, error: 'task_id is required', status: 400 }

  // UAP v3.0 要求 privacy_cleared 必须为 true
  if (privacyCleared !== true) return { success: false, error: 'privacy_cleared must be true (UAP v3.0)', status: 400 }

  // 非弃权时 signals 数组不能为空，且每条信号必须有 evidence_text
  if (!abstain) {
    if (!signals || !Array.isArray(signals) || signals.length === 0) {
      return { success: false, error: 'signals array is required for non-abstain submissions', status: 400 }
    }
    const invalidSignal = signals.find(s => !s.evidence_text)
    if (invalidSignal) return { success: false, error: 'Each signal must have evidence_text', status: 400 }
  }

  // 验证任务状态
  const { data: task, error: taskError } = await supabase
    .from('prediction_tasks')
    .select('id, status, target_agent_count')
    .eq('id', taskId)
    .single()

  if (taskError || !task) return { success: false, error: 'Task not found', status: 404 }

  const t = task as { id: string; status: string; target_agent_count: number }
  // tasks/route.ts 返回 pending 和 active 两种状态的任务，两者均可提交
  if (!['pending', 'active'].includes(t.status)) {
    return { success: false, error: `Task is ${t.status}, not accepting signals`, status: 400 }
  }

  // TODO: 重复提交检查 - 模拟测试期间临时屏蔽，测试完成后恢复
  // const { data: existing } = await supabase
  //   .from('signal_submissions')
  //   .select('id')
  //   .eq('task_id', taskId)
  //   .eq('user_id', p.id)
  //   .maybeSingle()
  // if (existing) {
  //   return { success: false, error: 'Already submitted for this task', status: 409 }
  // }

  // 构建提交数据
  const insertData: Record<string, unknown> = {
    task_id:  taskId,
    user_id:  p.id,
    status:   abstain ? 'abstained' : 'submitted',
    signals:  abstain ? [] : (signals || []).map(sig => ({
      signal_id:          sig.signal_id || `sig_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
      evidence_type:      sig.evidence_type || 'persona_inference',
      source_type:        sig.source_type || '',
      data_exclusivity:   sig.data_exclusivity || 'public',
      source_description: sig.source_description || '',           // UAP v3.0 新增
      observed_at:        sig.observed_at || new Date().toISOString(), // UAP v3.0 新增
      evidence_text:      sig.evidence_text || '',
      relevance_reasoning: sig.relevance_reasoning || '',
      relevance_score:    sig.relevance_score ?? 0.5,
      source_urls:        sig.source_urls || [],
      entity_tags:        sig.entity_tags || [],
    })),
  }

  if (abstain && body.abstain_reason) insertData.abstain_reason = body.abstain_reason
  if (abstain && body.abstain_detail) insertData.abstain_detail = body.abstain_detail
  if (body.user_persona)   insertData.user_persona    = body.user_persona
  if (body.model_name)     insertData.model_name      = body.model_name
  if (body.plugin_version) insertData.plugin_version  = body.plugin_version
  if (privacyCleared !== undefined) insertData.privacy_cleared = privacyCleared
  if (body.protocol_version) insertData.protocol_version = body.protocol_version

  const { data: submission, error: insertError } = await supabase
    .from('signal_submissions')
    .insert(insertData)
    .select('id, submitted_at')
    .single()

  if (insertError) {
    console.error('[agent-signals] Insert error:', insertError)
    return { success: false, error: insertError.message, status: 500 }
  }

  const sub = submission as { id: string; submitted_at: string }

  // 参与者达到目标数时直接触发因果推理
  if (!abstain && t.target_agent_count) {
    const { data: updatedTask } = await supabase
      .from('prediction_tasks')
      .select('current_participant_count, causal_analysis_status')
      .eq('id', taskId)
      .single()

    const ut = updatedTask as { current_participant_count: number; causal_analysis_status: string } | null
    if (
      ut &&
      ut.current_participant_count >= t.target_agent_count &&
      !['processing', 'pending'].includes(ut.causal_analysis_status ?? '')
    ) {
      const backendApiUrl = process.env.BACKEND_API_URL
      if (backendApiUrl) {
        fetch(`${backendApiUrl}/api/causal-analysis/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId }),
        }).catch(err => console.warn('[agent-signals] Failed to trigger causal analysis:', err))
      }
    }
  }

  // 更新每日计数
  const now       = new Date()
  const lastReset = p.daily_reset_at ? new Date(p.daily_reset_at) : new Date(0)
  const isSameDay = now.toDateString() === lastReset.toDateString()
  const dailyCount = isSameDay ? (p.daily_submission_count || 0) : 0

  await supabase
    .from('profiles')
    .update({
      daily_submission_count: dailyCount + 1,
      ...(isSameDay ? {} : { daily_reset_at: now.toISOString() }),
    })
    .eq('id', p.id)

  return {
    success:      true,
    submission_id: sub.id,
    timestamp:    sub.submitted_at,
    signal_count: abstain ? 0 : (signals || []).length,
  }
}
