import { notFound } from 'next/navigation'
import SearchDetailView from '@/components/causal-graph/search-detail-view'
import { enrichGraphData } from '@/components/causal-graph/enrich-graph-data'
import { fetchSearchDetail } from '@/services/search-detail'

export const metadata = {
  title: '因果分析 - DelphiGraph',
  description: '查看搜索任务的因果图谱分析与未来通讯',
}

export default async function SearchDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const result = await fetchSearchDetail(params.id)

  if (!result) {
    notFound()
  }

  const { task, submissions, analysis } = result
  const submissionCount = (submissions as unknown[]).length

  // 充实图谱数据：将后端 factor-only 图谱 + signal_submissions 合并为 4 层结构
  // （agent → signal → factor → target）
  const rawAnalysis = analysis && 'graph_data' in analysis ? analysis : null

  const enrichedAnalysis = rawAnalysis
    ? {
        ...rawAnalysis,
        graph_data: enrichGraphData(rawAnalysis.graph_data as never, submissions as never),
      }
    : null

  return (
    <SearchDetailView
      task={task as never}
      analysis={enrichedAnalysis as never}
      submissionCount={submissionCount}
    />
  )
}
