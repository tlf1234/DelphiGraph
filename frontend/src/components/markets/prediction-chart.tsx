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

interface Prediction {
  id: string
  probability: number
  submitted_at: string
  user_id: string
}

interface PredictionChartProps {
  predictions: Prediction[]
  taskId: string
}

type ChartType = 'histogram' | 'timeline'

export function PredictionChart({ predictions, taskId }: PredictionChartProps) {
  const [chartType, setChartType] = useState<ChartType>('histogram')

  // 计算概率分布直方图数据
  const getHistogramData = () => {
    const bins = [
      { range: '0-10%', min: 0, max: 0.1, count: 0 },
      { range: '10-20%', min: 0.1, max: 0.2, count: 0 },
      { range: '20-30%', min: 0.2, max: 0.3, count: 0 },
      { range: '30-40%', min: 0.3, max: 0.4, count: 0 },
      { range: '40-50%', min: 0.4, max: 0.5, count: 0 },
      { range: '50-60%', min: 0.5, max: 0.6, count: 0 },
      { range: '60-70%', min: 0.6, max: 0.7, count: 0 },
      { range: '70-80%', min: 0.7, max: 0.8, count: 0 },
      { range: '80-90%', min: 0.8, max: 0.9, count: 0 },
      { range: '90-100%', min: 0.9, max: 1.0, count: 0 }
    ]

    predictions.forEach(pred => {
      const bin = bins.find(b => pred.probability >= b.min && pred.probability < b.max)
      if (bin) bin.count++
      // 处理100%的情况
      if (pred.probability === 1.0) bins[bins.length - 1].count++
    })

    return bins
  }

  // 计算时间序列数据
  const getTimelineData = () => {
    const sorted = [...predictions].sort(
      (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    )

    return sorted.map((pred, index) => ({
      index: index + 1,
      probability: pred.probability,
      time: new Date(pred.submitted_at).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }))
  }

  // 计算共识概率（平均值）
  const consensusProbability =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length
      : 0

  const histogramData = getHistogramData()
  const timelineData = getTimelineData()

  // 获取柱状图颜色
  const getBarColor = (count: number) => {
    const maxCount = Math.max(...histogramData.map(d => d.count))
    const intensity = count / maxCount
    if (intensity > 0.7) return '#10b981' // 绿色
    if (intensity > 0.4) return '#3b82f6' // 蓝色
    return '#6b7280' // 灰色
  }

  return (
    <div className="space-y-4">
      {/* 图表类型切换 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setChartType('histogram')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              chartType === 'histogram'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            概率分布
          </button>
          <button
            onClick={() => setChartType('timeline')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              chartType === 'timeline'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            时间序列
          </button>
        </div>

        {/* 统计信息 */}
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-gray-400">预测数量：</span>
            <span className="text-white font-medium">{predictions.length}</span>
          </div>
          <div>
            <span className="text-gray-400">共识概率：</span>
            <span className="text-blue-400 font-medium">
              {(consensusProbability * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* 图表容器 */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        {predictions.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-500">
            暂无预测数据
          </div>
        ) : chartType === 'histogram' ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={histogramData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="range"
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
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {histogramData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.count)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                stroke="#9ca3af"
                tick={{ fill: '#9ca3af' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#9ca3af"
                tick={{ fill: '#9ca3af' }}
                domain={[0, 1]}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                  color: '#fff'
                }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, '概率']}
              />
              <Line
                type="monotone"
                dataKey="probability"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
