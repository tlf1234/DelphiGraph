import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import SearchDetailView from '@/components/causal-graph/search-detail-view'
import { enrichGraphData } from '@/components/causal-graph/enrich-graph-data'

export const metadata = {
  title: '因果分析 - DelphiGraph',
  description: '查看搜索任务的因果图谱分析与未来通讯',
}

export default async function SearchDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  // 获取任务详情
  const { data: market, error } = await supabase
    .from('markets')
    .select('id, title, question, description, status, closes_at, reward_pool, created_at')
    .eq('id', params.id)
    .single()

  if (error || !market) {
    notFound()
  }

  // 获取预测详情（使用 service role 绕过 user-scoped RLS，用于生成 agent/signal 节点）
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: predictions } = await serviceSupabase
    .from('predictions')
    .select(
      'id, user_id, probability, rationale, evidence_type, relevance_score, ' +
      'entity_tags, source_url, submitted_at, ' +
      'profiles(id, username, avatar_url, reputation_score, persona_region, persona_gender, persona_age_range, persona_occupation, persona_interests)'
    )
    .eq('task_id', params.id)
    .order('submitted_at', { ascending: true })

  // 🔍 DEBUG SSR: 打印前3条 + 第一条profiles为null的prediction
  ;(predictions || []).slice(0, 3).forEach((p: any, i: number) => {
    console.log(`[page SSR] pred[${i}] user_id=${p.user_id} profiles=`, JSON.stringify(p.profiles)?.slice(0, 200))
  })
  const nullProfilePreds = (predictions || []).filter((p: any) => {
    const prof = p.profiles
    return !prof || (Array.isArray(prof) && prof.length === 0) || (Array.isArray(prof) ? !prof[0]?.username : !prof.username)
  })
  const pArray = (predictions || []).filter((p: any) => Array.isArray(p.profiles))
  console.log(`[page SSR] total: ${predictions?.length ?? 0} | null/empty/no-username count: ${nullProfilePreds.length} | array-profiles count: ${pArray.length}`)
  if (nullProfilePreds.length > 0) {
    const bad = nullProfilePreds[0] as any
    console.log(`[page SSR] first bad pred user_id=${bad.user_id} profiles=`, JSON.stringify(bad.profiles)?.slice(0, 150))
  }

  const predictionCount = predictions?.length || 0

  // 获取最新因果分析（含图谱、结论、报纸）
  const { data: analysis } = await supabase
    .from('causal_analyses')
    .select(
      'id, status, signal_count, hard_fact_count, persona_count, ' +
      'graph_data, conclusion, newspaper_content, preprocess_summary, ' +
      'is_final, version, created_at'
    )
    .eq('task_id', params.id)
    .eq('is_latest', true)
    .maybeSingle()

  // 充实图谱数据：将后端 factor-only 图谱 + predictions 合并为 4 层结构
  // （agent → signal → factor → target）
  const rawAnalysis = analysis && typeof analysis === 'object' && 'graph_data' in analysis
    ? (analysis as Record<string, any>)
    : null

  const enrichedAnalysis = rawAnalysis
    ? {
        ...rawAnalysis,
        graph_data: enrichGraphData(rawAnalysis.graph_data, predictions as any),
      }
    : null

  return (
    <SearchDetailView
      market={market}
      analysis={enrichedAnalysis as any}
      predictionCount={predictionCount}
    />
  )
}
