'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, XCircle, Flame, Trophy } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface CalibrationTask {
  id: string
  title: string
  description: string
  question: string
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
  historical_date: string
}

interface RedemptionProgress {
  currentStreak: number
  requiredStreak: number
  currentScore: number
  requiredScore: number
  canRedeem: boolean
  purgatoryDays: number
}

interface PurgatoryViewProps {
  profile: {
    status: string
    redemption_streak: number
    reputation_score: number
    purgatory_entered_at: string
    purgatory_reason: string
    username: string
  }
  purgatoryUsers: Array<{
    id: string
    username: string
    avatar_url: string | null
    reputation_score: number
    redemption_streak: number
    purgatory_entered_at: string
  }>
  purgatoryCount: number
}

export default function PurgatoryView({ profile, purgatoryUsers, purgatoryCount }: PurgatoryViewProps) {
  const [tasks, setTasks] = useState<CalibrationTask[]>([])
  const [progress, setProgress] = useState<RedemptionProgress | null>(null)
  const [selectedTask, setSelectedTask] = useState<CalibrationTask | null>(null)
  const [answer, setAnswer] = useState<boolean | null>(null)
  const [rationale, setRationale] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/purgatory/tasks', {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tasks')
      }

      const data = await response.json()
      setTasks(data.tasks || [])
      setProgress(data.redemptionProgress)
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedTask || answer === null) return

    setSubmitting(true)
    setResult(null)

    try {
      const response = await fetch('/api/purgatory/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: selectedTask.id,
          answer,
          rationale,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit answer')
      }

      const data = await response.json()
      setResult(data)

      // If redeemed, redirect after 3 seconds
      if (data.redeemed) {
        setTimeout(() => {
          window.location.href = '/markets'
        }, 3000)
      } else {
        // Refresh tasks and reset form
        setTimeout(() => {
          fetchTasks()
          setSelectedTask(null)
          setAnswer(null)
          setRationale('')
          setResult(null)
        }, 3000)
      }
    } catch (error) {
      console.error('Error submitting answer:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'hard':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const progressPercent = progress 
    ? (progress.currentStreak / progress.requiredStreak) * 100 
    : 0

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Purgatory Status Banner */}
      <Alert className="border-orange-500 bg-orange-950/20">
        <Flame className="h-5 w-5 text-orange-500" />
        <AlertTitle className="text-orange-500 text-lg">炼狱模式 (Purgatory Mode)</AlertTitle>
        <AlertDescription className="text-gray-300 mt-2">
          <p className="mb-2">您的信誉分低于60分，账号已进入炼狱模式。</p>
          <p className="mb-2">
            <strong>救赎条件：</strong>连续答对5个校准任务 且 信誉分≥60
          </p>
          <p className="text-sm text-gray-400">
            进入时间：{new Date(profile.purgatory_entered_at).toLocaleString('zh-CN')} | 
            原因：{profile.purgatory_reason}
          </p>
        </AlertDescription>
      </Alert>

      {/* Redemption Progress */}
      {progress && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              救赎进度
            </CardTitle>
            <CardDescription>
              完成救赎条件后将自动恢复正常状态
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-400">连续正确</span>
                <span className="text-sm font-medium">
                  {progress.currentStreak} / {progress.requiredStreak}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-400">当前信誉分</div>
                <div className={`text-2xl font-bold ${progress.currentScore >= progress.requiredScore ? 'text-green-500' : 'text-orange-500'}`}>
                  {progress.currentScore.toFixed(0)}
                </div>
                <div className="text-xs text-gray-500">需要 ≥{progress.requiredScore}</div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-400">炼狱天数</div>
                <div className="text-2xl font-bold text-orange-500">
                  {progress.purgatoryDays}
                </div>
                <div className="text-xs text-gray-500">天</div>
              </div>
            </div>
            {progress.canRedeem && (
              <Alert className="border-green-500 bg-green-950/20">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-500">
                  您已满足救赎条件！完成下一个任务后将自动恢复正常状态
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submission Result */}
      {result && (
        <Alert className={result.isCorrect ? 'border-green-500 bg-green-950/20' : 'border-red-500 bg-red-950/20'}>
          {result.isCorrect ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          <AlertTitle className={result.isCorrect ? 'text-green-500' : 'text-red-500'}>
            {result.message}
          </AlertTitle>
          <AlertDescription className="text-gray-300 mt-2">
            <div className="space-y-1">
              <p>信誉分变化：{result.reputationBefore.toFixed(0)} → {result.reputationAfter.toFixed(0)} ({result.reputationChange > 0 ? '+' : ''}{result.reputationChange})</p>
              <p>连胜数：{result.streakBefore} → {result.streakAfter}</p>
              {result.redeemed && (
                <p className="text-green-400 font-medium mt-2">正在跳转到市场页面...</p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Task Selection or Submission Form */}
      {!selectedTask ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle>校准任务列表</CardTitle>
            <CardDescription>
              选择一个任务开始答题。这些都是已知答案的历史问题。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-400">加载中...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-400">暂无可用任务</div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 bg-gray-800 rounded-lg hover:bg-gray-750 cursor-pointer transition-colors"
                    onClick={() => setSelectedTask(task)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-white">{task.title}</h3>
                      <Badge className={getDifficultyColor(task.difficulty)}>
                        {task.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">{task.description}</p>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>分类：{task.category}</span>
                      {task.historical_date && (
                        <span>• 日期：{new Date(task.historical_date).toLocaleDateString('zh-CN')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{selectedTask.title}</CardTitle>
                <CardDescription className="mt-2">
                  {selectedTask.description}
                </CardDescription>
              </div>
              <Badge className={getDifficultyColor(selectedTask.difficulty)}>
                {selectedTask.difficulty}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg">
              <h4 className="font-medium mb-2">问题</h4>
              <p className="text-gray-300">{selectedTask.question}</p>
            </div>

            <div>
              <h4 className="font-medium mb-3">您的答案</h4>
              <div className="flex gap-4">
                <Button
                  variant={answer === true ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setAnswer(true)}
                >
                  是 (Yes)
                </Button>
                <Button
                  variant={answer === false ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setAnswer(false)}
                >
                  否 (No)
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">推理说明（可选）</h4>
              <Textarea
                placeholder="请简要说明您的推理过程..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={4}
                className="bg-gray-800 border-gray-700"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleSubmit}
                disabled={answer === null || submitting}
                className="flex-1"
              >
                {submitting ? '提交中...' : '提交答案'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTask(null)
                  setAnswer(null)
                  setRationale('')
                }}
                disabled={submitting}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Other Purgatory Users Section */}
      {purgatoryUsers.length > 1 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              其他炼狱中的预言家
            </CardTitle>
            <CardDescription>
              共有 {purgatoryCount} 位预言家正在进行救赎（包括你）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {purgatoryUsers
                .filter(user => user.username !== profile.username)
                .slice(0, 10)
                .map((user, index) => {
                  const progressPercent = (user.redemption_streak / 5) * 100
                  const daysInPurgatory = Math.floor(
                    (new Date().getTime() - new Date(user.purgatory_entered_at).getTime()) / (1000 * 60 * 60 * 24)
                  )

                  return (
                    <div
                      key={user.id}
                      className="p-3 bg-gray-800 rounded-lg flex items-center gap-3"
                    >
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.username}
                          className="w-10 h-10 rounded-full border-2 border-orange-500/30"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center border-2 border-orange-500/30">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <div className="font-medium text-white">{user.username}</div>
                        <div className="text-xs text-gray-400">
                          信誉分: {user.reputation_score.toFixed(0)} | {daysInPurgatory} 天
                        </div>
                      </div>

                      <div className="w-32">
                        <div className="text-xs text-gray-400 mb-1 text-right">
                          {user.redemption_streak}/5
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-orange-500 to-yellow-500 h-full rounded-full transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
            
            {purgatoryUsers.length > 11 && (
              <div className="text-center mt-4 text-sm text-gray-400">
                还有 {purgatoryUsers.length - 11} 位预言家在炼狱中...
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
