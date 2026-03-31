/**
 * GET /api/predictions/[taskId]
 * Fetches all predictions for a market using service role (bypasses RLS).
 * Used by the causal graph viewer to render the agent/signal layers.
 * Requires an authenticated session (validated before responding).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { taskId } = params
  try {
    // Verify the caller is authenticated
    const authSupabase = await createServerClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    // Fetch predictions via service role (bypasses the user-scoped RLS)
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: predictions, error } = await serviceSupabase
      .from('predictions')
      .select(
        'id, user_id, probability, rationale, evidence_type, relevance_score, ' +
        'entity_tags, source_url, submitted_at, ' +
        'profiles(id, username, avatar_url, reputation_score, persona_region, persona_gender, persona_age_range, persona_occupation, persona_interests)'
      )
      .eq('task_id', taskId)
      .order('submitted_at', { ascending: true })

    if (error) {
      console.error('[api/predictions GET] query error:', error.message, '| code:', error.code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 🔍 DEBUG: 打印前3条 prediction 的 profiles 字段，排查画像数据问题
    const sample = (predictions || []).slice(0, 3)
    sample.forEach((p: any, i) => {
      const prof = p.profiles
      console.log(`[api/predictions GET] [${i}] user_id=${p.user_id}`)
      console.log(`[api/predictions GET] [${i}] profiles type=${Array.isArray(prof) ? 'array' : typeof prof} value=`, JSON.stringify(prof)?.slice(0, 200))
    })
    console.log(`[api/predictions GET] total predictions: ${predictions?.length ?? 0}`)

    return NextResponse.json({ predictions: predictions || [] })
  } catch (err) {
    console.error('[api/predictions GET] unexpected:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
