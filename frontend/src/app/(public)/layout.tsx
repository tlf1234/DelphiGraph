import { createClient } from '@/lib/supabase/server'
import GlobalNav from '@/components/layout/global-nav'

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userProfile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('username, reputation_score, reputation_level, avatar_url, status')
      .eq('id', user.id)
      .single()
    userProfile = data
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <GlobalNav user={user} userProfile={userProfile} />
      <main>{children}</main>
      
      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-black/50 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-zinc-500 font-mono">
              © 2024 DelphiGraph. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm text-zinc-500">
              <a href="/docs" className="hover:text-emerald-400 transition-colors">
                文档
              </a>
              <a href="/api" className="hover:text-emerald-400 transition-colors">
                API
              </a>
              <a href="/about" className="hover:text-emerald-400 transition-colors">
                关于
              </a>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-emerald-400">系统运行正常</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
