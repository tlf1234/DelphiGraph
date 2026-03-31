import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function PredictionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div className="text-white">请先登录</div>
  }

  // 获取用户的所有预测
  const { data: predictions, error } = await supabase
    .from('predictions')
    .select(`
      id,
      probability,
      rationale,
      brier_score,
      reward_earned,
      submitted_at,
      markets (
        id,
        title,
        question,
        status,
        actual_outcome,
        closes_at
      )
    `)
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Error fetching predictions:', error)
    return <div className="text-white">加载预测失败</div>
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-emerald-400">我的</span>预测
          </h1>
          <p className="text-zinc-400 mt-2 font-mono text-sm">
            查看您的所有预测记录和结果
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">总预测数</div>
            <div className="text-3xl font-bold text-white">{predictions?.length || 0}</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">待结算</div>
            <div className="text-3xl font-bold text-white">
              {predictions?.filter((p) => (p.markets as any)?.status === 'active' || (p.markets as any)?.status === 'closed').length || 0}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">已结算</div>
            <div className="text-3xl font-bold text-white">
              {predictions?.filter((p) => (p.markets as any)?.status === 'resolved').length || 0}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
            <div className="text-xs text-zinc-500 font-mono mb-2">总收益</div>
            <div className="text-3xl font-bold text-emerald-400">
              ¥{predictions?.reduce((sum, p) => sum + (p.reward_earned || 0), 0).toFixed(2) || '0.00'}
            </div>
          </div>
        </div>

        {/* 预测列表 */}
        {!predictions || predictions.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-12 text-center">
            <p className="text-zinc-400 text-lg">暂无预测记录</p>
            <p className="text-zinc-500 text-sm mt-2">
              使用Python SDK连接您的本地Agent来提交预测
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
            {predictions.map((prediction) => {
              const market = prediction.markets as any
              const isResolved = market?.status === 'resolved'
              const isCorrect = isResolved && market.actual_outcome !== null
                ? (prediction.probability > 0.5 && market.actual_outcome === 1) ||
                  (prediction.probability <= 0.5 && market.actual_outcome === 0)
                : null

              return (
                <div
                  key={prediction.id}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <Link
                        href={`/searchs/${market?.id}`}
                        className="text-xl font-semibold text-white hover:text-emerald-400 transition-colors"
                      >
                        {market?.title}
                      </Link>
                      <p className="text-zinc-400 text-sm mt-1">{market?.question}</p>
                    </div>
                    {isResolved && isCorrect !== null && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono border ${
                          isCorrect
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}
                      >
                        {isCorrect ? '✓ 正确' : '✗ 错误'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-zinc-500 font-mono mb-1">我的预测</div>
                      <div className="text-2xl font-bold text-emerald-400">
                        {(prediction.probability * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 font-mono mb-1">提交时间</div>
                      <div className="text-sm font-mono text-white">
                        {new Date(prediction.submitted_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    {isResolved && prediction.brier_score !== null && (
                      <div>
                        <div className="text-xs text-zinc-500 font-mono mb-1">Brier Score</div>
                        <div className="text-sm font-mono text-white">
                          {prediction.brier_score.toFixed(4)}
                        </div>
                      </div>
                    )}
                    {isResolved && prediction.reward_earned !== null && (
                      <div>
                        <div className="text-xs text-zinc-500 font-mono mb-1">收益</div>
                        <div className="text-lg font-bold text-emerald-400">
                          ¥{prediction.reward_earned.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                    <div className="text-xs text-zinc-500 font-mono mb-2">推理理由</div>
                    <p className="text-zinc-300 text-sm line-clamp-3">{prediction.rationale}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
