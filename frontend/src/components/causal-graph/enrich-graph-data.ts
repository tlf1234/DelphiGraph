// ══════════════════════════════════════════════════════════════
// 模块：enrich-graph-data.ts（图谱数据增强器）
// ══════════════════════════════════════════════════════════════
// 功能：将后端因果引擎生成的图谱数据增强为完整的 5 层结构
// 用途：
//   1. 后端因果引擎生成 Cluster → Factor → Target 的因果关系
//   2. 本模块将 Agent 和 Signal 节点添加到图谱中
//   3. 生成完整的 5 层结构：Agent → Signal → Cluster → Factor → Target
// 调用时机：
//   - 轮询检测到新的分析结果时（startPolling）
//   - 需要展示完整图谱时
// 核心逻辑：
//   1. 检测图谱是否已包含 Agent 节点（已增强）
//   2. 如果未增强，从 signal_submissions 数据生成 Agent 和 Signal 节点
//   3. 保留后端返回的 Cluster 节点（不覆盖）
//   4. 使用关键词匹配将 Signal 连接到合适的 Factor
//   5. 返回增强后的图谱数据
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════════════════════════

// v3.0 信号提交中的单条信号
export interface RawSignal {
  signal_id: string
  evidence_type: 'hard_fact' | 'persona_inference'
  source_type?: string
  data_exclusivity?: 'private' | 'semi_private' | 'public'
  evidence_text: string
  relevance_reasoning?: string
  relevance_score?: number
  source_urls?: string[]
  entity_tags?: Array<{ text: string; type: string; role?: string }>
}

// 原始信号提交数据结构（来自 Supabase signal_submissions 表，v3.0）
export interface RawSignalSubmission {
  id: string
  user_id: string
  status: 'submitted' | 'abstained'
  signals: RawSignal[]
  user_persona?: Record<string, unknown> | null
  submitted_at?: string
  profiles?: {
    id: string
    username: string
    avatar_url?: string | null
    reputation_score?: number
    persona_region?: string | null
    persona_gender?: string | null
    persona_age_range?: string | null
    persona_occupation?: string | null
    persona_interests?: string[] | null
  } | null
}


// 增强后的节点结构
export interface EnrichedNode {
  id: string
  name: string
  node_type: 'agent' | 'signal' | 'cluster' | 'factor' | 'target'  // 节点类型（5 层结构）
  [key: string]: any  // 其他动态字段（如 persona, evidence_type, sentiment 等）
}

// 增强后的边结构
export interface EnrichedEdge {
  id: string
  source: string                // 源节点 ID
  target: string                // 目标节点 ID
  edge_type: 'agent_signal' | 'signal_cluster' | 'cluster_factor' | 'signal_factor' | 'factor_factor' | 'factor_target'  // 边类型（5 层结构）
  [key: string]: any  // 其他动态字段（如 weight, direction 等）
}

// 增强后的图谱数据结构
export interface EnrichedGraphData {
  nodes: EnrichedNode[]         // 节点列表
  edges: EnrichedEdge[]         // 边列表
  [key: string]: any            // 其他元数据（如 graph_id, is_preliminary 等）
}

// ══════════════════════════════════════════════════════════════
// 主入口函数：enrichGraphData
// ══════════════════════════════════════════════════════════════

/**
 * 核心函数：enrichGraphData（增强图谱数据）
 * 
 * 功能：将后端生成的图谱数据（Factor + Target）增强为完整的 4 层结构
 * 
 * 参数：
 *   @param graphData - 后端 causal_analyses.graph_data（仅包含 Factor 和 Target 节点）
 *   @param submissions - Supabase signal_submissions 表数据（含 profiles JOIN，v3.0）
 * 
 * 返回：
 *   @returns 增强后的 EnrichedGraphData，包含 Agent → Signal → Factor → Target 四层结构
 *            如果输入无效，返回 null
 * 
 * 处理流程：
 *   1. 检查输入有效性
 *   2. 检测图谱是否已包含 Agent 节点（已增强）
 *   3. 如果已增强，补全缺失的 signal_factor 边后返回
 *   4. 如果未增强，从 submissions 生成 Agent 和 Signal 节点
 *   5. 使用关键词匹配将 Signal 连接到 Factor
 *   6. 返回完整的 4 层图谱
 */
export function enrichGraphData(
  graphData: any,
  submissions: RawSignalSubmission[] | null | undefined,
): EnrichedGraphData | null {
  // ══════════════════════════════════════════════════════════════
  // Step 1: 输入验证
  // ══════════════════════════════════════════════════════════════
  if (!graphData?.nodes?.length) return null

  // ══════════════════════════════════════════════════════════════
  // Step 2: 检测图谱是否已包含 Agent 节点
  // ══════════════════════════════════════════════════════════════
  // 说明：如果已有 Agent 节点（来自 Python 引擎，无 profile 数据）
  // 处理：用 submissions 的 profile 数据就地更新 agent 节点的 name/persona 字段，
  //       保留所有边结构（signal_cluster 等）不变
  const hasAgents = graphData.nodes.some((n: any) => n.node_type === 'agent')
  if (hasAgents) {
    const normalized = normalizeTypes(graphData)
    if (!submissions?.length) return normalized

    // 构建 userId → profile 映射（用和 enrichGraphData 相同的 agentId 公式）
    const agentIdToProfile = new Map<string, NonNullable<RawSignalSubmission['profiles']>>()
    for (const sub of submissions) {
      const profileRaw = sub.profiles
      const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
      if (!profile) continue
      const agentId = `agent_${sub.user_id.replace(/-/g, '').slice(0, 12)}`
      if (!agentIdToProfile.has(agentId)) agentIdToProfile.set(agentId, profile)
    }

    // 就地更新 agent 节点的 profile 字段，保留其余节点和所有边不变
    const updatedNodes = normalized.nodes.map((n: any) => {
      if (n.node_type !== 'agent') return n
      const profile = agentIdToProfile.get(n.id)
      if (!profile) return n
      return {
        ...n,
        name: profile.username || n.name,
        avatar_label: profile.username ? profile.username.slice(0, 2).toUpperCase() : n.avatar_label,
        persona_region: profile.persona_region ?? n.persona_region ?? null,
        persona_gender: profile.persona_gender ?? n.persona_gender ?? null,
        persona_age_range: profile.persona_age_range ?? n.persona_age_range ?? null,
        persona_occupation: profile.persona_occupation ?? n.persona_occupation ?? null,
        persona_interests: profile.persona_interests ?? n.persona_interests ?? null,
        persona: { ...(n.persona || {}), reputation: profile.reputation_score ?? n.persona?.reputation ?? 100 },
      }
    })
    return { ...normalized, nodes: updatedNodes }
  }

  // ══════════════════════════════════════════════════════════════
  // Step 4: 处理后端原始格式（仅 Factor + Target）
  // ══════════════════════════════════════════════════════════════
  // 说明：后端因果引擎只生成 Factor 和 Target 节点
  // 目标：添加 Agent 和 Signal 节点，构建完整的 4 层结构
  const enrichedNodes: EnrichedNode[] = []
  const enrichedEdges: EnrichedEdge[] = []

  // ══════════════════════════════════════════════════════════════
  // Step 5: 标记现有节点类型（保留后端返回的 cluster 节点）
  // ══════════════════════════════════════════════════════════════
  const targetNodeId = findTargetNodeId(graphData.nodes)
  
  // 调试：检查后端返回的节点类型
  const clusterNodesFromBackend = graphData.nodes.filter((n: any) => n.node_type === 'cluster')
  if (clusterNodesFromBackend.length > 0) {
    console.log(`[enrichGraphData] 🎯 后端返回了 ${clusterNodesFromBackend.length} 个cluster节点`)
  }
  
  const existingNodes: EnrichedNode[] = graphData.nodes.map((n: any) => ({
    ...n,
    // 保留后端已设置的 node_type（如 cluster），仅为未设置的节点标记类型
    node_type: n.node_type || (n.is_target ? 'target' : 'factor'),
  }))
  
  // 调试：验证cluster节点是否被保留
  const clusterNodesAfterMap = existingNodes.filter((n: any) => n.node_type === 'cluster')
  console.log(`[enrichGraphData] ✅ 保留了 ${clusterNodesAfterMap.length} 个cluster节点`)
  
  enrichedNodes.push(...existingNodes)

  // 构建已有节点 ID 集合，防止 Step 9 创建重复节点
  // 根因：当后端数据已包含 signal/agent 节点但 hasAgents=false 时，
  // Path B 会在已有节点上叠加前端节点，产生相同 ID 的重复节点，
  // D3 只给其中一个连线，另一个成为孤立节点。
  const existingNodeIds = new Set(existingNodes.map((n: any) => n.id))
  const existingEdgeIds = new Set(graphData.edges.map((e: any) => e.id).filter(Boolean))

  // ══════════════════════════════════════════════════════════════
  // Step 6: 标记现有边类型
  // ══════════════════════════════════════════════════════════════
  // 说明：根据目标节点判断边类型（factor_target 或 factor_factor）
  for (const e of graphData.edges) {
    const tgtId = typeof e.target === 'string' ? e.target : e.target?.id
    const edgeType = tgtId === targetNodeId ? 'factor_target' : 'factor_factor'
    enrichedEdges.push({
      ...e,
      edge_type: e.edge_type || edgeType,
    })
  }

  // ══════════════════════════════════════════════════════════════
  // Step 7: 检查是否有信号提交数据
  // ══════════════════════════════════════════════════════════════
  // 说明：如果没有信号提交数据，只返回类型标注后的原始图谱
  if (!submissions?.length) {
    return { ...graphData, nodes: enrichedNodes, edges: enrichedEdges }
  }

  // ══════════════════════════════════════════════════════════════
  // Step 8: 构建 Factor 分配表
  // ══════════════════════════════════════════════════════════════
  // 说明：按 total_evidence_count 权重分配 Signal 到 Factor
  // 用途：确保每个 Factor 获得合理数量的 Signal 连接
  const factors = existingNodes.filter((n: any) => n.node_type === 'factor')
  const factorSlots = buildFactorSlots(factors)

  // ══════════════════════════════════════════════════════════════
  // Step 9: 生成 Agent 和 Signal 节点（v3.0: 每个提交包含多条信号）
  // ══════════════════════════════════════════════════════════════
  const seenAgents = new Map<string, string>() // user_id → agent_node_id（去重）
  let sigIdx = 0

  for (const sub of submissions) {
    // 跳过弃权提交
    if (sub.status === 'abstained') continue
    const signals = sub.signals || []
    if (signals.length === 0) continue

    const userId = sub.user_id
    const profileRaw = sub.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw

    // ══════════════════════════════════════════════════════════════
    // 9.1: 创建 Agent 节点（每个用户只创建一次，跳过后端已有的）
    // ══════════════════════════════════════════════════════════════
    let agentId = seenAgents.get(userId)
    if (!agentId) {
      agentId = `agent_${userId.replace(/-/g, '').slice(0, 12)}`
      seenAgents.set(userId, agentId)

      // 跳过后端已创建的 Agent 节点，防止重复 ID 导致孤立节点
      if (!existingNodeIds.has(agentId)) {
        // 用第一条信号的类型推断分析风格
        const firstSig = signals[0]
        const summaryText = firstSig?.evidence_text || ''
        const evidenceType = firstSig?.evidence_type || 'persona_inference'

        enrichedNodes.push({
          id: agentId,
          name: profile?.username || `Agent-${userId.slice(0, 6)}`,
          node_type: 'agent',
          avatar_label: (profile?.username || userId.slice(0, 2)).slice(0, 2).toUpperCase(),
          persona_region: profile?.persona_region ?? null,
          persona_gender: profile?.persona_gender ?? null,
          persona_age_range: profile?.persona_age_range ?? null,
          persona_occupation: profile?.persona_occupation ?? null,
          persona_interests: profile?.persona_interests ?? null,
          persona_summary: buildPersonaSummaryV3(evidenceType, summaryText),
          persona: {
            stance: 'neutral',
            expertise: 'general',
            reputation: profile?.reputation_score || 100,
          },
        })
        existingNodeIds.add(agentId)
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 9.2: 为每条信号创建 Signal 节点 + 边（跳过后端已有的）
    // ══════════════════════════════════════════════════════════════
    for (const sig of signals) {
      const signalId = sig.signal_id || `sig_${sub.id.replace(/-/g, '').slice(0, 8)}_${sigIdx}`
      const evidenceType = sig.evidence_type || 'persona_inference'
      const evidenceText = sig.evidence_text || ''

      // 跳过后端已创建的 Signal 节点，防止重复 ID 导致孤立节点
      if (!existingNodeIds.has(signalId)) {
        enrichedNodes.push({
          id: signalId,
          name: evidenceText.length > 40 ? evidenceText.slice(0, 40) + '…' : evidenceText,
          node_type: 'signal',
          evidence_type: evidenceType,
          source_description: evidenceText,
          relevance_score: sig.relevance_score ?? 0.5,
          relevance_reasoning: sig.relevance_reasoning || '',
          data_exclusivity: sig.data_exclusivity || 'public',
          source_type: sig.source_type || '',
          is_minority: false,
        })
        existingNodeIds.add(signalId)
      }

      // Agent → Signal 边（避免重复边）
      const asEdgeId = `e_as_${sigIdx}`
      if (!existingEdgeIds.has(asEdgeId)) {
        enrichedEdges.push({
          id: asEdgeId,
          source: agentId!,
          target: signalId,
          edge_type: 'agent_signal',
          weight: evidenceType === 'hard_fact' ? 1.0 : 0.5,
        })
      }

      // Signal → Factor 边（关键词匹配）
      const matchedFactorId = matchSignalToFactor(sig, factors, factorSlots, sigIdx)
      if (matchedFactorId) {
        const sfEdgeId = `e_sf_${sigIdx}`
        if (!existingEdgeIds.has(sfEdgeId)) {
          enrichedEdges.push({
            id: sfEdgeId,
            source: signalId,
            target: matchedFactorId,
            edge_type: 'signal_factor',
            weight: sig.relevance_score ?? 0.5,
          })
        }
      }

      sigIdx++
    }
  }

  return { ...graphData, nodes: enrichedNodes, edges: enrichedEdges }
}

// ══════════════════════════════════════════════════════════════
// 辅助函数
// ══════════════════════════════════════════════════════════════

/**
 * 辅助函数：findTargetNodeId
 * 功能：查找图谱中的 Target 节点 ID
 * 用途：用于判断边的类型（factor_target 或 factor_factor）
 */
function findTargetNodeId(nodes: any[]): string | null {
  const t = nodes.find((n: any) => n.is_target || n.node_type === 'target')
  return t?.id || t?.node_id || null
}

/**
 * 辅助函数：normalizeTypes
 * 功能：归一化图谱数据的类型标注
 * 用途：确保所有节点和边都有正确的 node_type 和 edge_type
 * 场景：处理已增强的图谱（如预览图谱）
 */
function normalizeTypes(graphData: any): EnrichedGraphData {
  const targetId = findTargetNodeId(graphData.nodes)
  const nodes = graphData.nodes.map((n: any) => ({
    ...n,
    node_type: n.node_type || (n.is_target ? 'target' : 'factor'),
  }))
  const edges = graphData.edges.map((e: any) => {
    if (e.edge_type) return e
    const tgtId = typeof e.target === 'string' ? e.target : e.target?.id
    return { ...e, edge_type: tgtId === targetId ? 'factor_target' : 'factor_factor' }
  })
  const result: any = { ...graphData, nodes, edges }
  delete result.cluster_nodes
  delete result.cluster_edges
  return result as EnrichedGraphData
}

/**
 * 辅助函数：buildFactorSlots
 * 功能：构建 Factor 容量槽
 * 用途：按 total_evidence_count 权重分配 Signal 到 Factor
 * 策略：每个 Factor 的容量与其 evidence_count 成正比
 * 返回：Map<factor_id, capacity>
 */
function buildFactorSlots(factors: EnrichedNode[]): Map<string, number> {
  const slots = new Map<string, number>()
  const totalEvidence = factors.reduce((s, f) => s + (f.total_evidence_count || 1), 0)
  factors.forEach(f => {
    // 每个 Factor 按其 evidence_count 占比获得容量
    // 如果没有 evidence_count，平均分配
    slots.set(f.id, f.total_evidence_count || Math.max(1, Math.round(totalEvidence / factors.length)))
  })
  return slots
}

/**
 * 核心辅助函数：matchSignalToFactor
 * 功能：将 Signal 匹配到最合适的 Factor
 * 策略：
 *   1. 关键词匹配（优先级高）
 *      - Factor 名称在 rationale 中出现：+10 分
 *      - rationale 关键词在 Factor 名称中：+3 分/词
 *      - rationale 关键词在 Factor 描述中：+1 分/词
 *      - Entity tag 匹配：+8 分/tag
 *   2. 容量权重轮转（回退策略）
 *      - 如果匹配分数 < 3，按容量权重轮转分配
 * 参数：
 *   @param pred - 预测数据
 *   @param factors - Factor 节点列表
 *   @param slots - Factor 容量槽
 *   @param idx - 当前索引（用于轮转）
 * 返回：匹配的 Factor ID，或 null
 */
function matchSignalToFactor(
  sig: RawSignal | RawSignalSubmission | any,
  factors: EnrichedNode[],
  slots: Map<string, number>,
  idx: number,
): string | null {
  if (factors.length === 0) return null

  // v3.0: 使用 evidence_text + relevance_reasoning
  const rationale = (sig.evidence_text || '').toLowerCase()
  const entityTexts = (sig.entity_tags || []).map((t: any) => t.text.toLowerCase())

  // ══════════════════════════════════════════════════════════════
  // 策略 1: 关键词匹配
  // ══════════════════════════════════════════════════════════════
  let bestId: string | null = null
  let bestScore = 0
  for (const f of factors) {
    let score = 0
    const fname = (f.name || '').toLowerCase()
    const fdesc = (f.description || '').toLowerCase()

    // 规则 1: Factor 名称在 rationale 中完整出现（强匹配）
    if (fname.length > 2 && rationale.includes(fname)) score += 10
    
    // 规则 2: rationale 关键词在 Factor 名称/描述中
    const words = rationale.split(/\s+/).filter((w: string) => w.length > 2)
    for (const w of words.slice(0, 15)) {
      if (fname.includes(w)) score += 3  // 名称匹配权重高
      if (fdesc.includes(w)) score += 1  // 描述匹配权重低
    }
    
    // 规则 3: Entity tag 匹配（强匹配）
    for (const et of entityTexts) {
      if (fname.includes(et) || fdesc.includes(et)) score += 8
    }

    if (score > bestScore) {
      bestScore = score
      bestId = f.id
    }
  }

  // 如果找到了足够好的匹配（分数 >= 3），返回
  if (bestId && bestScore >= 3) return bestId

  // ══════════════════════════════════════════════════════════════
  // 策略 2: 容量权重轮转分配（回退策略）
  // ══════════════════════════════════════════════════════════════
  // 说明：如果关键词匹配失败，按容量从大到小轮转分配
  const sortedFactors = [...factors].sort(
    (a, b) => (slots.get(b.id) || 0) - (slots.get(a.id) || 0)
  )
  const target = sortedFactors[idx % sortedFactors.length]
  return target?.id || null
}

/**
 * 辅助函数：buildPersonaSummary
 * 功能：根据预测数据推导匹名用户画像描述（不展示真实身份）
 */
/**
 * v3.0 版本的画像摘要：基于数据因子类型和证据内容
 */
function buildPersonaSummaryV3(evidenceType?: string, evidenceText?: string): string {
  const text = (evidenceText || '').toLowerCase()
  const style = evidenceType === 'hard_fact' ? '数据驱动型' : '经验直觉型'

  const domainMap: [string[], string][] = [
    [['ai', '人工智能', '技术', '科技', '软件', '算法'], '科技创新'],
    [['政策', '监管', '法规', '政府', '立法'], '政策监管'],
    [['宏观', '经济', '通货膨胀', 'gdp', '利率', '货币'], '宏观经济'],
    [['情绪', '投资者', '散户', '市场心理', '悲观', '乐观'], '市场情绪'],
    [['供需', '产能', '库存', '需求', '供给'], '供需基本面'],
    [['地缘', '战争', '国际', '贸易', '地缘政治'], '地缘政治'],
    [['竞争', '对手', '市场份额', '行业'], '竞争格局'],
  ]
  const domains: string[] = []
  for (const [keywords, label] of domainMap) {
    if (keywords.some(k => text.includes(k))) domains.push(label)
    if (domains.length >= 2) break
  }

  const domainStr = domains.length > 0 ? `，关注${domains.join('与')}` : ''
  return `${style}${domainStr}。`
}
