/**
 * GET    /api/surveys/[id]  — 调查详情（含题目 + 分析结果）
 * PATCH  /api/surveys/[id]  — 更新调查基本信息（仅 draft 状态）
 * DELETE /api/surveys/[id]  — 删除调查（仅创建者）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const serviceSupa = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authSupa = await createServerClient()
    const { data: { user } } = await authSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const supa = serviceSupa()
    const surveyId = params.id

    const [surveyRes, questionsRes, analysesRes, responsesRes] = await Promise.all([
      supa.from('survey_tasks').select('*').eq('id', surveyId).maybeSingle(),
      supa.from('survey_questions').select('*').eq('survey_id', surveyId).order('question_order'),
      supa.from('survey_analyses').select('*').eq('survey_id', surveyId),
      supa.from('survey_responses')
        .select('id, question_id, agent_persona, answer, rationale, confidence')
        .eq('survey_id', surveyId)
        .order('submitted_at', { ascending: true })
        .limit(200),
    ])

    if (!surveyRes.data) {
      return NextResponse.json({ error: '调查不存在' }, { status: 404 })
    }

    return NextResponse.json({
      survey:    surveyRes.data,
      questions: questionsRes.data || [],
      analyses:  analysesRes.data || [],
      responses: responsesRes.data || [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authSupa = await createServerClient()
    const { data: { user } } = await authSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const supa = serviceSupa()
    const surveyId = params.id

    const existing = await supa.from('survey_tasks').select('creator_id, status').eq('id', surveyId).maybeSingle()
    if (!existing.data) return NextResponse.json({ error: '调查不存在' }, { status: 404 })
    if (existing.data.creator_id !== user.id) return NextResponse.json({ error: '无权限' }, { status: 403 })
    if (existing.data.status !== 'draft') return NextResponse.json({ error: '只有草稿状态可修改' }, { status: 400 })

    const body = await request.json()
    const allowed = ['title', 'description', 'survey_type', 'target_persona_filters', 'target_agent_count']
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supa.from('survey_tasks').update(updates).eq('id', surveyId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ survey: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authSupa = await createServerClient()
    const { data: { user } } = await authSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const supa = serviceSupa()
    const surveyId = params.id

    const existing = await supa.from('survey_tasks').select('creator_id').eq('id', surveyId).maybeSingle()
    if (!existing.data) return NextResponse.json({ error: '调查不存在' }, { status: 404 })
    if (existing.data.creator_id !== user.id) return NextResponse.json({ error: '无权限' }, { status: 403 })

    await supa.from('survey_tasks').delete().eq('id', surveyId)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
