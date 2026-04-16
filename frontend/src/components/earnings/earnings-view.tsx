'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, DollarSign, Target, CheckCircle, XCircle, Clock } from 'lucide-react'

interface EarningsRecord {
  task_id: string
  task_title: string
  task_question: string
  signal_probability: number
  signal_rationale: string
  predicted_at: string
  task_outcome: boolean | null
  was_correct: boolean | null
  earnings: number
  reputation_change: number
  settled_at: string | null
}

interface EarningsSummary {
  total_earnings: number
  total_tasks: number
  resolved_tasks: number
  correct_submissions: number
  incorrect_submissions: number
  pending_tasks: number
  accuracy_rate: string
}

export default function EarningsView() {
  const [earnings, setEarnings] = useState<EarningsRecord[]>([])
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchEarningsHistory()
  }, [])

  const fetchEarningsHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/earnings', {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch earnings history')
      }

      const data = await response.json()
      setEarnings(data.earnings || [])
      setSummary(data.summary)
    } catch (error) {
      console.error('Error fetching earnings:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-100">收益历史</h1>
          <p className="text-gray-400 mt-1">查看您在每个任务的收益明细</p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-[#1a1f3a] border-[#2a3f5f]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                总收益
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#00ff88]">
                ¥{summary.total_earnings.toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                来自 {summary.resolved_tasks} 个已结算任务
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1f3a] border-[#2a3f5f]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Target className="h-4 w-4" />
                准确率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#00d4ff]">
                {summary.accuracy_rate}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary.correct_submissions}/{summary.resolved_tasks} 正确
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1f3a] border-[#2a3f5f]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                正确提交
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-400">
                {summary.correct_submissions}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                信誉分 +{summary.correct_submissions * 10}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1f3a] border-[#2a3f5f]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                错误提交
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-400">
                {summary.incorrect_submissions}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                信誉分 {summary.incorrect_submissions * -20}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Earnings History Table */}
      <Card className="bg-[#1a1f3a] border-[#2a3f5f]">
        <CardHeader>
          <CardTitle className="text-gray-100">收益明细</CardTitle>
          <CardDescription>
            所有任务的信号提交和收益记录
          </CardDescription>
        </CardHeader>
        <CardContent>
          {earnings.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Target className="h-16 w-16 mx-auto mb-4 text-gray-600" />
              <p className="text-lg">暂无收益记录</p>
              <p className="text-sm mt-2">参与信号提交后，收益将显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              {earnings.map((record, index) => (
                <div
                  key={`${record.task_id}-${index}`}
                  className="bg-[#0a0e27] border border-[#2a3f5f] rounded-lg p-4 hover:border-[#00ff88]/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-100 mb-1">
                        {record.task_title}
                      </h3>
                      <p className="text-sm text-gray-400 mb-2">
                        {record.task_question}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          提交时间: {new Date(record.predicted_at).toLocaleDateString('zh-CN')}
                        </span>
                        {record.settled_at && (
                          <>
                            <span>•</span>
                            <span>
                              结算时间: {new Date(record.settled_at).toLocaleDateString('zh-CN')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {record.was_correct === null ? (
                        <div className="flex items-center gap-2 bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm">
                          <Clock className="h-4 w-4" />
                          <span>待结算</span>
                        </div>
                      ) : record.was_correct ? (
                        <div className="flex items-center gap-2 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm border border-green-500/30">
                          <CheckCircle className="h-4 w-4" />
                          <span>正确</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm border border-red-500/30">
                          <XCircle className="h-4 w-4" />
                          <span>错误</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submission Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-[#2a3f5f]">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">我的提交</div>
                      <div className="text-lg font-medium text-gray-200">
                        {record.signal_probability >= 0.5 ? 'Yes' : 'No'}
                        <span className="text-sm text-gray-400 ml-2">
                          ({(record.signal_probability * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>

                    {record.task_outcome !== null && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">实际结果</div>
                        <div className="text-lg font-medium text-gray-200">
                          {record.task_outcome ? 'Yes' : 'No'}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-gray-500 mb-1">收益 / 信誉变化</div>
                      <div className="flex items-center gap-3">
                        {record.earnings > 0 ? (
                          <div className="flex items-center gap-1 text-[#00ff88]">
                            <TrendingUp className="h-4 w-4" />
                            <span className="font-medium">¥{record.earnings.toFixed(2)}</span>
                          </div>
                        ) : (
                          <div className="text-gray-500">¥0.00</div>
                        )}
                        
                        {record.reputation_change !== 0 && (
                          <div className={`flex items-center gap-1 ${record.reputation_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {record.reputation_change > 0 ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                            <span className="font-medium">
                              {record.reputation_change > 0 ? '+' : ''}{record.reputation_change}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rationale */}
                  {record.signal_rationale && (
                    <div className="mt-3 pt-3 border-t border-[#2a3f5f]">
                      <div className="text-xs text-gray-500 mb-1">推理说明</div>
                      <p className="text-sm text-gray-400 line-clamp-2">
                        {record.signal_rationale}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
