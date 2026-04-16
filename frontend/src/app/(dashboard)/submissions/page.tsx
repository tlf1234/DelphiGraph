import Link from 'next/link'
import { redirect } from 'next/navigation'
import { fetchUserSubmissions } from '@/services/submissions'

export default async function SubmissionsPage() {
  const result = await fetchUserSubmissions()

  if (!result) redirect('/login')

  const { submissions } = result

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-emerald-400">我的</span>提交
          </h1>
          <p className="text-zinc-400 mt-2 font-mono text-sm">
            查看您的所有信号提交记录和结果
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">总提交数</div>
            <div className="text-3xl font-bold text-white">{submissions?.length || 0}</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">待结算</div>
            <div className="text-3xl font-bold text-white">
              {submissions?.filter((p) => (p.prediction_tasks as any)?.status === 'active' || (p.prediction_tasks as any)?.status === 'closed').length || 0}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">已结算</div>
            <div className="text-3xl font-bold text-white">
              {submissions?.filter((p) => (p.prediction_tasks as any)?.status === 'resolved').length || 0}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">总收益</div>
            <div className="text-3xl font-bold text-emerald-400">
              ¥{submissions?.reduce((sum, p) => sum + (p.reward_earned || 0), 0).toFixed(2) || '0.00'}
            </div>
          </div>
        </div>

        {/* 提交列表 */}
        {!submissions || submissions.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-12 text-center">
            <p className="text-zinc-400 text-lg">暂无提交记录</p>
            <p className="text-zinc-500 text-sm mt-2">
              使用 OpenClaw 插件连接您的本地 Agent 来提交数据因子信号
            </p>
            <Link
              href="/settings"
              className="inline-block mt-4 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-lg transition-colors"
            >
              获取API Key
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission: any) => {
              const task = submission.prediction_tasks as any
              const isResolved = task?.status === 'resolved'
              const signals = submission.signals || []
              const signalCount = signals.length
              const isAbstained = submission.status === 'abstained'

              return (
                <div
                  key={submission.id}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <Link
                        href={`/searchs/${task?.id}`}
                        className="text-xl font-semibold text-white hover:text-emerald-400 transition-colors"
                      >
                        {task?.title}
                      </Link>
                      <p className="text-zinc-400 text-sm mt-1">{task?.question}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono border ${
                        isAbstained
                          ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}
                    >
                      {isAbstained ? '− 弃权' : `✓ ${signalCount} 条信号`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-zinc-500 font-mono mb-1">信号数量</div>
                      <div className="text-2xl font-bold text-emerald-400">
                        {signalCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 font-mono mb-1">提交时间</div>
                      <div className="text-sm font-mono text-white">
                        {new Date(submission.submitted_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    {isResolved && submission.brier_score !== null && (
                      <div>
                        <div className="text-xs text-zinc-500 font-mono mb-1">Brier Score</div>
                        <div className="text-sm font-mono text-white">
                          {submission.brier_score.toFixed(4)}
                        </div>
                      </div>
                    )}
                    {isResolved && submission.reward_earned !== null && (
                      <div>
                        <div className="text-xs text-zinc-500 font-mono mb-1">收益</div>
                        <div className="text-lg font-bold text-emerald-400">
                          ¥{submission.reward_earned.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isAbstained && signals.length > 0 && (
                    <div className="pt-4 border-t border-zinc-800">
                      <div className="text-xs text-zinc-500 font-mono mb-2">数据因子</div>
                      <div className="space-y-2">
                        {signals.slice(0, 3).map((sig: any, i: number) => (
                          <div key={i} className="text-zinc-300 text-sm">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono mr-2 ${
                              sig.evidence_type === 'hard_fact'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {sig.evidence_type === 'hard_fact' ? 'FACT' : 'INFER'}
                            </span>
                            <span className="line-clamp-1">{sig.evidence_text}</span>
                          </div>
                        ))}
                        {signals.length > 3 && (
                          <p className="text-zinc-500 text-xs">…还有 {signals.length - 3} 条信号</p>
                        )}
                      </div>
                    </div>
                  )}
                  {isAbstained && submission.abstain_reason && (
                    <div className="pt-4 border-t border-zinc-800">
                      <div className="text-xs text-zinc-500 font-mono mb-2">弃权原因</div>
                      <p className="text-zinc-300 text-sm">{submission.abstain_reason}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
