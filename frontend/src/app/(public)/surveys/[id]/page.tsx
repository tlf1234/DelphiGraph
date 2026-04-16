import { notFound } from 'next/navigation'
import SurveyDetailClient from './survey-detail-client'
import { fetchSurveyDetail } from '@/services/surveys'

export default async function SurveyDetailPage({ params }: { params: { id: string } }) {
  const data = await fetchSurveyDetail(params.id)

  if (!data) notFound()

  return (
    <SurveyDetailClient
      survey={data.survey}
      questions={data.questions}
      analyses={data.analyses}
      responses={data.responses}
    />
  )
}
