'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PredictionChart } from './prediction-chart'

interface Prediction {
  id: string
  probability: number
  submitted_at: string
  user_id: string
}

interface MarketDetailClientProps {
  taskId: string
  initialPredictions: Prediction[]
}

export function MarketDetailClient({ taskId, initialPredictions }: MarketDetailClientProps) {
  const [predictions, setPredictions] = useState<Prediction[]>(initialPredictions)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // 订阅实时更新
    const channel = supabase
      .channel(`market-${taskId}-predictions`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'predictions',
          filter: `task_id=eq.${taskId}`
        },
        (payload) => {
          console.log('新预测:', payload)
          // 添加新预测到列表
          setPredictions((prev) => [payload.new as Prediction, ...prev])
        }
      )
      .subscribe()

    // 清理订阅
    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId])

  // 手动刷新数据
  const refreshPredictions = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('predictions')
        .select('id, probability, submitted_at, user_id')
        .eq('task_id', taskId)
        .order('submitted_at', { ascending: false })

      if (!error && data) {
        setPredictions(data)
      }
    } catch (error) {
      console.error('刷新预测失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 刷新按钮 */}
      <div className="flex justify-end">
        <button
          onClick={refreshPredictions}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '刷新中...' : '刷新数据'}
        </button>
      </div>

      {/* 图表组件 */}
      <PredictionChart predictions={predictions} taskId={taskId} />

      {/* 实时更新指示器 */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span>实时更新已启用</span>
      </div>
    </div>
  )
}
