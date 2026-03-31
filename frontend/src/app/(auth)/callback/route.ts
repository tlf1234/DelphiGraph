import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // 成功登录后，检查是否需要创建用户档案
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // 检查用户档案是否存在
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single()

        // 如果档案不存在，创建新档案
        if (!profile) {
          const username = user.user_metadata?.user_name || user.email?.split('@')[0] || 'user'
          const twitterHandle = user.user_metadata?.user_name
            ? `@${user.user_metadata.user_name}`
            : null

          // 生成API Key（临时使用UUID，实际应该调用Edge Function）
          const apiKey = crypto.randomUUID()
          const apiKeyHash = apiKey // 实际应该使用bcrypt加密

          await supabase.from('profiles').insert({
            id: user.id,
            username,
            twitter_handle: twitterHandle,
            avatar_url: user.user_metadata?.avatar_url,
            api_key_hash: apiKeyHash,
          })
        }
      }

      // 登录成功后跳转到搜索首页（Search the Future）
      return NextResponse.redirect(`${origin}/`)
    }
  }

  // 如果出错，重定向到登录页
  return NextResponse.redirect(`${origin}/login`)
}
