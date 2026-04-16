'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'

interface SignalSubmission {
  id: string
  status: string
  submitted_at: string
  user_id: string
}

interface SubmissionChartProps {
  submissions: SignalSubmission[]
  taskId: string
}

export function SubmissionChart({ submissions, taskId }: SubmissionChartProps) {
  // 计算时间序列数据（累计提交量）
  const getTimelineData = () => {
    const sorted = [...submissions].sort(
      (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    )

    return sorted.map((sub, index) => ({
      index: index + 1,
      cumulative: index + 1,
      time: new Date(sub.submitted_at).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }))
  }

  const timelineData = getTimelineData()

  return (
    <div className="space-y-4">
      {/* 统计信息 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">信号提交时间线</h3>
        <div className="text-sm">
          <span className="text-gray-400">提交数量：</span>
          <span className="text-white font-medium">{submissions.length}</span>
        </div>
      </div>

      {/* 图表容器 */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        {submissions.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-500">
            暂无信号提交数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                stroke="#9ca3af"
                tick={{ fill: '#9ca3af' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                  color: '#fff'
                }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Bar dataKey="cumulative" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
