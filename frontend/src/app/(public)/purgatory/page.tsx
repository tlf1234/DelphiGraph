import PurgatoryView from '@/components/purgatory/purgatory-view'
import PurgatoryPublicView from '@/components/purgatory/purgatory-public-view'
import { fetchPurgatoryPageData } from '@/services/purgatory'

export default async function PurgatoryPage() {
  const { profile, purgatoryUsers, purgatoryCount, recentlyRedeemed } = await fetchPurgatoryPageData()

  // If user is in purgatory, show their personal view
  if (profile && profile.status === 'restricted') {
    return (
      <PurgatoryView
        profile={profile as never}
        purgatoryUsers={purgatoryUsers as never}
        purgatoryCount={purgatoryCount || 0}
      />
    )
  }

  // If user is not in purgatory or not logged in, show public view
  return (
    <PurgatoryPublicView
      currentUser={profile as never}
      purgatoryUsers={purgatoryUsers as never}
      purgatoryCount={purgatoryCount || 0}
      recentlyRedeemed={recentlyRedeemed as never}
    />
  )
}
