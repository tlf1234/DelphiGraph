'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Market {
  id: string
  title: string
  question: string
  closes_at: string
  status: string
  reward_pool: number
  prediction_count?: number
}

export default function AdminSettlementPage() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    checkAdminAndLoadMarkets()
  }, [])

  async function checkAdminAndLoadMarkets() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    setIsAdmin(true)
    await loadClosedMarkets()
  }

  async function loadClosedMarkets() {
    const { data, error } = await supabase
      .from('markets')
      .select('*')
      .eq('status', 'closed')
      .order('closes_at', { ascending: false })

    if (error) {
      console.error('Error loading markets:', error)
    } else {
      const marketsWithCounts = await Promise.all(
        (data || []).map(async (market) => {
          const { count } = await supabase
            .from('predictions')
            .select('*', { count: 'exact', head: true })
            .eq('task_id', market.id)
          
          return { ...market, prediction_count: count || 0 }
        })
      )
      setMarkets(marketsWithCounts)
    }
    setLoading(false)
  }

  async function handleSettle(taskId: string, outcome: boolean) {
    if (!confirm(`确认结算此市场？结果为：${outcome ? 'Yes' : 'No'}`)) {
      return
    }

    setSettling(taskId)

    try {
      const { data: market } = await supabase
        .from('markets')
        .select('*')
        .eq('id', taskId)
        .single()

      if (!market) throw new Error('Market not found')

      const { data: predictions } = await supabase
        .from('predictions')
        .select('*')
        .eq('task_id', taskId)

      if (!predictions) throw new Error('No predictions found')

      const correctPredictions = predictions.filter(p => {
        const predictedOutcome = p.probability >= 0.5
        return predictedOutcome === outcome
      })

      const incorrectPredictions = predictions.filter(p => {
        const predictedOutcome = p.probability >= 0.5
        return predictedOutcome !== outcome
      })

      const rewardPerWinner = correctPredictions.length > 0 
        ? market.reward_pool / correctPredictions.length 
        : 0

      for (const prediction of correctPredictions) {
        await supabase.rpc('update_user_reputation_and_earnings', {
          p_user_id: prediction.user_id,
          p_reputation_change: 10,
          p_earnings_change: rewardPerWinner
        })
      }

      for (const prediction of incorrectPredictions) {
        await supabase.rpc('update_user_reputation_and_earnings', {
          p_user_id: prediction.user_id,
          p_reputation_change: -20,
          p_earnings_change: 0
        })
      }

      await supabase
        .from('markets')
        .update({
          status: 'resolved',
          actual_outcome: outcome ? 1 : 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase
        .from('market_status_audit')
        .insert({
          task_id: taskId,
          old_status: 'closed',
          new_status: 'resolved',
          changed_by: `admin:${user?.id}`
        })

      alert(`结算成功！\n正确预测: ${correctPredictions.length}\n错误预测: ${incorrectPredictions.length}\n每人奖励: ${rewardPerWinner.toFixed(2)}`)
      
      await loadClosedMarkets()
    } catch (error) {
      console.error('Settlement error:', error)
      alert('结算失败: ' + (error as Error).message)
    } finally {
      setSettling(null)
    }
  }

  if (loading) {
    return <div className="p-8">加载中...</div>
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">访问被拒绝</h1>
        <p className="mt-4">此页面仅限管理员访问。</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">市场结算管理</h1>
      
      {markets.length === 0 ? (
        <p className="text-gray-500">暂无待结算的市场</p>
      ) : (
        <div className="space-y-4">
          {markets.map((market) => (
            <div key={market.id} className="border rounded-lg p-6 bg-white shadow">
              <h2 className="text-xl font-semibold mb-2">{market.title}</h2>
              <p className="text-gray-600 mb-4">{market.question}</p>
              
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">截止时间:</span>
                  <span className="ml-2">{new Date(market.closes_at).toLocaleString('zh-CN')}</span>
                </div>
                <div>
                  <span className="text-gray-500">预测数量:</span>
                  <span className="ml-2">{market.prediction_count}</span>
                </div>
                <div>
                  <span className="text-gray-500">奖金池:</span>
                  <span className="ml-2">{market.reward_pool}</span>
                </div>
                <div>
                  <span className="text-gray-500">状态:</span>
                  <span className="ml-2 text-orange-600">{market.status}</span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => handleSettle(market.id, true)}
                  disabled={settling === market.id}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  {settling === market.id ? '处理中...' : '结算为 Yes'}
                </button>
                <button
                  onClick={() => handleSettle(market.id, false)}
                  disabled={settling === market.id}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  {settling === market.id ? '处理中...' : '结算为 No'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
