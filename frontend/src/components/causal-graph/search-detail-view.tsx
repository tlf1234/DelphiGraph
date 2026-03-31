'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  Users,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Maximize2,
  Minimize2,
  GripVertical,
  Play,
  Eye,
  FlaskConical,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  Brain,
  RefreshCw,
  ClipboardList,
} from 'lucide-react'
import CausalGraphViewer from './causal-graph-viewer'
import FutureNewspaper from './future-newspaper'
import { enrichGraphData, type RawPrediction } from './enrich-graph-data'
import {
  splitIntoBatches,
  type GraphBatch,
  type GraphNode,
} from './mock-graph-data'
import { createClient } from '@/lib/supabase/client'

// ── 类型 ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// 类型定义：Market（市场/任务）
// ══════════════════════════════════════════════════════════════
// 描述：UAP 预测市场的核心数据结构，包含任务基本信息、状态、时间等
interface Market {
  id: string
  title: string
  question: string
  description?: string
  status: string
  closes_at: string
  reward_pool?: number
  created_at: string
}

// ══════════════════════════════════════════════════════════════
// 类型定义：CausalAnalysis（因果分析结果）
// ══════════════════════════════════════════════════════════════
// 描述：Python 因果引擎生成的分析结果，包含图谱数据、结论、报纸内容等
// 版本控制：version 字段用于轮询检测新结果
interface CausalAnalysis {
  id: string
  status: string
  signal_count: number
  hard_fact_count: number
  persona_count: number
  graph_data: any
  conclusion: any
  newspaper_content: string | null
  is_final: boolean
  version: number
  preprocess_summary: any
  created_at: string
}

interface SearchDetailViewProps {
  market: Market
  analysis: CausalAnalysis | null
  predictionCount: number
}

// ══════════════════════════════════════════════════════════════
// 模拟测试状态定义
// ══════════════════════════════════════════════════════════════
// 描述：模拟测试流程的各个阶段，用于 UI 状态展示和流程控制
type SimPhase =
  | 'idle'
  | 'preparing'   // 创建测试agents
  | 'uploading'   // 批量上传预测数据
  | 'waiting'     // 等待因果引擎
  | 'analyzing'   // 因果引擎处理中
  | 'polling'     // 轮询结果
  | 'complete'    // 完成
  | 'error'

interface SimState {
  phase: SimPhase
  batchDone: number
  totalBatches: number
  uploadedCount: number
  totalTarget: number
  agents: Array<{ id: string; username: string }>
  log: string[]
  error?: string
  newAnalysisVersion?: number
}

// ══════════════════════════════════════════════════════════════
// 辅助函数：getTimeRemaining
// ══════════════════════════════════════════════════════════════
// 功能：计算市场截止时间的剩余时间，返回友好的中文格式
// 参数：closesAt - ISO 8601 时间字符串
// 返回："X天X时" 或 "X时X分" 或 "X分" 或 "已截止"
function getTimeRemaining(closesAt: string) {
  const diff = new Date(closesAt).getTime() - Date.now()
  if (diff <= 0) return '已截止'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  if (d > 0) return `${d}天${h}时`
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}时${m}分` : `${m}分`
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: '进行中', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  closed: { label: '已关闭', color: 'text-amber-400', dot: 'bg-amber-400' },
  resolved: { label: '已结算', color: 'text-sky-400', dot: 'bg-sky-400' },
}

// ══════════════════════════════════════════════════════════════
// 核心函数：buildPreliminaryGraph（构建预览图谱）
// ══════════════════════════════════════════════════════════════
// 功能：在批量上传预测数据阶段，实时构建预览图谱（无需等待 LLM 分析）
// 用途：提供即时反馈，让用户看到数据上传进度和初步的信号分布
// 结构：Agent → Signal → Target（三层结构）
// 特点：
//   1. 无需 LLM，纯前端计算，速度快
//   2. 每批上传后立即更新，实时反馈
//   3. 后续会被 LLM 生成的完整图谱（含 Factor 层）替换  

// ！！！！！这里需要优化！！！！！！！
function buildPreliminaryGraph(
  marketTitle: string,
  taskId: string,
  predictions: RawPrediction[],
): any | null {
  if (!predictions.length) return null
  const targetId = `target_${taskId.replace(/-/g, '').slice(0, 8)}`
  const title = marketTitle.length > 35 ? marketTitle.slice(0, 35) + '…' : marketTitle
  const nodes: any[] = [{
    id: targetId, name: title, node_type: 'target',
    is_target: true, impact_score: 1.0, total_evidence_count: predictions.length,
  }]
  const edges: any[] = []
  const seenAgents = new Map<string, string>()

  predictions.forEach((pred, idx) => {
    const userId = pred.user_id
    let agentId = seenAgents.get(userId)
    if (!agentId) {
      agentId = `agent_${userId.replace(/-/g, '').slice(0, 12)}`
      seenAgents.set(userId, agentId)
      const stance = pred.probability > 0.6 ? 'bullish' : pred.probability < 0.4 ? 'bearish' : 'neutral'
      nodes.push({
        id: agentId,
        name: pred.profiles?.username || `Agent-${userId.slice(0, 6)}`,
        node_type: 'agent',
        avatar_label: (pred.profiles?.username || userId.slice(0, 2)).slice(0, 2).toUpperCase(),
        persona: { stance, expertise: 'general', reputation: pred.profiles?.reputation_score || 100 },
      })
    }
    const signalId = `sig_${pred.id.slice(0, 8)}`
    const rationale = pred.rationale || ''
    nodes.push({
      id: signalId,
      name: rationale.length > 40 ? rationale.slice(0, 40) + '…' : rationale,
      node_type: 'signal', evidence_type: pred.evidence_type || 'persona_inference',
      relevance_score: pred.relevance_score ?? 0.5, is_minority: false,
    })
    edges.push({
      id: `e_as_${idx}`, source: agentId, target: signalId, edge_type: 'agent_signal',
      weight: pred.probability, direction: pred.probability > 0.5 ? 'positive' : 'negative',
    })
  })
  return { nodes, edges, graph_id: 'preliminary', is_preliminary: true }
}

// ── 主组件 ─────────────────────────────────────────────────────────────

const TOTAL_BATCHES = 10        // 10批 × 30条 = 300条预测
const BATCH_INTERVAL_MS = 5000  // 每批间隔5秒
const POLL_INTERVAL_MS = 3000   // 轮询间隔3秒

export default function SearchDetailView({
  market,
  analysis: initialAnalysis,
  predictionCount: initialPredictionCount,
}: SearchDetailViewProps) {
  // ══════════════════════════════════════════════════════════════
  // UI 布局状态
  // ══════════════════════════════════════════════════════════════
  const [leftRatio, setLeftRatio] = useState(55)  // 左侧图谱面板宽度比例（30-75%）
  const [isDragging, setIsDragging] = useState(false)  // 是否正在拖拽分割线
  const [focusPanel, setFocusPanel] = useState<'none' | 'graph' | 'newspaper'>('none')  // 最大化面板

  // ══════════════════════════════════════════════════════════════
  // 实时数据状态（覆盖服务端初始值）
  // ══════════════════════════════════════════════════════════════
  // 说明：这些状态会通过轮询或模拟流程动态更新
  const [liveAnalysis, setLiveAnalysis] = useState<CausalAnalysis | null>(initialAnalysis)
  const [livePredCount, setLivePredCount] = useState(initialPredictionCount)

  // ══════════════════════════════════════════════════════════════
  // 模拟测试状态
  // ══════════════════════════════════════════════════════════════
  // 说明：控制整个模拟测试流程的状态机
  const [sim, setSim] = useState<SimState>({
    phase: 'idle',
    batchDone: 0,
    totalBatches: TOTAL_BATCHES,
    uploadedCount: 0,
    totalTarget: TOTAL_BATCHES * 10,
    agents: [],
    log: [],
  })
  const [showSimPanel, setShowSimPanel] = useState(false)  // 是否显示模拟测试面板
  const simRef = useRef<SimState>(sim)  // sim 状态的 ref 副本，避免闭包陷阱
  const simAbortRef = useRef(false)  // 用户中止标志
  const hasRealAnalysisRef = useRef(false)  // 已收到真实LLM分析结果，停止预览图更新
  const hasStartedFactorRevealRef = useRef(false) // 已启动因子揭示动画，防止多次重绘
  const fullEnrichedGraphRef = useRef<any>(null)  // 完整图谱（全量信号+因子），供「图谱演示」重放
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)  // 轮询定时器引用

  // 同步 sim 到 ref，避免闭包问题
  useEffect(() => { simRef.current = sim }, [sim])

  // ══════════════════════════════════════════════════════════════
  // 工具函数：addLog（添加日志）
  // ══════════════════════════════════════════════════════════════
  // 功能：向模拟测试面板添加带时间戳的日志
  // 限制：最多保留 50 条日志（slice(-49) + 新日志 = 50）
  const addLog = useCallback((msg: string) => {
    setSim(prev => ({ ...prev, log: [...prev.log.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`] }))
  }, [])

  // ══════════════════════════════════════════════════════════════
  // 轮询因果分析结果
  // ══════════════════════════════════════════════════════════════
  // 说明：通过版本号检测新的分析结果，避免重复处理
  const lastVersionRef = useRef(initialAnalysis?.version || 0)

  const stopPoll = useCallback(() => {
    if (pollTimerRef.current) { 
      clearInterval(pollTimerRef.current); //
      pollTimerRef.current = null 
    }
  }, [])

  // ══════════════════════════════════════════════════════════════
  // 核心函数：startPolling（开始轮询）
  // ══════════════════════════════════════════════════════════════
  // 功能：每 3 秒轮询 causal_analyses 表，检测新的分析结果
  // 触发时机：模拟测试开始时（Step 2）
  // 停止条件：分析完成（status='completed'）或用户中止
  // 版本控制：通过 version 字段避免重复处理同一结果
  const startPolling = useCallback(() => {
    stopPoll()
    const supabase = createClient()
    // Use a ref so we don't need liveAnalysis in the dep array (avoids stale closure restart)
    lastVersionRef.current = lastVersionRef.current || 0

    pollTimerRef.current = setInterval(async () => {
      try {
        // 查询最新的分析结果（is_latest=true 确保只获取当前版本）
        const { data: analysis } = await supabase
          .from('causal_analyses')
          .select('id, status, signal_count, hard_fact_count, persona_count, graph_data, conclusion, newspaper_content, preprocess_summary, is_final, version, created_at')
          .eq('task_id', market.id)
          .eq('is_latest', true)
          .maybeSingle()
        
        // ══════════════════════════════════════════════════════════════
        // 检测到新版本分析结果
        // ══════════════════════════════════════════════════════════════
        if (analysis && analysis.version > lastVersionRef.current) {
          lastVersionRef.current = analysis.version
          addLog(`✅ 检测到新分析结果 v${analysis.version}，正在加载图谱...`)

          // 通过 API 路由获取预测数据（绕过 RLS，使用 service role 读取全量数据）
          // 原因：前端 Supabase 客户端受 RLS 限制，只能看到当前用户的预测
          //       但图谱需要展示所有 Agent 的预测，因此通过后端 API 获取
          const predRes = await fetch(`/api/predictions/${market.id}`)
          const predJson = predRes.ok ? await predRes.json() : { predictions: [] }
          const predictions: RawPrediction[] = predJson.predictions || []

          // 增强图谱数据：将 Agent 和 Signal 节点添加到 LLM 生成的图谱中
          // LLM 只生成 Factor 和 Target 节点，需要手动补充 Agent 和 Signal
          const enriched = {
            ...analysis,
            graph_data: enrichGraphData(analysis.graph_data, predictions),
          }
          hasRealAnalysisRef.current = true  // 标记已收到真实分析，停止预览图更新
          setLiveAnalysis(enriched as CausalAnalysis) //分析都完成以后触发新的显示更新
          setLivePredCount(predictions.length)

          // 更新 sim 状态
          setSim(prev => ({
            ...prev,
            phase: analysis.status === 'completed' ? 'complete' : prev.phase,
            newAnalysisVersion: analysis.version,
          }))

          // 分析完成，停止轮询
          if (analysis.status === 'completed') {
            addLog(`🎉 分析完成！方向: ${analysis.conclusion?.direction || '未知'}，置信度: ${((analysis.conclusion?.confidence || 0) * 100).toFixed(0)}%`)
            stopPoll()  // 清除定时器
          }
        }
      } catch (err) {
        console.error('[poll]', err)
      }
    }, POLL_INTERVAL_MS)
  }, [market.id, addLog, stopPoll])

  // ══════════════════════════════════════════════════════════════
  // 核心函数：uploadBatch（上传单批次预测）
  // ══════════════════════════════════════════════════════════════
  // 功能：调用后端 API 上传一批模拟预测数据（30 条）
  // 参数：
  //   - batchIdx: 批次索引（0-9）
  //   - agents: Agent 列表（从中随机选择）
  // 返回：{ uploaded: 实际上传数, total: 市场总预测数 } 或 null（失败）
  const uploadBatch = useCallback(async (
    batchIdx: number,
    agents: Array<{ id: string; username: string }>,
  ): Promise<{ uploaded: number; total: number } | null> => {
    try {
      const res = await fetch('/api/test/upload-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: market.id, batch_index: batchIdx, agents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      return { uploaded: data.inserted, total: data.total_predictions }
    } catch (err) {
      addLog(`❌ 批次 ${batchIdx + 1} 上传失败: ${err}`)
      return null
    }
  }, [market.id, addLog])

  // ══════════════════════════════════════════════════════════════
  // 核心函数：triggerAnalysis（触发因果分析）
  // ══════════════════════════════════════════════════════════════
  // 功能：调用 Python 因果引擎进行分析
  // 参数：forceFinal - 是否强制最终分析（true=完整图谱，false=增量分析）
  // 流程：
  //   1. 调用 Next.js API 路由 /api/causal-analysis/[taskId]
  //   2. Next.js 转发到 Python 引擎 http://localhost:8000/api/causal-analysis/trigger
  //   3. Python 引擎异步执行分析，立即返回 202 Accepted
  //   4. 前端通过轮询获取结果
  // 注意：不再使用 Mock 分析，引擎不可用时直接报错
  const triggerAnalysis = useCallback(async (forceFinal = false) => {
    addLog(`🔬 触发因果分析引擎${forceFinal ? '（最终推演）' : ''}...`)
    addLog(`   → 请求 URL: /api/causal-analysis/${market.id}`)
    addLog(`   → force_final: ${forceFinal}`)
    setSim(prev => ({ ...prev, phase: 'analyzing' }))

    try {
      const res = await fetch(`/api/causal-analysis/${market.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_final: forceFinal }),
      })
      
      addLog(`   ← HTTP ${res.status} ${res.statusText}`)
      
      const data = await res.json()
      
      // 引擎接受任务（HTTP 200 或 202）
      if (res.ok) {
        addLog('⚙️ 因果引擎已接受任务，后台推演中...')
        addLog(`   → 任务已提交，等待轮询捕获结果...`)
        setSim(prev => ({ ...prev, phase: 'polling' }))
        return
      }
      
      // ══════════════════════════════════════════════════════════════
      // 引擎错误处理（不使用 Mock 分析）
      // ══════════════════════════════════════════════════════════════
      const errorMsg = data.error || data.message || `HTTP ${res.status}`
      addLog(`❌ 因果引擎返回错误: ${errorMsg}`)
      
      if (res.status === 503) {
        addLog('   ⚠️ 引擎服务不可用 (503) - 请检查 Python 后端是否启动')
        addLog('   → 启动命令: cd backend && python -m causal_engine.api_service')
      } else if (res.status === 404) {
        addLog('   ⚠️ 引擎端点未找到 (404) - 请检查路由配置')
      }
      
      throw new Error(errorMsg)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      addLog(`❌ 分析触发失败: ${errMsg}`)
      setSim(prev => ({ ...prev, phase: 'error', error: errMsg }))
    }
  }, [market.id, addLog])


  //////注意当前流程还是以模拟流程为主，并且没有完整移植到实际流程中。或者说实际
  //触发分析的接口还没有完全对接好。


  // ══════════════════════════════════════════════════════════════
  // 核心函数：startSimulation（主模拟流程）
  // ══════════════════════════════════════════════════════════════
  // 功能：完整的 UAP 模拟测试流程
  // 流程：
  //   Step 1: 准备 Agent（POST /api/test/prepare）
  //           - 创建/复用 100 个模拟 Agent
  //           - 清除历史数据（predictions + causal_analyses）
  //   Step 2: 启动轮询（startPolling）
  //           - 每 3 秒检测新的分析结果
  //   Step 3: 批量上传（循环 10 次）
  //           - 每批 30 条预测，间隔 5 秒
  //           - 每批后更新预览图谱
  //   Step 4: 触发分析（triggerAnalysis）
  //           - force_final=true，生成完整图谱
  //   Step 5: 等待结果（轮询捕获）
  //           - 检测到新版本后渲染图谱和报纸
  // 总耗时：约 50-60 秒
  const startSimulation = useCallback(async () => {
    simAbortRef.current = false
    hasRealAnalysisRef.current = false
    hasStartedFactorRevealRef.current = false
    animGraphDataRef.current = { nodes: [], edges: [] }
    setAnimGraphData({ nodes: [], edges: [] })
    setShowSimPanel(true)
    setSim({ phase: 'preparing', batchDone: 0, totalBatches: TOTAL_BATCHES, uploadedCount: 0, totalTarget: TOTAL_BATCHES * 30, agents: [], log: [] })
    addLog('🚀 开始 UAP 模拟测试流程...')
    addLog(`📋 目标: ${TOTAL_BATCHES * 30} 条预测（${TOTAL_BATCHES}批 × 30条），每 ${BATCH_INTERVAL_MS / 1000}s 上传一批`)

    // ══════════════════════════════════════════════════════════════
    // Step 1: 准备测试 Agent
    // ══════════════════════════════════════════════════════════════
    // 功能：创建/复用 100 个模拟 Agent，清除历史数据
    // API: POST /api/test/prepare
    // 清理内容：
    //   - predictions 表（该 market 的所有预测）
    //   - causal_analyses 表（该 market 的所有分析）
    //   - markets 表（重置 causal_analysis_status 等字段）
    addLog('🧹 清除历史数据 + 准备模拟 Agent 档案...')
    addLog(`   → 请求 POST /api/test/prepare`)
    addLog(`   → task_id: ${market.id}`)
    let agents: Array<{ id: string; username: string }> = []
    try {
      const res = await fetch('/api/test/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: market.id }),
      })
      addLog(`   ← HTTP ${res.status}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Prepare failed')
      agents = data.agents || []
      addLog(`✅ 历史数据已清除。${agents.length} 个 Agent 就绪 (${data.reused ? '复用已有' : '新创建'})`)
      addLog(`   → Agent 示例: ${agents.slice(0, 3).map(a => a.username).join(', ')}...`)
      lastVersionRef.current = 0  // 历史已清除，从 v0 重新计数，确保轮询能捕获新的 v1
      setSim(prev => ({ ...prev, agents, phase: 'uploading' }))
    } catch (err) {
      addLog(`❌ Agent 准备失败: ${err}`)
      setSim(prev => ({ ...prev, phase: 'error', error: String(err) }))
      return
    }

    // ══════════════════════════════════════════════════════════════
    // Step 2: 启动轮询
    // ══════════════════════════════════════════════════════════════
    // 说明：提前启动轮询，确保能及时捕获分析结果
    startPolling()

    // ══════════════════════════════════════════════════════════════
    // Step 3: 批量上传预测数据
    // ══════════════════════════════════════════════════════════════
    // 循环：10 批，每批 30 条，间隔 5 秒
    // 总量：300 条预测
    // 总耗时：约 50 秒（10 批 × 5 秒间隔）
    let totalUploaded = 0
    for (let batchIdx = 0; batchIdx < TOTAL_BATCHES; batchIdx++) {
      if (simAbortRef.current) {
        addLog('⏹ 模拟已中止')
        break
      }

      addLog(`📤 上传批次 ${batchIdx + 1}/${TOTAL_BATCHES}（第 ${batchIdx * 30 + 1}–${batchIdx * 30 + 30} 条）...`)
      const result = await uploadBatch(batchIdx, agents)

      if (result) {
        totalUploaded += result.uploaded
        setSim(prev => ({
          ...prev,
          batchDone: batchIdx + 1,
          uploadedCount: totalUploaded,
        }))
        addLog(`   ✓ 已入库 ${result.uploaded} 条，累计 ${totalUploaded} 条（市场总计 ${result.total}）`)
        addLog(`   → 进度: ${((batchIdx + 1) / TOTAL_BATCHES * 100).toFixed(0)}%`)
        setLivePredCount(result.total)
      } else {
        addLog(`   ⚠️ 批次 ${batchIdx + 1} 上传失败，跳过`)
      }

      // ══════════════════════════════════════════════════════════════
      // Step 4: 实时预览图谱（每批后更新）
      // ══════════════════════════════════════════════════════════════
      // 功能：在 LLM 分析完成前，提供即时的图谱预览
      // 条件：仅在未收到真实分析结果时更新（避免覆盖 LLM 图谱）
      if (!hasRealAnalysisRef.current) {
        try {
          const predRes = await fetch(`/api/predictions/${market.id}`)
          if (predRes.ok) {
            const predJson = await predRes.json()
            const livePreds: RawPrediction[] = predJson.predictions || []
            const preliminary = buildPreliminaryGraph(market.question || market.title, market.id, livePreds)
            if (preliminary) {
              setAnimGraphDataAndRef(preliminary)
              const uniqueAgents = new Set(livePreds.map(p => p.user_id)).size
              addLog(`🔮 图谱实时更新: ${uniqueAgents} Agent · ${livePreds.length} 信号 · ${preliminary.nodes.length} 节点`)
            }
          } else {
            addLog(`   ⚠️ 预览图谱拉取失败 (HTTP ${predRes.status})`)
          }
        } catch (e) {
          addLog(`   ⚠️ 预览图谱构建异常: ${e}`)
        }
      }

      // 等待5秒后上传下一批（最后一批不等待）
      if (batchIdx < TOTAL_BATCHES - 1 && !simAbortRef.current) {
        await new Promise(r => setTimeout(r, BATCH_INTERVAL_MS))
      }
    }

    // ══════════════════════════════════════════════════════════════
    // Step 5: 触发因果分析
    // ══════════════════════════════════════════════════════════════
    // 条件：所有批次上传完成且未被中止
    // 参数：force_final=true，确保生成完整图谱（含所有 Factor）
    if (!simAbortRef.current) {
      addLog(`🏁 上传完成！共 ${totalUploaded} 条预测数据`)
      addLog(`   → 准备触发因果分析引擎...`)
      setSim(prev => ({ ...prev, phase: 'polling' }))
      // 全量数据触发最终推演（force_final确保完整图谱生成）
      await triggerAnalysis(true)
    } else {
      addLog('⏹ 模拟已被用户中止')
    }
  }, [addLog, uploadBatch, triggerAnalysis, startPolling])

  // ══════════════════════════════════════════════════════════════
  // 工具函数：stopSimulation（停止模拟）
  // ══════════════════════════════════════════════════════════════
  // 功能：用户手动中止模拟测试
  const stopSimulation = useCallback(() => {
    simAbortRef.current = true
    stopPoll()
    setSim(prev => ({ ...prev, phase: 'idle' }))
  }, [stopPoll])

  // 组件卸载时清理定时器
  useEffect(() => () => { stopPoll() }, [stopPoll])

  // ══════════════════════════════════════════════════════════════
  // 图谱演示动画状态
  // ══════════════════════════════════════════════════════════════
  // 说明：用于「图谱演示」功能，逐步展示图谱节点和边
  const animGraphDataRef = useRef<any>({ nodes: [], edges: [] })
  const [animGraphData, setAnimGraphData] = useState<any>({ nodes: [], edges: [] })
  const setAnimGraphDataAndRef = useCallback((data: any) => {
    animGraphDataRef.current = data
    setAnimGraphData(data)
  }, [])
  const [isAnimating, setIsAnimating] = useState(false)
  const [batchIndex, setBatchIndex] = useState(-1)
  const [totalBatches, setTotalBatches] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchesRef = useRef<GraphBatch[]>([])

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const accumulateBatches = useCallback((batches: GraphBatch[], upTo: number) => {
    const nodes: GraphNode[] = []
    const edges: any[] = []
    const seen = new Set<string>()
    for (let i = 0; i <= Math.min(upTo, batches.length - 1); i++) {
      batches[i].nodes.forEach(n => { if (!seen.has(n.id)) { nodes.push(n); seen.add(n.id) } })
      edges.push(...batches[i].edges)
    }
    return { nodes, edges }
  }, [])

  // ══════════════════════════════════════════════════════════════
  // 核心函数：startFactorRevealAnimation（因子揭示动画）
  // ══════════════════════════════════════════════════════════════
  // 功能：当首次收到 LLM 分析结果时，平滑地从预览图过渡到完整图谱
  // 策略：
  //   1. 保持所有 Agent 和 Signal 节点可见（来自预览图）
  //   2. 逐个添加 Factor 节点（来自 LLM 分析）
  //   3. 避免图谱抖动和节点丢失
  // 触发：仅在首次收到真实分析时调用一次（hasStartedFactorRevealRef 防止重复）
  const startFactorRevealAnimation = useCallback((gd: any) => {
    if (!gd?.nodes?.length) return
    stopTimer()

    const clusterNodes        = gd.nodes.filter((n: any) => n.node_type === 'cluster')
    const factorNodes         = gd.nodes.filter((n: any) => n.node_type === 'factor')
    const targetNodes         = gd.nodes.filter((n: any) => n.node_type === 'target')
    const signalClusterEdges  = gd.edges.filter((e: any) => e.edge_type === 'signal_cluster')
    // DEBUG: 诊断signal_cluster连线问题
    console.log('[graph] edge types:', Object.entries(gd.edges.reduce((acc: any, e: any) => { acc[e.edge_type] = (acc[e.edge_type]||0)+1; return acc }, {})))
    console.log('[graph] signalClusterEdges count:', signalClusterEdges.length, '| first 3 sources:', signalClusterEdges.slice(0,3).map((e:any)=>e.source))
    const clusterFactorEdges  = gd.edges.filter((e: any) => e.edge_type === 'cluster_factor')
    const factorFactorEdges   = gd.edges.filter((e: any) => e.edge_type === 'factor_factor')
    const factorTargetEdges   = gd.edges.filter((e: any) => e.edge_type === 'factor_target')
    // DEBUG: cluster_factor边诊断
    console.log('[graph] clusterFactorEdges count:', clusterFactorEdges.length)
    console.log('[graph] clusterNodes count:', clusterNodes.length, '| IDs:', clusterNodes.slice(0,3).map((n:any)=>n.id))
    console.log('[graph] factorNodes count:', factorNodes.length, '| IDs:', factorNodes.slice(0,3).map((n:any)=>n.id))
    if (clusterFactorEdges.length > 0) {
      console.log('[graph] clusterFactorEdges sample src/tgt:', clusterFactorEdges.slice(0,3).map((e:any)=>({ src: typeof e.source === 'string' ? e.source : '[object]', tgt: typeof e.target === 'string' ? e.target : '[object]' })))
    }

    // 动画过渡帧：agent/signal 节点始终用 gd（enriched，含 persona 字段），
    // 避免 preliminary graph 的旧节点覆盖画像数据
    const baseAgentSignalNodes = gd.nodes.filter((n: any) => n.node_type === 'agent' || n.node_type === 'signal')
    const baseAgentSignalEdges = gd.edges.filter((e: any) => e.edge_type === 'agent_signal')
    // DEBUG: 对比signal节点ID与signal_cluster边的source
    const sigNodeIds = baseAgentSignalNodes.filter((n:any) => n.node_type === 'signal').map((n:any) => n.id)
    console.log('[graph] baseSignalNode count:', sigNodeIds.length, '| first 3 IDs:', sigNodeIds.slice(0,3))
    if (signalClusterEdges.length > 0) {
      const matched = signalClusterEdges.filter((e:any) => sigNodeIds.includes(e.source)).length
      console.log('[graph] signal_cluster edges matched to base nodes:', matched, '/', signalClusterEdges.length)
    }

    const frames: any[] = []
    // Frame 0: 第1+2层 — Agent + Signal（零抖动基础帧）
    frames.push({ nodes: [...baseAgentSignalNodes], edges: baseAgentSignalEdges })

    // Frames 1..M: 第3层 — Cluster 逐个入场，同步带入 signal→cluster 连线
    for (let i = 0; i < clusterNodes.length; i++) {
      const visibleClusters = clusterNodes.slice(0, i + 1)
      const ids = new Set([...baseAgentSignalNodes, ...visibleClusters].map((n: any) => n.id))
      frames.push({
        nodes: [...baseAgentSignalNodes, ...visibleClusters],
        edges: [
          ...baseAgentSignalEdges,
          ...signalClusterEdges.filter((e: any) => ids.has(e.source) && ids.has(e.target)),
        ],
      })
    }

    // Frames M+1..M+N: 第4层 — Factor 逐个入场，带入 cluster→factor 连线
    for (let i = 0; i < factorNodes.length; i++) {
      const visibleFactors = factorNodes.slice(0, i + 1)
      const ids = new Set([...baseAgentSignalNodes, ...clusterNodes, ...visibleFactors].map((n: any) => n.id))
      frames.push({
        nodes: [...baseAgentSignalNodes, ...clusterNodes, ...visibleFactors],
        edges: [
          ...baseAgentSignalEdges,
          ...signalClusterEdges.filter((e: any) => ids.has(e.source) && ids.has(e.target)),
          ...clusterFactorEdges.filter((e: any) => ids.has(e.source) && ids.has(e.target)),
          ...factorFactorEdges.filter((e: any) => ids.has(e.source) && ids.has(e.target)),
        ],
      })
    }

    // Final frame: 第5层 — Target 入场，完整图谱
    const finalFrame = {
      nodes: [...baseAgentSignalNodes, ...clusterNodes, ...factorNodes, ...targetNodes],
      edges: [
        ...baseAgentSignalEdges,
        ...signalClusterEdges,
        ...clusterFactorEdges,
        ...factorFactorEdges,
        ...factorTargetEdges,
      ],
    }
    frames.push(finalFrame)
    // 保存完整图谱快照供「图谱演示」重放
    fullEnrichedGraphRef.current = finalFrame

    setTotalBatches(frames.length)
    setBatchIndex(0)
    setAnimGraphDataAndRef(frames[0])
    setIsAnimating(true)
    let idx = 0
    timerRef.current = setInterval(() => {
      idx++
      if (idx >= frames.length - 1) {
        stopTimer()
        setIsAnimating(false)
        setBatchIndex(frames.length - 1)
        setAnimGraphDataAndRef(frames[frames.length - 1])
        return
      }
      setBatchIndex(idx)
      setAnimGraphDataAndRef(frames[idx])
    }, 800)
  }, [stopTimer])

  // ══════════════════════════════════════════════════════════════
  // 核心函数：startGraphAnimation（图谱演示动画）
  // ══════════════════════════════════════════════════════════════
  // 功能：用户点击「图谱演示」按钮时，分批展示完整图谱
  // 用途：教学演示、展示图谱构建过程
  const startGraphAnimation = useCallback((graphData?: any) => {
    // 优先使用完整图谱快照（含全量preliminary信号），而非仅含后端处理信号的 liveAnalysis.graph_data
    const gd = graphData || fullEnrichedGraphRef.current || liveAnalysis?.graph_data
    if (!gd?.nodes?.length) return
    // 重放时强制从 gd 自身作为 base（清空 ref 让 startFactorRevealAnimation 用 gd 作起点）
    animGraphDataRef.current = gd
    startFactorRevealAnimation(gd)
  }, [liveAnalysis?.graph_data, startFactorRevealAnimation])

  // ══════════════════════════════════════════════════════════════
  // 工具函数：showGraphImmediately（直接显示完整图谱）
  // ══════════════════════════════════════════════════════════════
  // 功能：跳过动画，立即显示完整图谱
  const showGraphImmediately = useCallback(() => {
    stopTimer()
    setIsAnimating(false)
    setBatchIndex(-1)
    setAnimGraphDataAndRef(fullEnrichedGraphRef.current || liveAnalysis?.graph_data || { nodes: [], edges: [] })
  }, [stopTimer, liveAnalysis?.graph_data, setAnimGraphDataAndRef])

  // ══════════════════════════════════════════════════════════════
  // 副作用：自动启动因子揭示动画
  // ══════════════════════════════════════════════════════════════
  // 触发条件：首次收到 LLM 分析结果
  // 保护机制：hasStartedFactorRevealRef 确保只触发一次
  useEffect(() => {
    if (!liveAnalysis?.graph_data?.nodes?.length) return
    if (hasStartedFactorRevealRef.current) return
    hasStartedFactorRevealRef.current = true
    const t = setTimeout(() => startFactorRevealAnimation(liveAnalysis.graph_data), 200)
    return () => { clearTimeout(t); stopTimer() }
  }, [liveAnalysis?.graph_data, startFactorRevealAnimation, stopTimer])

  const displayGraphData = animGraphData

  const status = STATUS_MAP[market.status] || STATUS_MAP.active
  const conclusion = liveAnalysis?.conclusion
  const directionIcon =
    conclusion?.direction === 'bullish' ? (
      <TrendingUp className="w-4 h-4 text-emerald-400" />
    ) : conclusion?.direction === 'bearish' ? (
      <TrendingDown className="w-4 h-4 text-rose-400" />
    ) : (
      <Minus className="w-4 h-4 text-zinc-400" />
    )
  const directionLabel =
    conclusion?.direction_label ||
    (conclusion?.direction === 'bullish'
      ? '看涨'
      : conclusion?.direction === 'bearish'
        ? '看跌'
        : '中性')
  const confidence = conclusion?.confidence

  // ══════════════════════════════════════════════════════════════
  // UI 配置：模拟阶段图标映射
  // ══════════════════════════════════════════════════════════════
  const simPhaseIcon = {
    idle: null,
    preparing: <Loader2 className="w-3 h-3 animate-spin" />,
    uploading: <Upload className="w-3 h-3 animate-pulse" />,
    waiting: <Loader2 className="w-3 h-3 animate-spin" />,
    analyzing: <Brain className="w-3 h-3 animate-pulse" />,
    polling: <RefreshCw className="w-3 h-3 animate-spin" />,
    complete: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    error: <AlertCircle className="w-3 h-3 text-rose-400" />,
  }[sim.phase]

  // ══════════════════════════════════════════════════════════════
  // 交互函数：handleMouseDown（拖拽分割线）
  // ══════════════════════════════════════════════════════════════
  // 功能：拖拽中间分割线调整左右面板宽度比例
  // 限制：30% - 75%
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)

    const startX = e.clientX
    const startRatio = leftRatio

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const windowW = window.innerWidth
      const newRatio = startRatio + (dx / windowW) * 100
      setLeftRatio(Math.min(75, Math.max(30, newRatio)))
    }

    const onUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftRatio])

  // ══════════════════════════════════════════════════════════════
  // 交互函数：toggleFocus（最大化切换）
  // ══════════════════════════════════════════════════════════════
  // 功能：最大化图谱或报纸面板（再次点击还原）
  const toggleFocus = (panel: 'graph' | 'newspaper') => {
    setFocusPanel(prev => (prev === panel ? 'none' : panel))
  }

  const effectiveLeft =
    focusPanel === 'graph' ? 100 : focusPanel === 'newspaper' ? 0 : leftRatio

  return (
    <div className="flex flex-col h-[calc(100vh-68px)] bg-[#060a14] overflow-hidden">
      {/* ══════════ 模拟测试面板（浮层）══════════ */}
      <AnimatePresence>
        {showSimPanel && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-[60px] right-4 z-50 w-96 max-h-[70vh] flex flex-col bg-[#0d1225]/95 border border-cyan-500/20 rounded-xl shadow-2xl shadow-cyan-500/10 backdrop-blur-xl overflow-hidden"
          >
            {/* 面板标题 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-cyan-500/5">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-300">UAP 模拟测试</span>
                {sim.phase !== 'idle' && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                    {simPhaseIcon}
                    {{
                      preparing: '准备中',
                      uploading: `批次 ${sim.batchDone}/${sim.totalBatches}`,
                      waiting: '等待引擎',
                      analyzing: '推演中',
                      polling: '轮询中',
                      complete: '完成',
                      error: '错误',
                    }[sim.phase] ?? ''}
                  </span>
                )}
              </div>
              <button onClick={() => setShowSimPanel(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 进度条 */}
            {sim.phase !== 'idle' && (
              <div className="px-4 py-2 border-b border-white/[0.04]">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1.5">
                  <span>上传进度</span>
                  <span className="text-cyan-400">{sim.uploadedCount} / {sim.totalTarget} 条预测</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                    animate={{ width: `${(sim.batchDone / sim.totalBatches) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 mt-1">
                  <span>批次 {sim.batchDone}/{sim.totalBatches}</span>
                  {sim.newAnalysisVersion && (
                    <span className="text-emerald-400">分析 v{sim.newAnalysisVersion} 已就绪</span>
                  )}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="px-4 py-2.5 flex gap-2 border-b border-white/[0.04]">
              {sim.phase === 'idle' || sim.phase === 'complete' || sim.phase === 'error' ? (
                <button
                  onClick={startSimulation}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  {sim.phase === 'complete' ? '重新模拟' : '开始模拟'}
                </button>
              ) : (
                <button
                  onClick={stopSimulation}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  中止模拟
                </button>
              )}
              <button
                onClick={showGraphImmediately}
                disabled={!liveAnalysis?.graph_data?.nodes?.length}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 text-zinc-400 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-3.5 h-3.5" />
                直接显示
              </button>
            </div>

            {/* 日志 */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
              {sim.log.length === 0 ? (
                <p className="text-[11px] text-zinc-600 italic">点击「开始模拟」启动 UAP 测试流程</p>
              ) : (
                [...sim.log].reverse().map((line, i) => (
                  <p key={i} className="text-[10px] font-mono text-zinc-400 leading-relaxed">{line}</p>
                ))
              )}
            </div>

            {sim.phase === 'error' && sim.error && (
              <div className="px-4 py-2 border-t border-rose-500/20 bg-rose-500/5">
                <p className="text-[10px] text-rose-400 font-mono">{sim.error}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ 顶部指令栏 ══════════ */}
      <header className="flex-shrink-0 h-12 border-b border-white/[0.06] bg-[#0a0f1e]/80 backdrop-blur-md flex items-center px-4 gap-3 z-20">
        {/* 返回 */}
        <Link
          href="/market-search"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-xs mr-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">返回</span>
        </Link>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-white/[0.06]" />

        {/* 任务标题 */}
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <h1 className="text-sm font-medium text-zinc-200 truncate max-w-[400px]">
            {market.question || market.title}
          </h1>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${market.status === 'active' ? 'animate-pulse' : ''}`} />
            <span className={`text-[10px] font-mono ${status.color}`}>{status.label}</span>
          </span>
        </div>

        {/* 指标条 */}
        <div className="flex items-center gap-4 text-[11px] font-mono shrink-0">
          {/* Agent 数 */}
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Users className="w-3 h-3" />
            <span className="text-zinc-300">{livePredCount}</span>
            <span className="hidden md:inline">信号</span>
          </div>

          {/* 剩余时间 */}
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Clock className="w-3 h-3" />
            <span className="text-zinc-300">{getTimeRemaining(market.closes_at)}</span>
          </div>

          {/* 置信度 */}
          {confidence != null && (
            <>
              <div className="w-px h-4 bg-white/[0.06]" />
              <div className="flex items-center gap-1.5">
                {directionIcon}
                <span className="text-zinc-300">{directionLabel}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-amber-400">{(confidence * 100).toFixed(0)}%</span>
              </div>
            </>
          )}

          {/* 分析状态 */}
          {liveAnalysis && (
            <>
              <div className="w-px h-4 bg-white/[0.06]" />
              <div className="flex items-center gap-1.5 text-zinc-500">
                <Activity className="w-3 h-3" />
                <span>v{liveAnalysis.version}</span>
                {liveAnalysis.is_final ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    FINAL
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    INC
                  </span>
                )}
              </div>
            </>
          )}

          {/* 发起AI调查 */}
          <div className="w-px h-4 bg-white/[0.06]" />
          <Link
            href={`/surveys/create?query=${encodeURIComponent(market.title)}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all border bg-white/5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 border-white/10 hover:border-blue-500/30"
            title="基于此任务发起AI智能调查"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">发起调查</span>
          </Link>

          {/* 模拟测试按钮 [TEMP] */}
          <div className="w-px h-4 bg-white/[0.06]" />
          <button
            onClick={() => setShowSimPanel(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
              showSimPanel
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-white/5 text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 border-white/10 hover:border-cyan-500/30'
            }`}
            title="UAP 模拟测试面板 [临时]"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">模拟测试</span>
            {sim.phase !== 'idle' && sim.phase !== 'complete' && sim.phase !== 'error' && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </button>
        </div>
      </header>

      {/* ══════════ 主内容区 ══════════ */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* ── 左侧：因果图谱 ── */}
        <motion.div
          className="relative h-full overflow-hidden"
          initial={false}
          animate={{ width: `${effectiveLeft}%` }}
          transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
        >
          {/* 面板标题栏 */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-[#060a14] via-[#060a14]/80 to-transparent pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-blue-600" />
              <span className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
                Causal Graph
              </span>
              {displayGraphData && (
                <span className="text-[10px] text-zinc-600 font-mono">
                  {displayGraphData.nodes?.length || 0}N · {displayGraphData.edges?.length || 0}E
                </span>
              )}
              {animGraphData?.is_preliminary && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse">
                  LIVE
                </span>
              )}
            </div>
            <button
              onClick={() => toggleFocus('graph')}
              className="pointer-events-auto p-1 rounded hover:bg-white/5 text-zinc-600 hover:text-zinc-300 transition-colors"
              title={focusPanel === 'graph' ? '还原' : '最大化'}
            >
              {focusPanel === 'graph' ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <CausalGraphViewer
            graphData={displayGraphData}
            className="h-full"
            isUpdating={isAnimating || liveAnalysis?.status === 'processing' || sim.phase === 'analyzing'}
          />

          {/* ── 任务状态指示器（底部居中）── */}
          {(() => {
            const isGraphComplete = sim.phase === 'complete' && !isAnimating && liveAnalysis?.is_final
            if (sim.phase === 'idle' || isGraphComplete) return null
            const phaseConfig: Record<string, { icon: React.ReactNode; label: string; desc: string; color: string; border: string; bg: string }> = {
              preparing: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: '准备 Agent 档案', desc: '初始化模拟 Agent 身份...', color: 'text-cyan-400', border: 'border-cyan-500/25', bg: 'bg-cyan-500/8' },
              uploading:  { icon: <Upload className="w-3.5 h-3.5" />,               label: `上传信号数据`,    desc: `批次 ${sim.batchDone} / ${sim.totalBatches}`, color: 'text-blue-400', border: 'border-blue-500/25', bg: 'bg-blue-500/8' },
              waiting:    { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: '等待因果引擎',   desc: '引擎节点准备中...',    color: 'text-amber-400', border: 'border-amber-500/25', bg: 'bg-amber-500/8' },
              analyzing:  { icon: <Brain className="w-3.5 h-3.5 animate-pulse" />, label: '因果推演中',     desc: 'LLM 正在分析信号关系', color: 'text-violet-400', border: 'border-violet-500/25', bg: 'bg-violet-500/8' },
              polling:    { icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />, label: '等待分析结果', desc: '轮询因果分析结果中...',  color: 'text-sky-400', border: 'border-sky-500/25', bg: 'bg-sky-500/8' },
              complete:   { icon: <CheckCircle2 className="w-3.5 h-3.5" />,        label: '分析已完成',     desc: isAnimating ? '图谱渲染中...' : '等待最终版本...', color: 'text-emerald-400', border: 'border-emerald-500/25', bg: 'bg-emerald-500/8' },
              error:      { icon: <AlertCircle className="w-3.5 h-3.5" />,         label: '任务出错',       desc: (sim.error || '未知错误').slice(0, 32), color: 'text-rose-400', border: 'border-rose-500/25', bg: 'bg-rose-500/8' },
            }
            const cfg = phaseConfig[sim.phase]
            if (!cfg) return null
            return (
              <AnimatePresence>
                <div key={sim.phase} className="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 14, scale: 0.95 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.8, 0.25, 1] }}
                >
                  <div className={`flex items-center gap-3 pl-3.5 pr-4 py-2 rounded-2xl bg-[#080c18]/90 border ${cfg.border} backdrop-blur-xl shadow-2xl shadow-black/60`}>
                    {/* 左侧彩色竖条 */}
                    <div className={`w-0.5 h-8 rounded-full ${cfg.color.replace('text-', 'bg-')} opacity-70`} />
                    {/* 图标 */}
                    <span className={cfg.color}>{cfg.icon}</span>
                    {/* 文字 */}
                    <div className="flex flex-col min-w-0">
                      <span className={`text-[11px] font-semibold leading-tight ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[10px] text-zinc-500 leading-tight mt-0.5">{cfg.desc}</span>
                    </div>
                    {/* 上传进度条 */}
                    {sim.phase === 'uploading' && (
                      <div className="w-20 h-1 bg-zinc-800/80 rounded-full overflow-hidden ml-1 shrink-0">
                        <motion.div
                          className="h-full bg-blue-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${sim.totalBatches > 0 ? (sim.batchDone / sim.totalBatches) * 100 : 0}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                        />
                      </div>
                    )}
                    {/* 分析中脉冲点 */}
                    {(sim.phase === 'analyzing' || sim.phase === 'polling') && (
                      <div className="flex gap-0.5 ml-1 shrink-0">
                        {[0, 1, 2].map(i => (
                          <motion.div
                            key={i}
                            className={`w-1 h-1 rounded-full ${cfg.color.replace('text-', 'bg-')}`}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
                </div>
              </AnimatePresence>
            )
          })()}

          {/* 图谱演示控制按钮（右下角） */}
          {(liveAnalysis?.graph_data?.nodes?.length > 0 || animGraphData?.is_preliminary) && (
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
              {isAnimating && (
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
                  <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${((batchIndex + 1) / totalBatches) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">{batchIndex + 1}/{totalBatches}</span>
                </div>
              )}
              <button
                onClick={() => startGraphAnimation()}
                disabled={isAnimating || (!liveAnalysis?.graph_data?.nodes?.length && !animGraphData?.is_preliminary)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all backdrop-blur-sm ${
                  isAnimating
                    ? 'bg-amber-500/20 text-amber-400 cursor-wait border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                }`}
                title="图谱生成演示"
              >
                <Play className="w-3.5 h-3.5" />
                {isAnimating ? '演示中...' : '图谱演示'}
              </button>
              <button
                onClick={showGraphImmediately}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 border border-sky-500/30 backdrop-blur-sm shadow-lg shadow-sky-500/10 transition-all"
                title="直接显示完整图谱"
              >
                <Eye className="w-3.5 h-3.5" />
                直接显示
              </button>
            </div>
          )}
        </motion.div>

        {/* ── 分割线 ── */}
        <AnimatePresence>
          {focusPanel === 'none' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`relative z-10 flex items-center justify-center w-[5px] cursor-col-resize group
                ${isDragging ? 'bg-cyan-500/30' : 'bg-white/[0.04] hover:bg-cyan-500/20'}
                transition-colors`}
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-y-0 -left-1 -right-1" /> {/* 扩大拖拽热区 */}
              <GripVertical className="w-3 h-3 text-zinc-700 group-hover:text-cyan-400 transition-colors" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 右侧：未来报纸 ── */}
        <motion.div
          className="relative h-full overflow-hidden"
          initial={false}
          animate={{ width: `${100 - effectiveLeft - (focusPanel === 'none' ? 0.3 : 0)}%` }}
          transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
        >
          {/* 面板标题栏 */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-[#060a14] via-[#060a14]/80 to-transparent pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-orange-600" />
              <span className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
                Future Dispatch
              </span>
            </div>
            <button
              onClick={() => toggleFocus('newspaper')}
              className="pointer-events-auto p-1 rounded hover:bg-white/5 text-zinc-600 hover:text-zinc-300 transition-colors"
              title={focusPanel === 'newspaper' ? '还原' : '最大化'}
            >
              {focusPanel === 'newspaper' ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="h-full overflow-y-auto pt-10 pb-6 px-1 custom-scrollbar">
            <FutureNewspaper
              content={liveAnalysis?.newspaper_content || null}
              conclusion={liveAnalysis?.conclusion || null}
              isFinal={liveAnalysis?.is_final}
              version={liveAnalysis?.version}
              preprocessSummary={liveAnalysis?.preprocess_summary}
              marketQuestion={market.question || market.title}
              revealed={!!(liveAnalysis?.is_final && !isAnimating)}
            />
          </div>
        </motion.div>
      </div>

      {/* 自定义滚动条样式（通过 dangerouslySetInnerHTML 注入，避免 styled-jsx 兼容问题） */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      ` }} />
    </div>
  )
}
