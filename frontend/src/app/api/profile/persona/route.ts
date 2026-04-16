/**
 * Agent 画像管理 API Route
 * GET  /api/profile/persona - 获取当前用户的画像
 * POST /api/profile/persona - 创建或更新画像
 */

import { NextResponse } from 'next/server'
import { getPersona, upsertPersona, type PersonaData } from '@/services/persona'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await getPersona()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in GET /api/profile/persona:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body: PersonaData = await request.json()
    const result = await upsertPersona(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error === 'Unauthorized' ? 401 : 500 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in POST /api/profile/persona:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
