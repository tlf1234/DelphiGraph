import { createClient } from '@/lib/supabase/server'
import PurgatoryView from '@/components/purgatory/purgatory-view'
import PurgatoryPublicView from '@/components/purgatory/purgatory-public-view'

export default async function PurgatoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user profile if logged in
  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('status, redemption_streak, reputation_score, purgatory_entered_at, purgatory_reason, username')
      .eq('id', user.id)
      .single()
    profile = data
  }

  // Get purgatory statistics
  const { data: purgatoryUsers, count: purgatoryCount } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, reputation_score, redemption_streak, purgatory_entered_at, purgatory_reason', { count: 'exact' })
    .eq('status', 'restricted')
    .order('redemption_streak', { ascending: false })
    .limit(20)

  // Get recently redeemed users (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const { data: recentlyRedeemed } = await supabase
    .from('redemption_attempts')
    .select(`
      user_id,
      created_at,
      streak_after,
      reputation_after,
      profiles!inner(username, avatar_url)
    `)
    .eq('is_correct', true)
    .gte('streak_after', 5)
    .gte('reputation_after', 60)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  // Transform the data to match the expected type
  const transformedRedeemed = recentlyRedeemed?.map(item => ({
    user_id: item.user_id,
    created_at: item.created_at,
    streak_after: item.streak_after,
    reputation_after: item.reputation_after,
    profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
  })) || []

  // If user is in purgatory, show their personal view
  if (profile && profile.status === 'restricted') {
    return (
      <PurgatoryView 
        profile={profile} 
        purgatoryUsers={purgatoryUsers || []}
        purgatoryCount={purgatoryCount || 0}
      />
    )
  }

  // If user is not in purgatory or not logged in, show public view
  return (
    <PurgatoryPublicView
      currentUser={profile}
      purgatoryUsers={purgatoryUsers || []}
      purgatoryCount={purgatoryCount || 0}
      recentlyRedeemed={transformedRedeemed}
    />
  )
}
