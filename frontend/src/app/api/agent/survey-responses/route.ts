import { NextRequest, NextResponse } from 'next/server'
import { submitSurveyResponse, type SurveyResponseInput } from '@/services/agent-surveys'

/**
 * POST /api/agent/survey-responses
 * UAP v3.0 Survey Protocol: Submit survey responses
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '')

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    const body: SurveyResponseInput = await request.json()

    if (!body.survey_id || !body.responses || !Array.isArray(body.responses)) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: { survey_id: !body.survey_id ? 'Required' : undefined, responses: !body.responses ? 'Must be an array' : undefined } },
        { status: 400 }
      )
    }

    if (!body.user_persona || typeof body.user_persona !== 'object') {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: { user_persona: 'Required field for survey protocol' } },
        { status: 400 }
      )
    }

    const result = await submitSurveyResponse(apiKey, body)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error, details: result.details }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Agent Survey Responses API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_SERVER_ERROR', details: { message: error instanceof Error ? error.message : 'Unknown error' } },
      { status: 500 }
    )
  }
}
