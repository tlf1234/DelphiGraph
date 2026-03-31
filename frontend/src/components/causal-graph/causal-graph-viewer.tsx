'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as d3 from 'd3'

// ── 类型定义 ──────────────────────────────────────────────────────────
// 5 层架构: Agent(hexagon) → Signal(dot) → Cluster(rounded-rect) → Factor(circle) → Target(diamond)

type NodeType = 'agent' | 'signal' | 'cluster' | 'factor' | 'target'
type EdgeType = 'agent_signal' | 'signal_cluster' | 'cluster_factor' | 'factor_factor' | 'factor_target'

interface GNode {
  id: string; name: string; node_type?: NodeType
  persona?: { stance?: string; expertise?: string; risk_appetite?: string; time_horizon?: string; reputation?: number }
  avatar_label?: string; persona_summary?: string
  persona_region?: string | null; persona_gender?: string | null
  persona_age_range?: string | null; persona_occupation?: string | null
  persona_interests?: string[] | null
  evidence_type?: string; source_description?: string; relevance_score?: number
  category?: string; factor_type?: string; impact_score?: number; confidence?: number
  evidence_direction?: string; is_minority_driven?: boolean; is_minority?: boolean
  is_target?: boolean; hard_fact_count?: number; persona_count?: number
  total_evidence_count?: number; evidence_count?: number; description?: string
  // Cluster 节点属性
  sentiment?: string; anchor_entities?: string[]; signal_count?: number
  avg_quality_score?: number; persona_distribution?: any
  source_cluster_ids?: string[]
}

interface GEdge {
  id?: string; source: string; target: string; edge_type?: EdgeType
  relation_type?: string; relation?: string; weight?: number; direction?: string
  strength?: string; evidence_count?: number; reasoning?: string
  source_name?: string; target_name?: string; hard_fact_ratio?: number
}

interface GraphData { nodes: GNode[]; edges: GEdge[] }

interface CausalGraphViewerProps {
  graphData: GraphData | null
  className?: string
  isUpdating?: boolean
}

interface SelectedItem { type: 'node' | 'edge'; data: any; color?: string }

// ── 颜色常量 ─────────────────────────────────────────────────────────

const FACTOR_COLORS: Record<string, string> = {
  economic: '#00d4ff', political: '#ff6b6b', technological: '#00ff88',
  social: '#ffd93d', environmental: '#a29bfe', cultural: '#fd79a8',
  military: '#74b9ff', legal: '#e17055',
}
const STANCE_COLORS: Record<string, string> = { dovish: '#60a5fa', hawkish: '#f87171', neutral: '#a1a1aa' }
const EVIDENCE_COLORS: Record<string, string> = { hard_fact: '#22d3ee', persona_inference: '#c084fc' }
const SENTIMENT_COLORS: Record<string, string> = { 
  positive: '#10b981', // 绿色
  negative: '#ef4444', // 红色
  neutral: '#6b7280'   // 灰色
}
const CLUSTER_COLOR = '#8b5cf6'  // 紫色（默认聚类颜色）
const TARGET_COLOR = '#fbbf24'

const getFactorColor = (t: string) => FACTOR_COLORS[t] || '#b2bec3'
const getStanceColor = (s?: string) => STANCE_COLORS[s || ''] || '#a1a1aa'
const getEvidenceColor = (t?: string) => EVIDENCE_COLORS[t || ''] || '#888'
const getSentimentColor = (s?: string) => SENTIMENT_COLORS[s || 'neutral'] || '#6b7280'

// ── 形状路径 ─────────────────────────────────────────────────────────

function hexagonPath(x: number, y: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${i === 0 ? 'M' : 'L'}${x + r * Math.cos(a)},${y + r * Math.sin(a)}`
  }).join(' ') + ' Z'
}

function diamondPath(x: number, y: number, s: number): string {
  return `M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y} Z`
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x - w/2 + r},${y - h/2}
    L${x + w/2 - r},${y - h/2}
    Q${x + w/2},${y - h/2} ${x + w/2},${y - h/2 + r}
    L${x + w/2},${y + h/2 - r}
    Q${x + w/2},${y + h/2} ${x + w/2 - r},${y + h/2}
    L${x - w/2 + r},${y + h/2}
    Q${x - w/2},${y + h/2} ${x - w/2},${y + h/2 - r}
    L${x - w/2},${y - h/2 + r}
    Q${x - w/2},${y - h/2} ${x - w/2 + r},${y - h/2} Z`
}

// 5层椭圆布局参数
const AGENT_RING_RX = 0.40   // Layer 1: Agent 外环 X 半径（占容器宽度）
const AGENT_RING_RY = 0.38   // Layer 1: Agent 外环 Y 半径（占容器高度）
const SIGNAL_ORBIT = 38      // Layer 2: Signal 围绕 Agent 的轨道半径
const CLUSTER_RING_R = 0.28  // Layer 3: Cluster 中环半径（占 min(W,H)）
const FACTOR_RING_R = 0.17   // Layer 4: Factor 内环半径（占 min(W,H)）
// Layer 5: Target 中心点

// ── 主组件 ───────────────────────────────────────────────────────────

export default function CausalGraphViewer({
  graphData,
  className = '',
  isUpdating = false,
}: CausalGraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null)
  const selectedItemRef = useRef<SelectedItem | null>(null)
  const nodePositionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [hasRendered, setHasRendered] = useState(false)

  useEffect(() => { selectedItemRef.current = selectedItem }, [selectedItem])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        setContainerSize(prev =>
          prev.w === Math.round(width) && prev.h === Math.round(height)
            ? prev : { w: Math.round(width), h: Math.round(height) }
        )
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── D3 渲染 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !graphData?.nodes?.length) return
    if (simulationRef.current) simulationRef.current.stop()

    const container = containerRef.current
    const W = container.clientWidth
    const H = container.clientHeight
    if (W < 10 || H < 10) return

    const svg = d3.select(svgRef.current).attr('width', W).attr('height', H)
    svg.selectAll('*').remove()
    if (!hasRendered) setHasRendered(true)

    // ── 数据准备 ──
    const allNodes = graphData.nodes.map((n: any) => ({
      ...n,
      node_type: n.node_type || (n.is_target ? 'target' : 'factor') as NodeType,
    }))
    const nodeIds = new Set(allNodes.map((n: any) => n.id))
    const allEdges = graphData.edges
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: any) => ({ ...e, edge_type: e.edge_type || 'factor_factor' as EdgeType }))

    // 节点尺寸
    const maxImpact = Math.max(...allNodes.filter((n: any) => n.node_type === 'factor').map((n: any) => n.impact_score || 0), 0.01)
    const nodeSize = (n: any): number => {
      switch (n.node_type) {
        case 'agent': return 11
        case 'signal': return 2.5 + (n.relevance_score || 0.5) * 2
        case 'cluster': return 12 + Math.min((n.signal_count || 10) / 5, 8)  // 12-20px
        case 'target': return 16
        default: return 6 + ((n.impact_score || 0) / maxImpact) * 10
      }
    }
    const nodesData = allNodes.map((n: any) => {
      const cached = nodePositionCacheRef.current.get(n.id)
      return { ...n, _size: nodeSize(n), ...(cached ? { x: cached.x, y: cached.y } : {}) }
    })

    // ── 预计算椭圆布局坐标 ──
    const cx = W / 2, cy = H / 2
    const agRx = W * AGENT_RING_RX, agRy = H * AGENT_RING_RY
    const clusterR = Math.min(W, H) * CLUSTER_RING_R
    const factorR = Math.min(W, H) * FACTOR_RING_R

    // 按类型分组（5层）
    const agentBucket = nodesData.filter((n: any) => n.node_type === 'agent')
    const signalBucket = nodesData.filter((n: any) => n.node_type === 'signal')
    const clusterBucket = nodesData.filter((n: any) => n.node_type === 'cluster')
    const factorBucket = nodesData.filter((n: any) => n.node_type === 'factor')
    const targetBucket = nodesData.filter((n: any) => n.node_type === 'target')

    // Agent 位置：均匀分布在外椭圆上
    agentBucket.forEach((a: any, i: number) => {
      const angle = (2 * Math.PI * i) / agentBucket.length - Math.PI / 2
      a._targetX = cx + agRx * Math.cos(angle)
      a._targetY = cy + agRy * Math.sin(angle)
    })

    // 建立 agent 位置查找表
    const agentPosMap = new Map<string, { x: number; y: number }>()
    agentBucket.forEach((a: any) => agentPosMap.set(a.id, { x: a._targetX, y: a._targetY }))

    // Signal→Agent 映射（通过 agent_signal 边）
    const signalToAgentId = new Map<string, string>()
    allEdges.filter((e: any) => e.edge_type === 'agent_signal')
      .forEach((e: any) => signalToAgentId.set(e.target, e.source))

    // Signal 位置：围绕其父 Agent 旋转分布
    const agentSignalGroups = new Map<string, any[]>()
    signalBucket.forEach((s: any) => {
      const parentId = signalToAgentId.get(s.id) || ''
      if (!agentSignalGroups.has(parentId)) agentSignalGroups.set(parentId, [])
      agentSignalGroups.get(parentId)!.push(s)
    })
    agentSignalGroups.forEach((siblings, parentId) => {
      const parentPos = agentPosMap.get(parentId) || { x: cx, y: cy }
      siblings.forEach((s: any, i: number) => {
        const angle = (2 * Math.PI * i) / siblings.length + Math.random() * 0.3
        const r = SIGNAL_ORBIT + Math.random() * 12
        s._targetX = parentPos.x + r * Math.cos(angle)
        s._targetY = parentPos.y + r * Math.sin(angle)
      })
    })

    // Cluster 位置：均匀分布在中环上
    clusterBucket.forEach((c: any, i: number) => {
      const angle = (2 * Math.PI * i) / clusterBucket.length - Math.PI / 2
      c._targetX = cx + clusterR * Math.cos(angle)
      c._targetY = cy + clusterR * Math.sin(angle)
    })

    // Factor 位置：均匀分布在内环上
    factorBucket.forEach((f: any, i: number) => {
      const angle = (2 * Math.PI * i) / factorBucket.length - Math.PI / 2
      f._targetX = cx + factorR * Math.cos(angle)
      f._targetY = cy + factorR * Math.sin(angle)
    })

    // Target 位置：正中心
    targetBucket.forEach((t: any) => { t._targetX = cx; t._targetY = cy })

    // 曲线偏移（仅因果层级）
    const pairCount: Record<string, number> = {}
    const pairIndex: Record<string, number> = {}
    allEdges.filter((e: any) => e.edge_type === 'factor_factor' || e.edge_type === 'factor_target')
      .forEach((e: any) => { const k = [e.source, e.target].sort().join('|'); pairCount[k] = (pairCount[k] || 0) + 1 })
    allEdges.forEach((e: any) => {
      if (e.edge_type === 'factor_factor' || e.edge_type === 'factor_target') {
        const k = [e.source, e.target].sort().join('|')
        const idx = pairIndex[k] || 0; pairIndex[k] = idx + 1
        e._pairTotal = pairCount[k]; e._pairIndex = idx
        e._curvature = pairCount[k] > 1
          ? ((idx / (pairCount[k] - 1)) - 0.5) * Math.min(1.2, 0.5 + pairCount[k] * 0.15) * 2 : 0
      } else { e._curvature = 0; e._pairTotal = 1; e._pairIndex = 0 }
    })

    // ── 力仿真（预计算） ──
    const simulation = d3.forceSimulation(nodesData as any)
      .force('link', d3.forceLink(allEdges as any).id((d: any) => d.id)
        .distance((d: any) => {
          switch (d.edge_type) {
            case 'agent_signal': return 50
            case 'signal_cluster': return 90
            case 'cluster_factor': return 70
            case 'signal_factor': return 130
            default: return 80 + ((d._pairTotal || 1) - 1) * 15
          }
        })
        .strength((d: any) => {
          if (d.edge_type === 'agent_signal') return 0.8
          if (d.edge_type === 'signal_cluster') return 0.08
          if (d.edge_type === 'cluster_factor') return 0.15
          if (d.edge_type === 'signal_factor') return 0.12
          return 0.2
        })
      )
      .force('charge', d3.forceManyBody().strength((d: any) => {
        switch (d.node_type) {
          case 'agent': return -250; case 'signal': return -25; case 'target': return -400; default: return -180
        }
      }))
      .force('collide', d3.forceCollide((d: any) => d._size + 5))
      .force('posX', d3.forceX((d: any) => d._targetX ?? cx).strength((d: any) => {
        switch (d.node_type) { case 'agent': return 0.45; case 'signal': return 0.35; case 'target': return 0.8; default: return 0.3 }
      }))
      .force('posY', d3.forceY((d: any) => d._targetY ?? cy).strength((d: any) => {
        switch (d.node_type) { case 'agent': return 0.45; case 'signal': return 0.35; case 'target': return 0.8; default: return 0.3 }
      }))
      .stop()

    for (let i = 0; i < 350; i++) simulation.tick()
    nodesData.forEach((d: any) => {
      if (d.x !== undefined) nodePositionCacheRef.current.set(d.id, { x: d.x, y: d.y })
      d.fx = d.x; d.fy = d.y
    })
    simulationRef.current = simulation

    // ── Defs ──
    const defs = svg.append('defs')
    defs.append('pattern').attr('id', 'cg-grid').attr('width', 40).attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('path').attr('d', 'M 40 0 L 0 0 0 40').attr('fill', 'none').attr('stroke', '#1a2332').attr('stroke-width', 0.5)

    ;['positive', 'negative', 'neutral'].forEach(dir => {
      defs.append('marker').attr('id', `arr-${dir}`).attr('viewBox', '0 -4 8 8')
        .attr('refX', 7).attr('refY', 0).attr('markerWidth', 3.5).attr('markerHeight', 3.5).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-3L8,0L0,3')
        .attr('fill', dir === 'positive' ? '#00ff8899' : dir === 'negative' ? '#ff6b6b99' : '#88888899')
    })

    // Agent glow
    const agGlow = defs.append('filter').attr('id', 'agent-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    agGlow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'b')
    agGlow.append('feMerge').selectAll('feMergeNode').data(['b', 'SourceGraphic']).enter().append('feMergeNode').attr('in', (d: string) => d)

    // Target glow
    const tgGlow = defs.append('filter').attr('id', 'target-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    tgGlow.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'b')
    tgGlow.append('feMerge').selectAll('feMergeNode').data(['b', 'SourceGraphic']).enter().append('feMergeNode').attr('in', (d: string) => d)

    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#cg-grid)')
    const g = svg.append('g')

    // 缩放平移
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .extent([[0, 0], [W, H]]).scaleExtent([0.15, 5])
        .on('zoom', (event) => g.attr('transform', event.transform)) as any
    )

    // ── 中心辅助环（极淡的参考椭圆） ──
    g.append('ellipse').attr('cx', cx).attr('cy', cy).attr('rx', factorR).attr('ry', factorR)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.025)').attr('stroke-dasharray', '3,6')
    g.append('ellipse').attr('cx', cx).attr('cy', cy).attr('rx', agRx).attr('ry', agRy)
      .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.015)').attr('stroke-dasharray', '3,8')

    // ── 边路径计算（思维导图风格曲线） ──
    // 所有连线都使用"从源节点水平出发，柔和弯向目标"的三次贝塞尔
    const getLinkPath = (d: any) => {
      const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y
      const dx = tx - sx, dy = ty - sy
      // 控制点1：保持 source 的 Y，水平探出 50%
      const c1x = sx + dx * 0.5, c1y = sy
      // 控制点2：贴近 target 的 Y，从中点往 target 走 30%
      const mx = (sx + tx) / 2
      const c2x = mx + (tx - mx) * 0.3, c2y = ty
      // 多重边偏移
      if (d._curvature && d._curvature !== 0) {
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const nx = -dy / dist, ny = dx / dist
        const extra = d._curvature * Math.max(15, dist * 0.12)
        return `M${sx},${sy} C${c1x + nx * extra},${c1y + ny * extra} ${c2x + nx * extra},${c2y + ny * extra} ${tx},${ty}`
      }
      return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`
    }

    const getLinkMid = (d: any) => {
      const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y
      // 贝塞尔 t=0.5 近似中点
      const c1y = sy, c2y = ty
      const my = 0.125 * sy + 0.375 * c1y + 0.375 * c2y + 0.125 * ty
      return { x: (sx + tx) / 2, y: my }
    }

    // ── 绘制边 ──
    const linkGroup = g.append('g').attr('class', 'links')

    const link = linkGroup.selectAll('path.link')
      .data(allEdges).enter().append('path').attr('class', 'link')
      .attr('stroke', (d: any) => {
        if (d.edge_type === 'agent_signal') {
          const sc = getStanceColor(d.source?.persona?.stance)
          return sc + 'AA'  // agent 立场色 + 67% alpha
        }
        if (d.edge_type === 'signal_cluster') return 'rgba(112, 226, 41, 0.47)'  // 绿色，signal→cluster连线
        if (d.edge_type === 'cluster_factor') return 'rgba(233, 183, 34, 0.8)'  // 橙色，cluster→factor映射
        if (d.edge_type === 'signal_factor') return d.direction === 'negative' ? '#ff6b6b99' : '#ece22d99'
        if (d.edge_type === 'factor_target') return d.direction === 'positive' ? '#f7d30aec' : d.direction === 'negative' ? '#e45151cb' : '#888888e6'
        return d.direction === 'positive' ? '#00ff8866' : d.direction === 'negative' ? '#ff6b6bb9' : '#88888866'
      })
      .attr('stroke-width', (d: any) => {
        if (d.edge_type === 'agent_signal') return 0.8
        if (d.edge_type === 'signal_cluster') return 0.8
        if (d.edge_type === 'cluster_factor') return 1.2
        if (d.edge_type === 'signal_factor') return 1.2
        if (d.edge_type === 'factor_target') return 1.0 + (d.weight || 0.5) * 1.2
        return 0.5 + (d.weight || 0.5) * 1
      })
      .attr('fill', 'none')
      .attr('stroke-dasharray', (d: any) => {
        if (d.edge_type === 'agent_signal') return null  // 实线，思维导图风格
        if (d.direction === 'negative') return '4,3'
        return null
      })
      .attr('marker-end', (d: any) => {
        if (d.edge_type === 'agent_signal' || d.edge_type === 'signal_factor') return null
        return `url(#arr-${d.direction || 'positive'})`
      })
      .attr('opacity', (d: any) => d.edge_type === 'agent_signal' ? 0.55 : d.edge_type === 'signal_cluster' ? 0.7 : d.edge_type === 'cluster_factor' ? 0.7 : d.edge_type === 'signal_factor' ? 0.6 : 0.6)
      .style('cursor', (d: any) => (d.edge_type === 'factor_factor' || d.edge_type === 'factor_target') ? 'pointer' : 'default')
      .on('click', (event: any, d: any) => {
        if (d.edge_type !== 'factor_factor' && d.edge_type !== 'factor_target') return
        event.stopPropagation()
        setSelectedItem({ type: 'edge', data: d })
      })

    // 因果层边标签
    const causalEdgesOnly = allEdges.filter((e: any) => e.edge_type === 'factor_factor' || e.edge_type === 'factor_target')
    const linkLabelBg = linkGroup.selectAll('rect.lbl-bg')
      .data(causalEdgesOnly).enter().append('rect').attr('class', 'lbl-bg')
      .attr('fill', 'rgba(13,17,23,0.85)').attr('rx', 3).attr('ry', 3)
      .style('display', showEdgeLabels ? 'block' : 'none').style('pointer-events', 'none')
    const linkLabels = linkGroup.selectAll('text.lbl')
      .data(causalEdgesOnly).enter().append('text').attr('class', 'lbl')
      .text((d: any) => d.relation_type || d.relation || '关联')
      .attr('font-size', '8px').attr('fill', '#666').attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .style('font-family', 'system-ui').style('pointer-events', 'none')
      .style('display', showEdgeLabels ? 'block' : 'none')

    // ── 绘制节点 ──
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const drag = (sel: any) => sel.call(d3.drag<any, any>()
      .on('start', (_: any, d: any) => { d.fx = d.x; d.fy = d.y })
      .on('drag', (event: any, d: any) => { d.fx = event.x; d.fy = event.y; d.x = event.x; d.y = event.y; updatePositions() })
      .on('end', (_: any, d: any) => { d.fx = d.x; d.fy = d.y })
    )

    // --- Agent 六边形 ---
    const agentNodes = nodesData.filter((n: any) => n.node_type === 'agent')
    const agentG = nodeGroup.selectAll('g.agent')
      .data(agentNodes).enter().append('g').attr('class', 'agent').style('cursor', 'pointer')

    agentG.append('path')
      .attr('d', (d: any) => hexagonPath(0, 0, d._size + 4))
      .attr('fill', 'none').attr('stroke', (d: any) => getStanceColor(d.persona?.stance))
      .attr('stroke-width', 1).attr('opacity', 0.25).attr('filter', 'url(#agent-glow)')
    agentG.append('path')
      .attr('d', (d: any) => hexagonPath(0, 0, d._size))
      .attr('fill', (d: any) => `${getStanceColor(d.persona?.stance)}15`)
      .attr('stroke', (d: any) => getStanceColor(d.persona?.stance)).attr('stroke-width', 1)
    agentG.append('text')
      .text((d: any) => d.avatar_label || 'A')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', (d: any) => getStanceColor(d.persona?.stance))
      .attr('font-size', '7px').attr('font-weight', '700')
      .style('font-family', 'system-ui').style('pointer-events', 'none')
    agentG.append('text')
      .text((d: any) => d.name.length > 10 ? d.name.substring(0, 10) + '…' : d.name)
      .attr('y', (d: any) => d._size + 9).attr('text-anchor', 'middle')
      .attr('fill', '#666').attr('font-size', '6px')
      .style('font-family', 'system-ui').style('pointer-events', 'none')
    agentG.append('text')
      .text((d: any) => d.persona?.stance === 'dovish' ? '🕊' : d.persona?.stance === 'hawkish' ? '🦅' : '◆')
      .attr('x', (d: any) => d._size * 0.7).attr('y', (d: any) => -d._size * 0.7)
      .attr('font-size', '6px').style('pointer-events', 'none')

    agentG.on('click', (event: any, d: any) => {
      event.stopPropagation()
      setSelectedItem({ type: 'node', data: d, color: getStanceColor(d.persona?.stance) })
    })
    drag(agentG)

    // --- Signal 小圆点 ---
    const signalNodes = nodesData.filter((n: any) => n.node_type === 'signal')
    const signalCircle = nodeGroup.selectAll('circle.signal')
      .data(signalNodes).enter().append('circle').attr('class', 'signal')
      .attr('r', (d: any) => d._size)
      .attr('fill', (d: any) => `${getEvidenceColor(d.evidence_type)}44`)
      .attr('stroke', (d: any) => getEvidenceColor(d.evidence_type))
      .attr('stroke-width', 1).style('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        event.stopPropagation()
        setSelectedItem({ type: 'node', data: d, color: getEvidenceColor(d.evidence_type) })
      })
    drag(signalCircle)

    // Signal 标签（hover 显示）
    const signalLabels = nodeGroup.selectAll('text.sig-lbl')
      .data(signalNodes).enter().append('text').attr('class', 'sig-lbl')
      .text((d: any) => d.name.length > 14 ? d.name.substring(0, 14) + '…' : d.name)
      .attr('font-size', '7px').attr('fill', '#777').attr('text-anchor', 'middle')
      .style('font-family', 'system-ui').style('pointer-events', 'none').style('opacity', 0)
    signalCircle
      .on('mouseenter', (_: any, d: any) => { signalLabels.filter((dd: any) => dd.id === d.id).style('opacity', 1) })
      .on('mouseleave', (_: any, d: any) => { signalLabels.filter((dd: any) => dd.id === d.id).style('opacity', 0) })

    // --- Cluster 圆角矩形 ---
    const clusterNodes = nodesData.filter((n: any) => n.node_type === 'cluster')
    const clusterG = nodeGroup.selectAll('g.cluster')
      .data(clusterNodes).enter().append('g').attr('class', 'cluster').style('cursor', 'pointer')
    
    // 少数派光晕
    clusterG.filter((d: any) => d.is_minority)
      .append('path')
      .attr('d', (d: any) => roundedRectPath(0, 0, 66, 34, 8))
      .attr('fill', 'none')
      .attr('stroke', '#fbbf24')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '3,2')
      .attr('opacity', 0.8)
    
    // 背景矩形（半透明填充 + 情感色描边）
    clusterG.append('path')
      .attr('d', (d: any) => roundedRectPath(0, 0, 60, 30, 6))
      .attr('fill', (d: any) => getSentimentColor(d.sentiment) + '22')  // 极淡填充
      .attr('stroke', (d: any) => d.is_minority ? '#fbbf24' : getSentimentColor(d.sentiment))
      .attr('stroke-width', (d: any) => d.is_minority ? 1.5 : 1)
      .attr('opacity', 0.85)
    
    // 主题文本
    clusterG.append('text')
      .text((d: any) => d.name.length > 8 ? d.name.substring(0, 8) + '…' : d.name)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('y', -4)
      .attr('fill', (d: any) => getSentimentColor(d.sentiment))
      .attr('font-size', '9px')
      .attr('font-weight', '500')
      .style('font-family', 'system-ui')
      .style('pointer-events', 'none')
    
    // 信号数量标签
    clusterG.append('text')
      .text((d: any) => `${d.signal_count || 0}条`)
      .attr('text-anchor', 'middle')
      .attr('y', 8)
      .attr('fill', '#888')
      .attr('font-size', '7px')
      .attr('opacity', 0.7)
      .style('font-family', 'system-ui')
      .style('pointer-events', 'none')
    
    clusterG.on('click', (event: any, d: any) => {
      event.stopPropagation()
      setSelectedItem({ type: 'node', data: d, color: getSentimentColor(d.sentiment) })
    })
    drag(clusterG)

    // --- Factor 圆形 ---
    const factorNodes = nodesData.filter((n: any) => n.node_type === 'factor')
    // Factor 虚线矩形框（聚类代表框）
    const factorBox = nodeGroup.selectAll('rect.factor-box')
      .data(factorNodes).enter().append('rect').attr('class', 'factor-box')
      .attr('rx', 5).attr('ry', 5)
      .attr('fill', (d: any) => `${getFactorColor(d.factor_type || d.category || 'default')}18`)
      .attr('stroke', (d: any) => getFactorColor(d.factor_type || d.category || 'default'))
      .attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3').attr('opacity', 0.85)
      .style('pointer-events', 'none')
    // 少数派光晕
    nodeGroup.selectAll('circle.min-halo')
      .data(factorNodes.filter((n: any) => n.is_minority_driven || n.is_minority))
      .enter().append('circle').attr('class', 'min-halo')
      .attr('r', (d: any) => d._size + 4).attr('fill', 'none')
      .attr('stroke', '#ffd93d').attr('stroke-width', 1).attr('stroke-dasharray', '3,2').attr('opacity', 0.6)
    const factorCircle = nodeGroup.selectAll('circle.factor')
      .data(factorNodes).enter().append('circle').attr('class', 'factor')
      .attr('r', (d: any) => d._size)
      .attr('fill', (d: any) => `${getFactorColor(d.factor_type || d.category || 'default')}99`)
      .attr('stroke', (d: any) => getFactorColor(d.factor_type || d.category || 'default'))
      .attr('stroke-width', 2).style('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        event.stopPropagation()
        setSelectedItem({ type: 'node', data: d, color: getFactorColor(d.factor_type || d.category || '') })
      })
      .on('mouseenter', (event: any) => d3.select(event.target).attr('stroke-width', 2))
      .on('mouseleave', (event: any, d: any) => {
        const sel = selectedItemRef.current
        d3.select(event.target).attr('stroke-width', sel?.data?.id === d.id ? 2 : 1.2)
      })
    drag(factorCircle)

    // Factor 方向箭头
    const factorIcons = nodeGroup.selectAll('text.f-ico')
      .data(factorNodes).enter().append('text').attr('class', 'f-ico')
      .text((d: any) => d.evidence_direction === 'bullish' ? '↑' : d.evidence_direction === 'bearish' ? '↓' : '—')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', (d: any) => getFactorColor(d.factor_type || d.category || ''))
      .attr('font-size', (d: any) => `${Math.max(d._size * 0.6, 5)}px`).attr('font-weight', 'bold')
      .style('pointer-events', 'none')
    // Factor 名称
    const factorLabels = nodeGroup.selectAll('text.f-lbl')
      .data(factorNodes).enter().append('text').attr('class', 'f-lbl')
      .text((d: any) => d.name.length > 6 ? d.name.substring(0, 6) + '…' : d.name)
      .attr('font-size', '7px').attr('fill', '#ccc').attr('font-weight', '500').attr('text-anchor', 'middle')
      .style('font-family', 'system-ui').style('pointer-events', 'none')
    // Factor 分数
    const factorScores = nodeGroup.selectAll('text.f-sc')
      .data(factorNodes).enter().append('text').attr('class', 'f-sc')
      .text((d: any) => `${((d.impact_score || 0) * 100).toFixed(0)}%`)
      .attr('font-size', '6px').attr('fill', '#555').attr('text-anchor', 'middle')
      .style('font-family', 'system-ui').style('pointer-events', 'none')

    // --- Target 菱形 ---
    const targetNodes = nodesData.filter((n: any) => n.node_type === 'target')
    const targetG = nodeGroup.selectAll('g.target')
      .data(targetNodes).enter().append('g').attr('class', 'target').style('cursor', 'pointer')

    targetG.append('path')
      .attr('d', (d: any) => diamondPath(0, 0, d._size + 4))
      .attr('fill', 'none').attr('stroke', TARGET_COLOR).attr('stroke-width', 1)
      .attr('opacity', 0.2).attr('filter', 'url(#target-glow)')
    targetG.append('path')
      .attr('d', (d: any) => diamondPath(0, 0, d._size))
      .attr('fill', `${TARGET_COLOR}18`).attr('stroke', TARGET_COLOR).attr('stroke-width', 1.5)
    // 眼睛轮廓（上下弧合成）
    targetG.append('path')
      .attr('d', (d: any) => {
        const r = d._size * 0.55, ry = d._size * 0.38
        return `M ${-r},0 C ${-r * 0.5},${-ry} ${r * 0.5},${-ry} ${r},0 C ${r * 0.5},${ry} ${-r * 0.5},${ry} ${-r},0 Z`
      })
      .attr('fill', `${TARGET_COLOR}22`).attr('stroke', TARGET_COLOR).attr('stroke-width', 1.5)
      .style('pointer-events', 'none')
    // 瞳孔
    targetG.append('circle')
      .attr('cx', 0).attr('cy', 0)
      .attr('r', (d: any) => d._size * 0.18)
      .attr('fill', TARGET_COLOR).style('pointer-events', 'none')
    targetG.append('text')
      .text((d: any) => d.name)
      .attr('y', (d: any) => d._size + 12).attr('text-anchor', 'middle')
      .attr('fill', TARGET_COLOR).attr('font-size', '9px').attr('font-weight', '600')
      .style('font-family', 'system-ui').style('pointer-events', 'none')
    targetG.append('text')
      .text((d: any) => `置信度 ${((d.confidence || 0) * 100).toFixed(0)}%`)
      .attr('y', (d: any) => d._size + 22).attr('text-anchor', 'middle')
      .attr('fill', '#888').attr('font-size', '7px')
      .style('font-family', 'system-ui').style('pointer-events', 'none')
    targetG.on('click', (event: any, d: any) => {
      event.stopPropagation()
      setSelectedItem({ type: 'node', data: d, color: TARGET_COLOR })
    })
    drag(targetG)

    // 点击空白
    svg.on('click', () => setSelectedItem(null))

    // ── 位置更新函数 ──
    function updatePositions() {
      link.attr('d', getLinkPath)
      linkLabels.each(function (d: any) { const m = getLinkMid(d); d3.select(this).attr('x', m.x).attr('y', m.y) })
      linkLabelBg.each(function (d: any) {
        const m = getLinkMid(d); const w = (d.relation_type || d.relation || '关联').length * 5 + 8
        d3.select(this).attr('x', m.x - w / 2).attr('y', m.y - 7).attr('width', w).attr('height', 14)
      })
      agentG.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      signalCircle.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      signalLabels.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y - d._size - 5)
      clusterG.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      nodeGroup.selectAll('circle.min-halo').attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      factorBox
        .attr('x', (d: any) => d.x - d._size - 7)
        .attr('y', (d: any) => d.y - d._size - 7)
        .attr('width', (d: any) => (d._size + 7) * 2)
        .attr('height', (d: any) => (d._size + 7) * 2)
      factorCircle.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      factorIcons.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
      factorLabels.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y + d._size + 13)
      factorScores.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y + d._size + 24)
      targetG.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    }
    updatePositions()

    return () => { simulation.stop() }
  }, [graphData, showEdgeLabels, containerSize])

  // ── 空状态 ──
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full min-h-[300px] bg-[#0d1117] ${className}`}>
        <div className="text-center text-gray-500">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
            <svg className="w-7 h-7 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500 font-medium">暂无因果图谱数据</p>
          <p className="text-xs mt-1 text-zinc-700">等待 Agent 信号汇聚后自动构建</p>
        </div>
      </div>
    )
  }

  // ── 统计 ──
  const agentCount = graphData.nodes.filter(n => n.node_type === 'agent').length
  const signalCount = graphData.nodes.filter(n => n.node_type === 'signal').length
  const clusterCount = graphData.nodes.filter(n => n.node_type === 'cluster').length
  const factorCount = graphData.nodes.filter(n => n.node_type === 'factor').length
  const targetCount = graphData.nodes.filter(n => n.node_type === 'target' || n.is_target).length
  const edgeCount = graphData.edges.length

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[300px] bg-[#0d1117] overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />

        {/* 初始化加载指示器 */}
        {!hasRendered && graphData?.nodes?.length > 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d1117]">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-blue-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <p className="text-xs text-zinc-400 font-medium">图谱初始化中</p>
            <p className="text-[10px] text-zinc-600 mt-1">正在构建因果逻辑网络...</p>
          </div>
        )}

        {isUpdating && hasRendered && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded text-xs text-[#00ff88]">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            实时更新中...
          </div>
        )}

        {/* 统计面板 - 5层架构 */}
        <div className="absolute top-3 right-3 bg-black/75 backdrop-blur-md rounded-xl border border-white/[0.1] shadow-xl shadow-black/40 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-white/[0.06] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-zinc-400 tracking-widest uppercase">5-Layer Graph</span>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1 px-3 py-2 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm bg-cyan-400/80" />
              <span className="text-[11px] text-zinc-400">Agent</span>
              <span className="text-[12px] font-bold text-cyan-300 ml-auto">{agentCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400/80" />
              <span className="text-[11px] text-zinc-400">Signal</span>
              <span className="text-[12px] font-bold text-purple-300 ml-auto">{signalCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded bg-violet-500/80" />
              <span className="text-[11px] text-zinc-400">Cluster</span>
              <span className="text-[12px] font-bold text-violet-300 ml-auto">{clusterCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm bg-emerald-400/80 rotate-45" />
              <span className="text-[11px] text-zinc-400">Factor</span>
              <span className="text-[12px] font-bold text-emerald-300 ml-auto">{factorCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400/80" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
              <span className="text-[11px] text-zinc-400">Target</span>
              <span className="text-[12px] font-bold text-amber-300 ml-auto">{targetCount}</span>
            </div>
            <div className="col-span-3 mt-0.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">关系总数</span>
              <span className="text-[12px] font-bold text-zinc-200">{edgeCount}</span>
            </div>
          </div>
        </div>

        {/* 控制 */}
        <div className="absolute bottom-14 right-3 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-[10px] text-gray-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showEdgeLabels} onChange={e => setShowEdgeLabels(e.target.checked)} className="w-3 h-3 rounded accent-[#00ff88]" />
            因果标签
          </label>
        </div>

        {/* 图例 - 5层架构 */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[9px] max-w-[500px]">
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="text-[10px]">⬡</span> Agent
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]" /> 硬事实
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" /> 推演
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-3 h-1.5 rounded-sm bg-[#8b5cf6]" /> 聚类
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-1.5 h-1.5 rounded-full border border-[#00d4ff]" /> 因子
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="text-[#fbbf24] text-[8px]">◆</span> 目标
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-2.5 h-0 border-t border-[#00ff88]" /> 正向
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-2.5 h-0 border-t border-dashed border-[#ff6b6b]" /> 负向
          </span>
          <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-gray-300">
            <span className="w-2 h-2 rounded-sm border border-dashed border-[#ffd93d]" /> 少数派
          </span>
        </div>
      </div>

      {/* 详情面板 */}
      {selectedItem && (
        <div className="absolute top-4 right-4 w-80 bg-[#1a1f3a] border border-[#2a3f5f] rounded-lg shadow-2xl z-10 overflow-hidden max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3f5f]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">
                {selectedItem.data.node_type === 'agent' ? 'Agent 详情'
                  : selectedItem.data.node_type === 'signal' ? '信号详情'
                  : selectedItem.data.node_type === 'cluster' ? '聚类详情'
                  : selectedItem.data.node_type === 'target' ? '预测目标'
                  : selectedItem.type === 'edge' ? '因果关系'
                  : '因子详情'}
              </span>
              {selectedItem.color && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: `${selectedItem.color}33`, color: selectedItem.color }}>
                  {selectedItem.data.node_type || selectedItem.data.edge_type || 'factor'}
                </span>
              )}
            </div>
            <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
          </div>

          <div className="px-4 py-3 space-y-2 text-xs">
            {selectedItem.type === 'node' && selectedItem.data.node_type === 'agent' ? (
              <>
                <DetailRow label="用户名" value={selectedItem.data.name} />
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">预测立场</span>
                  <StanceBadge stance={selectedItem.data.persona?.stance} />
                </div>
                <ScoreBar label="声誉评分" value={Math.min(1, (selectedItem.data.persona?.reputation || 0) / 200)} display={`${selectedItem.data.persona?.reputation ?? 0} 分`} />
                <PanelSection label="用户画像" />
                {selectedItem.data.persona_region && <DetailRow label="地域" value={selectedItem.data.persona_region} />}
                {selectedItem.data.persona_gender && <DetailRow label="性别" value={({ male: '男', female: '女', other: '其他', unknown: '未知' } as Record<string, string>)[selectedItem.data.persona_gender] ?? selectedItem.data.persona_gender} />}
                {selectedItem.data.persona_age_range && <DetailRow label="年龄段" value={selectedItem.data.persona_age_range} />}
                {selectedItem.data.persona_occupation && <DetailRow label="职业" value={selectedItem.data.persona_occupation} />}
                {selectedItem.data.persona_interests && selectedItem.data.persona_interests.length > 0 && (
                  <>
                    <span className="text-gray-500">兴趣爱好</span>
                    <TagChips tags={selectedItem.data.persona_interests} color="violet" />
                  </>
                )}
                {(!selectedItem.data.persona_region && !selectedItem.data.persona_occupation) && (
                  <TextBlock>{selectedItem.data.persona_summary || '暂无画像信息。'}</TextBlock>
                )}
              </>
            ) : selectedItem.type === 'node' && selectedItem.data.node_type === 'signal' ? (
              <>
                <PanelSection label="论据全文" />
                <TextBlock>{selectedItem.data.source_description || selectedItem.data.name}</TextBlock>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">证据类型</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    selectedItem.data.evidence_type === 'hard_fact'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-violet-500/20 text-violet-300'
                  }`}>
                    {selectedItem.data.evidence_type === 'hard_fact' ? '📊 硬核事实' : '🧠 画像推演'}
                  </span>
                </div>
                <ScoreBar label="相关度" value={selectedItem.data.relevance_score || 0} />
                {selectedItem.data.is_minority && (
                  <div className="px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
                    ⚠️ 少数派信号
                  </div>
                )}
                <PanelSection label="推理说明" />
                <TextBlock>信号来自 Agent 提交的预测论据，相关度由 NLP 语义模型评估与预测问题的匹配度。硬核事实指可量化客观数据，画像推演指基于主观认知的判断。</TextBlock>
              </>
            ) : selectedItem.type === 'node' && selectedItem.data.node_type === 'cluster' ? (
              <>
                <DetailRow label="主题" value={selectedItem.data.name} />
                {selectedItem.data.description && (
                  <>
                    <PanelSection label="主题描述" />
                    <TextBlock>{selectedItem.data.description}</TextBlock>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">情感倾向</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    selectedItem.data.sentiment === 'positive' ? 'bg-emerald-500/20 text-emerald-300'
                    : selectedItem.data.sentiment === 'negative' ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-zinc-600/30 text-zinc-400'
                  }`}>
                    {selectedItem.data.sentiment === 'positive' ? '🟢 正面' : selectedItem.data.sentiment === 'negative' ? '🔴 负面' : '⚪ 中性'}
                  </span>
                </div>
                {selectedItem.data.is_minority && (
                  <div className="px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
                    ⚠️ 少数派聚类 — 可能包含被忽视的重要信号
                  </div>
                )}
                <PanelSection label="证据统计" />
                <DetailRow label="信号总数" value={`${selectedItem.data.signal_count || 0} 条`} />
                <DetailRow label="硬核事实" value={`${selectedItem.data.hard_fact_count || 0} 条`} />
                <DetailRow label="画像推演" value={`${selectedItem.data.persona_count || 0} 条`} />
                <ScoreBar label="平均质量" value={selectedItem.data.avg_quality_score || 0} />
                {(selectedItem.data.relevance_score || 0) > 0 && (
                  <ScoreBar label="相关度" value={selectedItem.data.relevance_score || 0} />
                )}
                {selectedItem.data.anchor_entities && selectedItem.data.anchor_entities.length > 0 && (
                  <>
                    <PanelSection label="锚点实体" />
                    <TagChips tags={selectedItem.data.anchor_entities.slice(0, 8)} color="violet" />
                  </>
                )}
                {selectedItem.data.persona_distribution && Object.keys(selectedItem.data.persona_distribution).length > 0 && (
                  <>
                    <PanelSection label="人群画像分布" />
                    {Object.entries(selectedItem.data.persona_distribution).slice(0, 5).map(([k, v]: [string, any]) => {
                      let display: string
                      if (typeof v === 'number') {
                        display = `${(v * 100).toFixed(0)}%`
                      } else if (typeof v === 'string') {
                        display = v
                      } else if (v && typeof v === 'object') {
                        // 分布对象：{ male: 3, female: 2 } → 按计数排序，计算占比
                        const allEntries = Object.entries(v as Record<string, number>)
                          .sort((a, b) => (b[1] as number) - (a[1] as number))
                        const total = allEntries.reduce((s, [, c]) => s + (c as number), 0)
                        display = allEntries.slice(0, 2).map(([ek, ev]) => {
                          const pct = total > 0 ? Math.round((ev as number) / total * 100) : 0
                          return `${ek} ${pct}%`
                        }).join(' · ')
                      } else {
                        display = String(v)
                      }
                      return <DetailRow key={k} label={k} value={display} />
                    })}
                  </>
                )}
                <PanelSection label="推理说明" />
                <TextBlock>聚类由语义相似的信号聚合而成，情感方向反映该主题下多数信号的立场。质量分评估信号证据强度，相关度衡量主题与预测问题的语义关联程度。</TextBlock>
              </>
            ) : selectedItem.type === 'node' && selectedItem.data.node_type === 'target' ? (
              <>
                <PanelSection label="预测问题" />
                <TextBlock>{selectedItem.data.name}</TextBlock>
                {selectedItem.data.description && (
                  <TextBlock>{selectedItem.data.description}</TextBlock>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">推演方向</span>
                  <DirectionBadge direction={selectedItem.data.evidence_direction} />
                </div>
                <PanelSection label="综合证据" />
                <ScoreBar label="置信度" value={selectedItem.data.confidence || 0} />
                <DetailRow label="证据总量" value={`${selectedItem.data.total_evidence_count || 0} 条`} />
                <DetailRow label="硬核事实" value={`${selectedItem.data.hard_fact_count || 0} 条`} />
                <DetailRow label="画像推演" value={`${selectedItem.data.persona_count || 0} 条`} />
                <PanelSection label="推理说明" />
                <TextBlock>置信度由所有影响因子经拓扑排序传播后的加权平均计算，反映整个因果网络对该预测目标的综合支撑强度。</TextBlock>
              </>
            ) : selectedItem.type === 'node' ? (
              <>
                <DetailRow label="因子名称" value={selectedItem.data.name} />
                {selectedItem.data.description && (
                  <>
                    <PanelSection label="因子描述" />
                    <TextBlock>{selectedItem.data.description}</TextBlock>
                  </>
                )}
                {selectedItem.data.category && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">分类</span>
                    <CategoryBadge category={selectedItem.data.category} />
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">证据方向</span>
                  <DirectionBadge direction={selectedItem.data.evidence_direction} />
                </div>
                <PanelSection label="量化指标" />
                <ScoreBar label="对目标影响力" value={selectedItem.data.impact_score || 0} />
                <ScoreBar label="证据置信度" value={selectedItem.data.confidence || 0} />
                <DetailRow label="证据总量" value={`${selectedItem.data.total_evidence_count || 0} 条`} />
                <DetailRow label="硬核事实" value={`${selectedItem.data.hard_fact_count || 0} 条`} />
                <DetailRow label="画像推演" value={`${selectedItem.data.persona_count || 0} 条`} />
                {selectedItem.data.source_cluster_ids && selectedItem.data.source_cluster_ids.length > 0 && (
                  <DetailRow label="来源聚类" value={`${selectedItem.data.source_cluster_ids.length} 个`} />
                )}
                {selectedItem.data.is_minority && (
                  <div className="mt-1 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-400">
                    ⚠️ 少数派因子 — 可能包含被忽视的重要信号
                  </div>
                )}
                <PanelSection label="推理说明" />
                <TextBlock>影响力由该因子到预测目标的最强因果路径权重×置信度计算，量化其对最终结论的贡献。置信度由聚类证据质量加权推导。</TextBlock>
              </>
            ) : (
              <>
                <div className="text-center py-1">
                  <span className="text-white font-medium">{selectedItem.data.source_name || selectedItem.data.source?.name || '?'}</span>
                  <span className="mx-2 text-gray-500">{selectedItem.data.direction === 'positive' ? '→' : '⊣'}</span>
                  <span className="text-white font-medium">{selectedItem.data.target_name || selectedItem.data.target?.name || '?'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">关系类型</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-300">
                    {selectedItem.data.relation_type || selectedItem.data.relation || '关联'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">作用方向</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    selectedItem.data.direction === 'positive' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {selectedItem.data.direction === 'positive' ? '↑ 正向促进' : '↓ 负向抑制'}
                  </span>
                </div>
                {selectedItem.data.strength && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">强度</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      selectedItem.data.strength === 'strong' ? 'bg-orange-500/20 text-orange-300'
                      : selectedItem.data.strength === 'moderate' ? 'bg-yellow-500/20 text-yellow-300'
                      : 'bg-zinc-600/30 text-zinc-400'
                    }`}>
                      {selectedItem.data.strength === 'strong' ? '强' : selectedItem.data.strength === 'moderate' ? '中' : '弱'}
                    </span>
                  </div>
                )}
                <ScoreBar label="权重" value={selectedItem.data.weight || 0} />
                {(selectedItem.data.evidence_count || 0) > 0 && (
                  <DetailRow label="证据数量" value={`${selectedItem.data.evidence_count} 条`} />
                )}
                {(selectedItem.data.hard_fact_ratio || 0) > 0 && (
                  <ScoreBar label="硬核事实占比" value={selectedItem.data.hard_fact_ratio || 0} />
                )}
                {selectedItem.data.reasoning && (
                  <>
                    <PanelSection label="推理依据" />
                    <TextBlock>{selectedItem.data.reasoning}</TextBlock>
                  </>
                )}
                <PanelSection label="推理说明" />
                <TextBlock>边权重由连接两因子的证据密度和强度计算。正向边表示源因子对目标因子有促进作用，负向边表示抑制作用。</TextBlock>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 辅助展示组件 ─────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-200 text-right break-words max-w-[60%]">{value}</span>
    </div>
  )
}

function PanelSection({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-0.5">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <span className="text-[9px] text-gray-600 tracking-widest uppercase font-mono shrink-0">{label}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  )
}

function ScoreBar({ label, value, display }: { label: string; value: number; display?: string }) {
  const pct = Math.min(100, Math.round((value || 0) * 100))
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#6b7280'
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-300 font-mono">{display ?? `${pct}%`}</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function TextBlock({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] text-gray-400 leading-relaxed bg-white/[0.02] rounded p-2 border border-white/[0.04]">
      {children}
    </div>
  )
}

function TagChips({ tags, color = 'violet' }: { tags: string[]; color?: 'violet' | 'cyan' | 'amber' }) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-500/20 text-violet-300',
    cyan: 'bg-cyan-500/20 text-cyan-300',
    amber: 'bg-amber-500/20 text-amber-300',
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag, i) => (
        <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${colorMap[color]}`}>{tag}</span>
      ))}
    </div>
  )
}

function StanceBadge({ stance }: { stance?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    bullish: { label: '📈 看涨', cls: 'bg-emerald-500/20 text-emerald-300' },
    bearish: { label: '📉 看跌', cls: 'bg-rose-500/20 text-rose-300' },
    neutral: { label: '➡️ 中性', cls: 'bg-zinc-600/30 text-zinc-400' },
  }
  const s = map[stance || ''] || map.neutral
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${s.cls}`}>{s.label}</span>
}

function DirectionBadge({ direction }: { direction?: string }) {
  if (direction === 'bullish') return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300">📈 正向</span>
  if (direction === 'bearish') return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/20 text-rose-300">📉 负向</span>
  return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-600/30 text-zinc-400">➡️ 中性</span>
}

function CategoryBadge({ category }: { category?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    macro_economic: { label: '宏观经济', color: '#00d4ff' },
    sentiment:      { label: '市场情绪', color: '#ffd93d' },
    behavior:       { label: '行为因素', color: '#fd79a8' },
    policy:         { label: '政策监管', color: '#ff6b6b' },
    event:          { label: '突发事件', color: '#a29bfe' },
    other:          { label: '其他',     color: '#b2bec3' },
  }
  const c = map[category || ''] || map.other
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium"
      style={{ background: `${c.color}22`, color: c.color }}>
      {c.label}
    </span>
  )
}

