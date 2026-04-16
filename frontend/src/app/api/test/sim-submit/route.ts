// ══════════════════════════════════════════════════════════════
// API 路由：/api/test/sim-submit
// ══════════════════════════════════════════════════════════════
// 功能：接受插件仿真提交的信号数据，使用自定义 user_id 直接插入数据库
// 用途：模拟多 Agent 场景，每个 Agent 有独立身份（不依赖 API Key 认证）
// 请求方法：POST
// 请求体：{
//   task_id:      string,
//   user_id:      string,        // 仿真 Agent 的唯一 UUID
//   signals:      Signal[],      // 插件生成的信号数组
//   user_persona: object,        // 用户画像
//   status?:      string,        // 默认 'submitted'
//   plugin_version?: string,
//   protocol_version?: string,
//   model_name?: string,
// }
// 响应：{ success: true, submission_id: string }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      task_id,
      user_id,
      signals,
      user_persona,
      status = 'submitted',
      submitted_at,
      plugin_version,
      protocol_version,
      model_name,
    } = body

    console.log(`[test/sim-submit] ▶ POST user_id=${user_id?.slice(0, 8)}... task_id=${task_id?.slice(0, 8)}... signals=${signals?.length}`)

    // 参数验证
    if (!task_id || !user_id || !signals || !Array.isArray(signals) || signals.length === 0) {
      console.error('[test/sim-submit] ❌ Missing required fields', { task_id: !!task_id, user_id: !!user_id, signals: signals?.length })
      return NextResponse.json(
        { error: 'Missing required fields: task_id, user_id, signals' },
        { status: 400 }
      )
    }

    // 使用 service role key 绕过 RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 验证任务存在
    const { data: task, error: taskErr } = await supabase
      .from('prediction_tasks')
      .select('id, status')
      .eq('id', task_id)
      .single()

    if (!task || taskErr) {
      console.error('[test/sim-submit] ❌ Task not found:', taskErr?.message)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // 验证 user_id 在 profiles 表中存在（外键约束: signal_submissions.user_id → profiles.id → auth.users.id）
    // 插件必须先调用 /api/test/prepare 获取已创建的 Agent ID
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .maybeSingle()

    if (!existingProfile) {
      console.error(`[test/sim-submit] ❌ user_id ${user_id.slice(0, 8)}... not found in profiles. Call /api/test/prepare first.`)
      return NextResponse.json(
        { error: 'user_id not found in profiles. Call /api/test/prepare first to create sim agents.' },
        { status: 400 }
      )
    }

    // 插入 signal_submissions
    const insertData: Record<string, unknown> = {
      task_id,
      user_id,
      status,
      signals,
      user_persona: user_persona || null,
      submitted_at: submitted_at || new Date().toISOString(),
    }
    if (plugin_version) insertData.plugin_version = plugin_version
    if (protocol_version) insertData.protocol_version = protocol_version
    if (model_name) insertData.model_name = model_name

    const { data: inserted, error: insertErr } = await supabase
      .from('signal_submissions')
      .insert(insertData)
      .select('id')
      .single()

    if (insertErr) {
      console.error('[test/sim-submit] ❌ Insert failed:', insertErr.message)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    console.log(`[test/sim-submit] ✅ Agent ${user_id.slice(0, 8)}... → ${signals.length} signals, id=${inserted?.id}`)

    return NextResponse.json({
      success: true,
      submission_id: inserted?.id,
    })
  } catch (error) {
    console.error('[test/sim-submit] ❌ Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
