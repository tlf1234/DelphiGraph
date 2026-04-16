'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SubmissionChart } from './submission-chart'

interface SignalSubmission {
  id: string
  status: string
  submitted_at: string
  user_id: string
}

interface TaskDetailClientProps {
  taskId: string
  initialSubmissions: SignalSubmission[]
}

export function TaskDetailClient({ taskId, initialSubmissions }: TaskDetailClientProps) {
  const [submissions, setSubmissions] = useState<SignalSubmission[]>(initialSubmissions)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // 订阅实时更新
    const channel = supabase
      .channel(`task-${taskId}-signals`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signal_submissions',
          filter: `task_id=eq.${taskId}`
        },
        (payload) => {
          console.log('新信号提交:', payload)
          // 添加新提交到列表
          setSubmissions((prev) => [payload.new as SignalSubmission, ...prev])
        }
      )
      .subscribe()

    // 清理订阅
    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId])

  // 手动刷新数据
  const refreshSubmissions = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('signal_submissions')
        .select('id, status, submitted_at, user_id')
        .eq('task_id', taskId)
        .order('submitted_at', { ascending: false })

      if (!error && data) {
        setSubmissions(data)
      }
    } catch (error) {
      console.error('刷新信号提交失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 刷新按钮 */}
      <div className="flex justify-end">
        <button
          onClick={refreshSubmissions}
          disabled={isLoading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '刷新中...' : '刷新数据'}
        </button>
      </div>

      {/* 图表组件 */}
      <SubmissionChart submissions={submissions} taskId={taskId} />

      {/* 实时更新指示器 */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span>实时更新已启用</span>
      </div>
    </div>
  )
}
