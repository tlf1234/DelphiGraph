import { NextResponse } from 'next/server'
import { getCalibrationTasks } from '@/services/purgatory'

export async function GET() {
  try {
    const result = await getCalibrationTasks()
    if (!result) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Get calibration tasks error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
