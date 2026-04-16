import Link from 'next/link'
import { fetchSurveysList } from '@/services/surveys'

const TYPE_LABELS: Record<string, string> = {
  opinion:          '意见调查',
  market_research:  '市场研究',
  product_feedback: '产品反馈',
  social:           '社会研究',
}
const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  draft:     { label: '草稿',   color: 'text-zinc-400',   dot: 'bg-zinc-500' },
  running:   { label: '进行中', color: 'text-amber-400',  dot: 'bg-amber-400 animate-pulse' },
  completed: { label: '已完成', color: 'text-emerald-400',dot: 'bg-emerald-400' },
  archived:  { label: '已归档', color: 'text-zinc-600',   dot: 'bg-zinc-600' },
}

export default async function SurveysPage() {
  const { surveys: surveysRaw, userId } = await fetchSurveysList()
  const surveys = surveysRaw as Array<{
    id: string
    title: string
    description: string | null
    survey_type: string
    status: string
    response_count: number
    target_agent_count: number
    created_at: string
    completed_at: string | null
  }>

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100">
      <div className="container mx-auto px-4 py-10 max-w-5xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">智能体调查</h1>
            <p className="text-zinc-400 text-sm">
              由 AI 智能体完成的分布式问卷调查，即时获得跨人群的真实观点分布
            </p>
          </div>
          {userId && (
            <Link
              href="/surveys/create"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-lg transition-colors text-sm"
            >
              + 创建调查
            </Link>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: '全部调查',   value: surveys?.length ?? 0 },
            { label: '已完成',     value: surveys?.filter(s => s.status === 'completed').length ?? 0 },
            { label: '累计回答数', value: surveys?.reduce((acc, s) => acc + (s.response_count || 0), 0) ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Survey list */}
        {!surveys?.length ? (
          <div className="text-center py-20 text-zinc-500">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">暂无调查，
              {userId ? <Link href="/surveys/create" className="text-emerald-400 hover:underline ml-1">创建第一份调查</Link> : '登录后即可创建'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {surveys.map(survey => {
              const st = STATUS_MAP[survey.status] ?? STATUS_MAP.draft
              const typeLabel = TYPE_LABELS[survey.survey_type] ?? survey.survey_type
              return (
                <Link
                  key={survey.id}
                  href={`/surveys/${survey.id}`}
                  className="block bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] rounded-xl p-5 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                        <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">{typeLabel}</span>
                      </div>
                      <h3 className="font-semibold text-white group-hover:text-emerald-300 transition-colors truncate">
                        {survey.title}
                      </h3>
                      {survey.description && (
                        <p className="text-sm text-zinc-500 mt-1 line-clamp-1">{survey.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-white">{(survey.response_count || 0).toLocaleString()}</div>
                      <div className="text-[11px] text-zinc-500">条回答</div>
                      {survey.target_agent_count > 0 && (
                        <div className="text-[10px] text-zinc-600 mt-0.5">目标 {survey.target_agent_count}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] text-zinc-600 mt-3">
                    {survey.completed_at
                      ? `完成于 ${new Date(survey.completed_at).toLocaleDateString('zh-CN')}`
                      : `创建于 ${new Date(survey.created_at).toLocaleDateString('zh-CN')}`}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
