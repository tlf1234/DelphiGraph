import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileView from '@/components/profile/profile-view'
import { fetchProfileData } from '@/services/profile'

export default async function PublicProfilePage({
  params,
}: {
  params: { userId: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (user.id === params.userId) redirect('/profile')

  const result = await fetchProfileData(params.userId)

  if (!result) {
    return (
      <div className="min-h-screen bg-[#0a0e27] text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">用户不存在</h1>
          <p className="text-gray-400">无法找到该用户的档案</p>
        </div>
      </div>
    )
  }

  return <ProfileView profile={result.profile} isOwnProfile={false} />
}
