import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EarningsView from '@/components/earnings/earnings-view'

export default async function EarningsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <EarningsView />
}
