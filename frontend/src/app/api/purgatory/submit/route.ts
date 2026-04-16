import { NextRequest, NextResponse } from 'next/server'
import { submitCalibrationAnswer } from '@/services/purgatory'

export async function POST(request: NextRequest) {
  try {
    const { task_id, answer, rationale } = await request.json()
    if (!task_id || answer === undefined) {
      return NextResponse.json({ error: '缺少 task_id 或 answer 参数' }, { status: 400 })
    }

    const result = await submitCalibrationAnswer(task_id, answer, rationale)
    if (!result.success) {
      const status = result.error === 'Unauthorized' ? 401 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Submit calibration answer error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
