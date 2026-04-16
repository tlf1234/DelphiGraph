/**
 * GET  /api/surveys  — 调查列表
 * POST /api/surveys  — 创建调查
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const serviceSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// ── GET /api/surveys ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const authSupa = await createServerClient()
    const { data: { user } } = await authSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const creatorOnly = searchParams.get('mine') === 'true'

    let q = serviceSupabase()
      .from('survey_tasks')
      .select('id, title, description, survey_type, status, response_count, target_agent_count, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (creatorOnly) q = q.eq('creator_id', user.id)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ surveys: data || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── POST /api/surveys ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authSupa = await createServerClient()
    const { data: { user } } = await authSupa.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const body = await request.json()
    const { title, description, survey_type, target_persona_filters, target_agent_count, funding_type, questions } = body

    if (!title?.trim()) return NextResponse.json({ error: '调查标题不能为空' }, { status: 400 })
    if (!questions?.length) return NextResponse.json({ error: '至少需要一道题目' }, { status: 400 })

    const supa = serviceSupabase()

    // 创建调查主记录
    const { data: survey, error: surveyErr } = await supa
      .from('survey_tasks')
      .insert({
        title:                  title.trim(),
        description:            description || null,
        survey_type:            survey_type || 'opinion',
        target_persona_filters: target_persona_filters || {},
        target_agent_count:     target_agent_count || 0,
        status:                 funding_type === 'direct' ? 'running' : 'draft',
        creator_id:             user.id,
      })
      .select()
      .single()

    if (surveyErr || !survey) {
      return NextResponse.json({ error: surveyErr?.message || '创建失败' }, { status: 500 })
    }

    // 批量创建题目
    const questionRows = (questions as any[]).map((q: any, idx: number) => ({
      survey_id:      survey.id,
      question_order: q.question_order ?? idx + 1,
      question_text:  q.question_text,
      question_type:  q.question_type || 'single_choice',
      options:        q.options || [],
      rating_min:     q.rating_min ?? 1,
      rating_max:     q.rating_max ?? 10,
      is_required:    q.is_required ?? true,
    }))

    const { data: createdQuestions, error: qErr } = await supa
      .from('survey_questions')
      .insert(questionRows)
      .select()

    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 })
    }

    return NextResponse.json({ survey, questions: createdQuestions }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
