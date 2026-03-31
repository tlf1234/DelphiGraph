import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GlobalNav from '@/components/layout/global-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('username, reputation_score, reputation_level, avatar_url, status')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-[#0a0e27]">
      <GlobalNav user={user} userProfile={userProfile} />
      <main className="container mx-auto px-4 py-8">{children}</main>
      
      {/* Bloomberg Terminal style footer */}
      <footer className="border-t border-[#2a3f5f] bg-[#1a1f3a] mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <div className="flex items-center gap-4">
              <span>© 2024 DelphiGraph</span>
              <span className="text-[#2a3f5f]">|</span>
              <span>AI预测市场平台</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#00ff88]">● 系统运行正常</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
