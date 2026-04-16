/**
 * POST /api/surveys/[id]/run — 触发 Agent 作答 + 聚合分析
 * 调用 Python survey_engine 服务
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const CAUSAL_ENGINE_URL = process.env.CAUSAL_ENGINE_URL || 'http://localhost:8100'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authSupa = await createServerClient()
    const { data: { user } } = await authSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const surveyId = params.id
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: survey } = await supa
      .from('survey_tasks')
      .select('creator_id, status')
      .eq('id', surveyId)
      .maybeSingle()

    if (!survey) return NextResponse.json({ error: '调查不存在' }, { status: 404 })
    if (survey.creator_id !== user.id) return NextResponse.json({ error: '无权限' }, { status: 403 })
    if (survey.status === 'running') return NextResponse.json({ error: '调查正在运行中' }, { status: 409 })
    if (survey.status === 'completed') return NextResponse.json({ error: '调查已完成，请重新创建' }, { status: 400 })

    const res = await fetch(`${CAUSAL_ENGINE_URL}/api/surveys/${surveyId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: errBody.detail || '调查引擎调用失败' },
        { status: res.status },
      )
    }

    const result = await res.json()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/surveys/[id]/run] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
