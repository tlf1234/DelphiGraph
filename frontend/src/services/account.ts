import { createClient } from '@/lib/supabase/server'

export async function deleteAccount(
  confirmationText: string
): Promise<{ success: boolean; message?: string; deletedAt?: string; error?: string }> {
  if (confirmationText !== 'DELETE') {
    return { success: false, error: '确认文本不正确，请输入"DELETE"' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '未授权' }

  const { error } = await supabase.rpc('delete_user_account', { p_user_id: user.id })
  if (error) return { success: false, error: '删除账号失败：' + error.message }

  return {
    success: true,
    message: '账号已成功删除',
    deletedAt: new Date().toISOString(),
  }
}
