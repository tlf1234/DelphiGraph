import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  fetchMarketSearchTasks,
  fetchMarketSearchSurveys,
  fetchMarketSearchAgentProfile,
} from '@/services/surveys'

// GET /api/market-search?type=tasks|surveys|profile
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    if (type === 'tasks') {
      console.log('[market-search] querying tasks...')
      const tasks = await fetchMarketSearchTasks()
      console.log('[market-search] tasks rows:', tasks.length)
      return NextResponse.json({ tasks })
    }

    if (type === 'surveys') {
      console.log('[market-search] querying surveys...')
      const surveys = await fetchMarketSearchSurveys()
      console.log('[market-search] surveys rows:', surveys.length)
      return NextResponse.json({ surveys })
    }

    if (type === 'profile') {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ profile: null })

      const profile = await fetchMarketSearchAgentProfile(user.id)
      return NextResponse.json({ profile })
    }

    return NextResponse.json({ error: 'type param required (tasks|surveys|profile)' }, { status: 400 })
  } catch (error) {
    console.error('[market-search] error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
