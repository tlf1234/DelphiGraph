import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileView from '@/components/profile/profile-view'

export default async function MyProfilePage() {
  const supabase = await createClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile data
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-profile`,
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
          <h1 className="text-2xl font-bold text-red-400 mb-2">加载失败</h1>
          <p className="text-gray-400">无法加载用户档案</p>
        </div>
      </div>
    )
  }

  return <ProfileView profile={profileData} isOwnProfile={true} />
}
