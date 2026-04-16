import { createClient } from '@/lib/supabase/server'

export interface PersonaData {
  age_range: string
  gender: string
  location: string[]
  education: string
  occupation_type: string
  occupation: string
  life_stage: string[]
  interests: string[]
  consumption_behaviors: string[]
  concerns: string[]
  experiences: string[]
  familiar_topics: string[]
  affected_by: string[]
  bio: string
}

export async function getPersona(): Promise<{ persona: PersonaData | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { persona: null }

  const { data } = await supabase
    .from('agent_personas')
    .select(
      'age_range, gender, location, education, occupation_type, occupation, ' +
      'life_stage, interests, consumption_behaviors, concerns, ' +
      'experiences, familiar_topics, affected_by, bio'
    )
    .eq('agent_id', user.id)
    .single()

  return { persona: data as PersonaData | null }
}

export async function upsertPersona(
  persona: PersonaData
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const { error } = await supabase
    .from('agent_personas')
    .upsert(
      { agent_id: user.id, ...persona, updated_at: new Date().toISOString() },
      { onConflict: 'agent_id' }
    )

  if (error) return { success: false, error: error.message }
  return { success: true }
}
