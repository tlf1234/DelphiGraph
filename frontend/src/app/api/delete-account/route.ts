import { NextResponse } from 'next/server'
import { deleteAccount } from '@/services/account'

export async function POST(request: Request) {
  try {
    const { confirmationText } = await request.json()
    const result = await deleteAccount(confirmationText)

    if (!result.success) {
      const status = result.error === '未授权' ? 401 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('Account deletion error:', error)
    return NextResponse.json({ error: '删除账号时发生错误' }, { status: 500 })
  }
}
