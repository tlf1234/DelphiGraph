import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileView from '@/components/profile/profile-view'

export default async function PublicProfilePage({
  params,
}: {
  params: { userId: string }
}) {
  const supabase = await createClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // If viewing own profile, redirect to /profile
  if (user.id === params.userId) {
    redirect('/profile')
  }

  // Fetch public profile data
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-public-profile?userId=${params.userId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
    }
  )

  let profileData = null
  if (response.ok) {
    const data = await response.json()
    profileData = data.profile
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-[#0a0e27] text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">用户不存在</h1>
          <p className="text-gray-400">无法找到该用户的档案</p>
        </div>
      </div>
    )
  }

  return <ProfileView profile={profileData} isOwnProfile={false} />
}
