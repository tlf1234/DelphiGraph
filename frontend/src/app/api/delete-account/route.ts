import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // 验证用户身份
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 解析请求体
    const { confirmationText } = await request.json()

    // 验证确认文本
    if (confirmationText !== 'DELETE') {
      return NextResponse.json(
        { error: '确认文本不正确，请输入"DELETE"' },
        { status: 400 }
      )
    }

    // 级联删除所有关联数据（使用事务确保原子性）
    // 使用数据库函数来确保事务完整性
    const { data: deleteResult, error: deleteError } = await supabase.rpc(
      'delete_user_account',
      { p_user_id: user.id }
    )

    if (deleteError) {
      console.error('Failed to delete account:', deleteError)
      return NextResponse.json(
        { error: '删除账号失败：' + deleteError.message },
        { status: 500 }
      )
    }

    // 返回成功响应
    return NextResponse.json({
      success: true,
      message: '账号已成功删除',
      deletedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Account deletion error:', error)
    return NextResponse.json(
      { error: error.message || '删除账号时发生错误' },
      { status: 500 }
    )
  }
}
