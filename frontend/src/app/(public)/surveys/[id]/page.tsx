import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import SurveyDetailClient from './survey-detail-client'

export default async function SurveyDetailPage({ params }: { params: { id: string } }) {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [surveyRes, questionsRes, analysesRes, responsesRes] = await Promise.all([
    supa.from('surveys').select('*').eq('id', params.id).maybeSingle(),
    supa.from('survey_questions').select('*').eq('survey_id', params.id).order('question_order'),
    supa.from('survey_analyses').select('*').eq('survey_id', params.id),
    supa.from('survey_responses')
      .select('id, question_id, agent_persona, answer, rationale, confidence')
      .eq('survey_id', params.id)
      .order('submitted_at', { ascending: true })
      .limit(200),
  ])

  if (!surveyRes.data) notFound()

  return (
    <SurveyDetailClient
      survey={surveyRes.data}
      questions={questionsRes.data || []}
      analyses={analysesRes.data || []}
      responses={responsesRes.data || []}
    />
  )
}
