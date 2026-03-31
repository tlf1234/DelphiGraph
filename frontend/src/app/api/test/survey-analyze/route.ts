/**
 * POST /api/test/survey-analyze
 * Trigger the Python survey engine to analyze responses (bypasses auth check).
 * Body: { survey_id }
 */
import { NextRequest, NextResponse } from 'next/server'

const CAUSAL_ENGINE_URL = process.env.CAUSAL_ENGINE_URL || 'http://localhost:8100'

export async function POST(request: NextRequest) {
  let survey_id: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    survey_id = body?.survey_id || null
  } catch { /* ignore */ }

  if (!survey_id)
    return NextResponse.json({ error: 'Missing survey_id' }, { status: 400 })

  console.log(`[survey-analyze] Triggering engine for ${survey_id}`)

  try {
    const res = await fetch(`${CAUSAL_ENGINE_URL}/api/surveys/${survey_id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      const rawText = await res.text().catch(() => '')
      console.error(`[survey-analyze] Engine ${res.status} — raw body: ${rawText.slice(0, 500)}`)
      let msg = `HTTP ${res.status}`
      try { const j = JSON.parse(rawText); msg = j.detail || j.error || msg } catch { /* ignore */ }
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const result = await res.json().catch(() => ({}))
    console.log(`[survey-analyze] Engine accepted task`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[survey-analyze] Fetch error:', err)
    return NextResponse.json({ error: String(err) }, { status: 503 })
  }
}
