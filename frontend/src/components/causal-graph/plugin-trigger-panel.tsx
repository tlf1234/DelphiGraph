'use client'

// ════════════════════════════════════════════════════════════════════
// [TEMP] PluginTriggerPanel — 插件数据接收监控 & 因果分析触发器
//
// 用途：测试阶段，实时监控真实插件（simulate_concurrent.py）发来的信号，
//       当 current_participant_count 达到 target_agent_count 时自动触发因果分析。
//
// 清理方法：删除此文件，并删除 search-detail-view.tsx 中标有 [TEMP-PLUGIN] 的代码块
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import {
  Radio,
  X,
  Zap,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

// ── 类型 ──────────────────────────────────────────────────────────────
type TriggerPhase =
  | 'idle'
  | 'monitoring'     // 正在监控插件信号到达
  | 'threshold_met'  // 达到阈值，准备触发
  | 'triggering'     // 触发中
  | 'triggered'      // 已触发，等待轮询捕获结果
  | 'error'

export interface PluginTriggerPanelProps {
  taskId: string
  /** 与父组件共用的 triggerAnalysis 函数 */
  onTriggerAnalysis: (forceFinal: boolean) => Promise<void>
  /** 触发时同步启动父组件的 causal_analyses 轮询 */
  onStartPolling: () => void
  onClose: () => void
}

const POLL_INTERVAL_MS = 2000  // 每 2 秒轮询一次 DB

export default function PluginTriggerPanel({
  taskId,
  onTriggerAnalysis,
  onStartPolling,
  onClose,
}: PluginTriggerPanelProps) {
  const [phase, setPhase] = useState<TriggerPhase>('idle')
  const [currentCount, setCurrentCount] = useState(0)
  const [targetCount, setTargetCount] = useState(0)
  const [signalCount, setSignalCount] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const monitorRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef(false)
  const thresholdTriggeredRef = useRef(false)  // 防止多次自动触发

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setLog(prev => [...prev.slice(-39), `[${ts}] ${msg}`])
  }, [])

  const stopMonitor = useCallback(() => {
    if (monitorRef.current) {
      clearInterval(monitorRef.current)
      monitorRef.current = null
    }
  }, [])

  // ── 触发因果分析 ─────────────────────────────────────────────────
  const handleTrigger = useCallback(async () => {
    stopMonitor()
    setPhase('triggering')
    addLog('🔬 触发因果分析引擎（force_final=true）...')
    try {
      onStartPolling()  // 提前启动轮询，确保不错过结果
      await onTriggerAnalysis(true)
      setPhase('triggered')
      addLog('⚙️ 因果引擎已接受任务，等待结果（由图谱轮询捕获）...')
    } catch (err) {
      setPhase('error')
      addLog(`❌ 触发失败: ${err}`)
    }
  }, [stopMonitor, addLog, onStartPolling, onTriggerAnalysis])

  // ── 开始监控 ────────────────────────────────────────────────────
  const startMonitor = useCallback(async () => {
    abortRef.current = false
    thresholdTriggeredRef.current = false
    setPhase('monitoring')
    setLog([])

    const supabase = createClient()

    // 初始化：读取任务配置
    const { data: task, error } = await supabase
      .from('prediction_tasks')
      .select('target_agent_count, current_participant_count, signal_submission_count')
      .eq('id', taskId)
      .single()

    if (error || !task) {
      addLog('❌ 无法读取任务信息，请检查 taskId')
      setPhase('error')
      return
    }

    const target = task.target_agent_count ?? 0
    const initial = task.current_participant_count ?? 0
    setTargetCount(target)
    setCurrentCount(initial)
    setSignalCount(task.signal_submission_count ?? 0)

    addLog(`📡 开始监控插件信号（每 ${POLL_INTERVAL_MS / 1000}s 轮询一次）`)
    addLog(`🎯 目标: ${target > 0 ? `${target} 个 Agent` : '无限制（手动触发）'}`)
    addLog(`📊 当前: ${initial} 个 Agent · ${task.signal_submission_count ?? 0} 条信号`)
    if (target > 0 && initial >= target) {
      addLog('⚡ 当前已达到阈值，可直接手动触发')
    }

    let prevCount = initial

    monitorRef.current = setInterval(async () => {
      if (abortRef.current) return

      const { data } = await supabase
        .from('prediction_tasks')
        .select('current_participant_count, signal_submission_count')
        .eq('id', taskId)
        .single()

      if (!data) return

      const count = data.current_participant_count ?? 0
      const sigs = data.signal_submission_count ?? 0
      setCurrentCount(count)
      setSignalCount(sigs)

      if (count !== prevCount) {
        const delta = count - prevCount
        addLog(`📨 +${delta} Agent 到达  →  ${count} / ${target > 0 ? target : '∞'}  (${sigs} 条信号)`)
        prevCount = count
      }

      // 自动触发：达到阈值且未触发过
      if (target > 0 && count >= target && !thresholdTriggeredRef.current) {
        thresholdTriggeredRef.current = true
        setPhase('threshold_met')
        addLog(`✅ 达到目标人数 ${target}！1 秒后自动触发因果分析...`)
        setTimeout(() => {
          if (!abortRef.current) handleTrigger()
        }, 1000)
      }
    }, POLL_INTERVAL_MS)
  }, [taskId, addLog, handleTrigger])

  // ── 停止监控 ─────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    abortRef.current = true
    stopMonitor()
    setPhase('idle')
    addLog('⏹ 监控已停止')
  }, [stopMonitor, addLog])

  // 卸载时清理
  useEffect(() => () => { stopMonitor() }, [stopMonitor])

  const progressPct = targetCount > 0 ? Math.min((currentCount / targetCount) * 100, 100) : 0
  const isRunning = phase === 'monitoring' || phase === 'threshold_met' || phase === 'triggering'
  const isDone = phase === 'triggered'
  const isError = phase === 'error'

  const phaseLabel: Record<TriggerPhase, string> = {
    idle: '',
    monitoring: '监控中',
    threshold_met: '达到阈值',
    triggering: '触发中',
    triggered: '已触发',
    error: '错误',
  }

  const phaseIcon: Partial<Record<TriggerPhase, React.ReactNode>> = {
    monitoring: <Radio className="w-3 h-3 animate-pulse text-emerald-400" />,
    threshold_met: <Zap className="w-3 h-3 text-amber-400 animate-pulse" />,
    triggering: <Loader2 className="w-3 h-3 animate-spin" />,
    triggered: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    error: <AlertCircle className="w-3 h-3 text-rose-400" />,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-[60px] right-[412px] z-50 w-80 max-h-[70vh] flex flex-col
                 bg-[#0d1225]/95 border border-emerald-500/20 rounded-xl shadow-2xl
                 shadow-emerald-500/10 backdrop-blur-xl overflow-hidden"
    >
      {/* ── 标题栏 ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-emerald-500/5">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-300">插件信号监控</span>
          {phase !== 'idle' && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
              {phaseIcon[phase]}
              {phaseLabel[phase]}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── 计数器与进度条 ─────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-white/[0.04] space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-zinc-500">Agent 已到达</span>
          <span className={`font-bold ${isDone ? 'text-emerald-400' : 'text-zinc-200'}`}>
            {currentCount}
            {targetCount > 0 && <span className="text-zinc-500"> / {targetCount}</span>}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-zinc-500">信号条数</span>
          <span className="text-zinc-300">{signalCount}</span>
        </div>
        {targetCount > 0 && (
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        )}
      </div>

      {/* ── 操作按钮 ──────────────────────────────────────────── */}
      <div className="px-4 py-2.5 flex gap-2 border-b border-white/[0.04]">
        {!isRunning && !isDone ? (
          <button
            onClick={startMonitor}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                       text-xs font-semibold bg-emerald-500/20 text-emerald-300
                       hover:bg-emerald-500/30 border border-emerald-500/30 transition-all"
          >
            <Radio className="w-3.5 h-3.5" />
            {phase === 'error' ? '重新监控' : '开始监控'}
          </button>
        ) : isRunning ? (
          <button
            onClick={handleStop}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                       text-xs font-semibold bg-rose-500/20 text-rose-300
                       hover:bg-rose-500/30 border border-rose-500/30 transition-all"
          >
            <Square className="w-3.5 h-3.5" />
            停止监控
          </button>
        ) : null}

        {/* 手动触发（监控中或 idle 已有数据时可用） */}
        <button
          onClick={handleTrigger}
          disabled={phase === 'triggering' || phase === 'triggered'}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold
                     bg-amber-500/10 text-amber-400 hover:bg-amber-500/20
                     border border-amber-500/20 transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="手动立即触发因果分析（不等达到阈值）"
        >
          <Zap className="w-3.5 h-3.5" />
          立即触发
        </button>
      </div>

      {/* ── 日志 ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
        {log.length === 0 ? (
          <p className="text-[11px] text-zinc-600 italic">
            点击「开始监控」后实时显示插件信号到达情况
          </p>
        ) : (
          [...log].reverse().map((line, i) => (
            <p key={i} className="text-[10px] font-mono text-zinc-400 leading-relaxed">{line}</p>
          ))
        )}
      </div>

      {isError && (
        <div className="px-4 py-2 border-t border-rose-500/20 bg-rose-500/5">
          <p className="text-[10px] text-rose-400 font-mono">监控出现错误，请检查网络或任务状态</p>
        </div>
      )}
    </motion.div>
  )
}
