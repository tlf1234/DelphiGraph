/**
 * 因果分析 API 路由
 * 
 * 路径: /api/causal-analysis/[taskId]
 * 
 * 功能:
 *   - GET: 获取最新的因果分析结果（直接从 Supabase 读取）
 *   - POST: 手动触发因果分析（转发到 Python 后端）
 * 
 * 架构设计:
 *   前端 (Next.js) → 本路由 (API Route) → Python 后端 (FastAPI)
 *   本路由作为中间层，负责身份验证和请求转发
 * 
 * 数据流:
 *   1. 前端轮询调用 GET 获取最新结果
 *   2. 用户点击按钮调用 POST 触发分析
 *   3. Python 后端异步执行分析，保存到 Supabase
 *   4. 前端通过轮询 GET 获取更新后的结果
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchCausalAnalysis } from '@/services/causal'

// 因果引擎后端服务地址（Python FastAPI）
const CAUSAL_ENGINE_URL = process.env.CAUSAL_ENGINE_URL || 'http://localhost:8100'

/**
 * GET /api/causal-analysis/[taskId]
 * 
 * 功能:
 *   获取某市场最新的因果分析结果
 * 
 * 数据源:
 *   直接从 Supabase causal_analyses 表读取（is_latest = true）
 * 
 * 返回内容:
 *   - graph_data: 4层因果图谱（Agent → Signal → Factor → Target）
 *   - conclusion: 预测结论（方向、置信度、关键路径）
 *   - newspaper_content: 未来报纸文本
 *   - preprocess_summary: 预处理摘要
 *   - version: 版本号
 * 
 * 用途:
 *   - 前端轮询调用（每 3 秒），实时获取分析结果
 *   - 页面初始加载时获取历史分析结果
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const taskId = params.taskId
  console.log(`[causal-analysis GET] ▶ taskId=${taskId}`)

  try {
    const result = await fetchCausalAnalysis(taskId)

    if (!result) {
      console.warn('[causal-analysis GET] ⚠️ No session - returning 401')
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    if ('status' in result && result.status === 'none') {
      console.log(`[causal-analysis GET] No analysis found`)
      return NextResponse.json(result, { status: 200 })
    }

    console.log(`[causal-analysis GET] ✅ Found analysis`)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[causal-analysis GET] ❌', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

/**
 * POST /api/causal-analysis/[taskId]
 * 
 * 功能:
 *   手动触发因果分析（转发到 Python FastAPI 后端）
 * 
 * 请求参数:
 *   - force_final: boolean - 是否强制最终分析（默认 false）
 * 
 * 工作流程:
 *   1. 验证用户身份
 *   2. 转发请求到 Python 后端 /api/causal-analysis/trigger
 *   3. Python 后端异步执行分析，立即返回
 *   4. 前端通过轮询 GET 获取分析结果
 * 
 * 注意:
 *   - 此接口不等待分析完成，立即返回
 *   - 分析结果需要通过 GET 轮询获取
 *   - 后端服务不可用时返回 503
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const taskId = params.taskId
  console.log(`[causal-analysis POST] ▶ taskId=${taskId}`)
  
  try {
    // ================================================================
    // Step 1: 身份验证
    // ================================================================
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.warn('[causal-analysis POST] ⚠️ No session - returning 401')
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }
    console.log(`[causal-analysis POST] session user=${session.user.id.slice(0, 8)}...`)

    // ================================================================
    // Step 2: 解析请求参数
    // ================================================================
    const body = await request.json().catch(() => ({}))
    const engineUrl = `${CAUSAL_ENGINE_URL}/api/causal-analysis/trigger`
    console.log(`[causal-analysis POST] Forwarding to causal engine: ${engineUrl}`)
    console.log(`[causal-analysis POST] Payload: task_id=${taskId}, force_final=${body.force_final || false}`)

    // ================================================================
    // Step 3: 转发请求到 Python 后端
    // ================================================================
    // 说明: Next.js API Route 作为中间层，负责身份验证和请求转发
    //       Python 后端接收请求后异步执行分析，立即返回
    const response = await fetch(engineUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        force_final: body.force_final || false,
      }),
    })

    console.log(`[causal-analysis POST] Engine response status: ${response.status}`)
    const result = await response.json().catch(() => ({}))
    console.log('[causal-analysis POST] Engine response body:', JSON.stringify(result).slice(0, 200))

    // ================================================================
    // Step 4: 处理后端响应
    // ================================================================
    if (!response.ok) {
      // 后端返回错误（如数据不足、已在处理中等）
      console.error(`[causal-analysis POST] ❌ Engine error ${response.status}:`, result.detail)
      return NextResponse.json(
        { error: result.detail || '触发分析失败' },
        { status: response.status }
      )
    }

    // 后端成功接受任务，异步执行中
    console.log('[causal-analysis POST] ✅ Engine accepted task')
    return NextResponse.json(result)
    
  } catch (error) {
    // ================================================================
    // Step 5: 异常处理（网络错误、服务不可用）
    // ================================================================
    console.error('[causal-analysis POST] ❌ Engine unreachable:', error)
    return NextResponse.json(
      { error: '因果引擎服务不可用，请确认服务已启动' },
      { status: 503 }
    )
  }
}
