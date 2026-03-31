import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApiKeyManager from '@/components/settings/api-key-manager'
import DeleteAccount from '@/components/settings/delete-account'
import { NicheTagsManager } from '@/components/settings/niche-tags-manager'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 获取用户档案
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-8">设置</h1>

        <div className="space-y-8">
          {/* 用户信息 */}
          <section className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">用户信息</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">用户名</label>
                <p className="text-lg">{profile?.username}</p>
              </div>
              {profile?.twitter_handle && (
                <div>
                  <label className="text-sm text-muted-foreground">Twitter</label>
                  <p className="text-lg">{profile.twitter_handle}</p>
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground">信誉分</label>
                <p className="text-lg">{profile?.reputation_score}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">总收益</label>
                <p className="text-lg">¥{profile?.total_earnings}</p>
              </div>
            </div>
          </section>

          {/* API Key管理 */}
          <section className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">API Key 管理</h2>
            <p className="text-sm text-muted-foreground mb-4">
              使用API Key连接您的本地Agent到DelphiGraph平台
            </p>
            <ApiKeyManager userId={user.id} />
          </section>

          {/* 专业领域设置 */}
          <section className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">专业领域设置</h2>
            <p className="text-sm text-muted-foreground mb-6">
              选择您擅长的专业领域，系统将为您智能匹配相关任务
            </p>
            <NicheTagsManager userId={user.id} initialTags={profile?.niche_tags} />
          </section>

          {/* 删除账号 */}
          <section>
            <DeleteAccount userId={user.id} />
          </section>
        </div>
      </div>
    </div>
  )
}
