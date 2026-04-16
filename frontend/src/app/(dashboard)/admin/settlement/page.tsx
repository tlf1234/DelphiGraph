'use client'

import { useEffect, useState } from 'react'

interface Task {
  id: string
  title: string
  question: string
  closes_at: string
  status: string
  reward_pool: number
  submission_count?: number
}

export default function AdminSettlementPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settlement')
      if (res.status === 403) {
        setIsAdmin(false)
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setIsAdmin(true)
      setTasks(data.tasks || [])
    } catch (error) {
      console.error('Error loading tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSettle(taskId: string, outcome: boolean) {
    if (!confirm(`确认结算此任务？结果为：${outcome ? 'Yes' : 'No'}`)) {
      return
    }

    setSettling(taskId)

    try {
      const res = await fetch('/api/admin/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, outcome }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '结算失败')

      // v3.0: signal_submissions 不含 probability，结算按提交状态分
      alert(`结算成功！\n有效提交: ${data.activeSubmissions}\n每人奖励: ${(data.rewardPerWinner as number).toFixed(2)}`)

      await loadTasks()
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
      <h1 className="text-3xl font-bold mb-6">任务结算管理</h1>
      
      {tasks.length === 0 ? (
        <p className="text-gray-500">暂无待结算的任务</p>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="border rounded-lg p-6 bg-white shadow">
              <h2 className="text-xl font-semibold mb-2">{task.title}</h2>
              <p className="text-gray-600 mb-4">{task.question}</p>
              
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">截止时间:</span>
                  <span className="ml-2">{new Date(task.closes_at).toLocaleString('zh-CN')}</span>
                </div>
                <div>
                  <span className="text-gray-500">提交数量:</span>
                  <span className="ml-2">{task.submission_count}</span>
                </div>
                <div>
                  <span className="text-gray-500">奖金池:</span>
                  <span className="ml-2">{task.reward_pool}</span>
                </div>
                <div>
                  <span className="text-gray-500">状态:</span>
                  <span className="ml-2 text-orange-600">{task.status}</span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => handleSettle(task.id, true)}
                  disabled={settling === task.id}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  {settling === task.id ? '处理中...' : '结算为 Yes'}
                </button>
                <button
                  onClick={() => handleSettle(task.id, false)}
                  disabled={settling === task.id}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  {settling === task.id ? '处理中...' : '结算为 No'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
