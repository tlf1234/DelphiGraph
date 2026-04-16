/**
 * POST /api/test/survey-prepare
 * Reuse existing SimAgents, clear survey_responses + survey_analyses, reset survey status.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SIM_EMAIL_DOMAIN = 'sim.delphi.internal'

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey)
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceKey)

  let survey_id: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    survey_id = body?.survey_id || null
  } catch { /* ignore */ }

  if (!survey_id)
    return NextResponse.json({ error: 'Missing survey_id' }, { status: 400 })

  console.log(`[survey-prepare] survey_id: ${survey_id}`)

  // ── Verify survey exists ─────────────────────────────────────────────
  const { data: survey } = await admin
    .from('survey_tasks')
    .select('id, status, title')
    .eq('id', survey_id)
    .maybeSingle()
  if (!survey) return NextResponse.json({ error: 'Survey not found' }, { status: 404 })

  // ── Clear historical responses + analyses ───────────────────────────
  await admin.from('survey_responses').delete().eq('survey_id', survey_id)
  await admin.from('survey_analyses').delete().eq('survey_id', survey_id)
  await admin
    .from('survey_tasks')
    .update({ status: 'draft', response_count: 0, started_at: null, completed_at: null })
    .eq('id', survey_id)
  console.log(`[survey-prepare] Cleared responses/analyses, reset status→draft`)

  // ── Fetch existing SimAgents ─────────────────────────────────────────
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .ilike('username', 'SimAgent%')
    .limit(100)

  if (profiles && profiles.length >= 20) {
    console.log(`[survey-prepare] Reusing ${profiles.length} SimAgents`)
    return NextResponse.json({
      agents: profiles.map(p => ({ id: p.id, username: p.username })),
      reused: true,
    })
  }

  // ── Fallback: fetch by email domain ─────────────────────────────────
  const { data: { users } = { users: [] } } = await admin.auth.admin.listUsers({ perPage: 500 })
  const simUsers = (users || []).filter(u => u.email?.endsWith(`@${SIM_EMAIL_DOMAIN}`))

  if (simUsers.length >= 20) {
    const agentList = simUsers.slice(0, 100).map(u => ({
      id: u.id,
      username: (u.user_metadata?.username as string) || u.email?.split('@')[0] || u.id.slice(0, 8),
    }))
    console.log(`[survey-prepare] Found ${agentList.length} SimAgents via auth`)
    return NextResponse.json({ agents: agentList, reused: true })
  }

  return NextResponse.json(
    { error: 'No SimAgents found. Run the signal simulate test first to create agents.' },
    { status: 404 },
  )
}
