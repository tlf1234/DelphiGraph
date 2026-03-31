'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, Maximize2, Minimize2, Sparkles, Users, Clock, Loader2, AlertCircle, BarChart3, ArrowLeft, FlaskConical, Play, X, RefreshCw, Upload, CheckCircle2, Brain } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────
interface Survey {
  id: string; title: string; description?: string; survey_type: string
  status: string; response_count: number; target_agent_count: number
  target_persona_filters: Record<string, string[]>; created_at: string; completed_at?: string
}
interface SurveyQuestion {
  id: string; question_order: number; question_text: string; question_type: string
  options: { id: string; text: string }[]; rating_min: number; rating_max: number
}
interface PersonaBreakdown { dimension: string; groups: Record<string, Record<string, number>> }
interface SurveyAnalysis {
  id: string; question_id: string | null; result_distribution: Record<string, number>
  persona_breakdown: PersonaBreakdown[]; consensus_answer: string | null
  dissent_rate: number; key_insights: string[]; full_report: string | null
  analyzed_response_count: number
}
interface SurveyResponse {
  id: string; question_id: string
  agent_persona: { agent_id?: string; username: string; region?: string; gender?: string; age_range?: string; occupation?: string; interests?: string[] }
  answer: string; rationale?: string; confidence: number
}
interface Props { survey: Survey; questions: SurveyQuestion[]; analyses: SurveyAnalysis[]; responses: SurveyResponse[] }

// ── Sim Types ──────────────────────────────────────────────────────────
type SimPhase = 'idle' | 'preparing' | 'uploading' | 'analyzing' | 'polling' | 'complete' | 'error'
interface SimState {
  phase: SimPhase; batchDone: number; totalBatches: number
  uploadedCount: number; totalTarget: number
  agents: { id: string; username: string }[]; log: string[]; error?: string
}

// ── Constants ─────────────────────────────────────────────────────────
const TOTAL_BATCHES      = 5
const BATCH_INTERVAL_MS  = 3000
const POLL_INTERVAL_MS   = 3000
const TYPE_LABELS: Record<string, string> = { opinion: '意见调查', market_research: '市场研究', product_feedback: '产品反馈', social: '社会研究' }
const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  draft:     { label: '草稿',   color: 'text-zinc-400',    dot: 'bg-zinc-500' },
  running:   { label: '进行中', color: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse' },
  completed: { label: '已完成', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  archived:  { label: '已归档', color: 'text-zinc-600',    dot: 'bg-zinc-600' },
}
const QTYPE_LABELS: Record<string, string> = { single_choice: '单选', multi_choice: '多选', rating: '评分', open_ended: '开放问答', comparison: '对比选择' }
const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

// ── Agent Graph View (Left SVG) ────────────────────────────────────────
function hexPath(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ') + ' Z'
}

function parsePrimaryAnswer(ans: string): string {
  if (ans.startsWith('[')) { try { return (JSON.parse(ans) as string[])[0] || ans } catch { return ans } }
  return ans
}
function sampleByAnswer(responses: SurveyResponse[], max: number): SurveyResponse[] {
  if (responses.length <= max) return responses
  const byAns = new Map<string, SurveyResponse[]>()
  for (const r of responses) {
    const key = parsePrimaryAnswer(r.answer)
    if (!byAns.has(key)) byAns.set(key, [])
    byAns.get(key)!.push(r)
  }
  const out: SurveyResponse[] = []
  byAns.forEach(g => {
    const take = Math.max(1, Math.round((g.length / responses.length) * max))
    out.push(...g.slice(0, take))
  })
  return out.slice(0, max)
}

function AgentGraphView({ question, analysis, responses }: {
  question: SurveyQuestion | null; analysis: SurveyAnalysis | null; responses: SurveyResponse[]
}) {
  const [hoveredKey,    setHoveredKey]    = useState<string | null>(null)
  const [selectedAns,   setSelectedAns]   = useState<{ id: string; color: string; px: number; py: number } | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<{ r: SurveyResponse; color: string; px: number; py: number } | null>(null)
  const [nodePosMap,    setNodePosMap]    = useState<Map<string, { cx: number; cy: number }>>(new Map())
  const rootRef    = useRef<HTMLDivElement>(null)
  const svgRef     = useRef<SVGSVGElement>(null)
  const dragRef    = useRef<{ key: string; ox: number; oy: number } | null>(null)
  const dragMoved  = useRef(false)

  const W = 440, H = 420, CX = 220, CY = 210
  const ANSWER_R = 68, AGENT_R = 174, MAX_SHOW = 60

  // Deterministic pseudo-random seeded by integer
  const pRand = (s: number) => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x) }

  type ANode = { id: string; label: string; pct: number; angle: number; cx: number; cy: number; r: number; color: string }
  type GNode = { key: string; cx: number; cy: number; color: string; ax: number; ay: number; answerId: string; p: SurveyResponse['agent_persona']; response: SurveyResponse }

  const { answerNodes, agentNodes, optMap } = useMemo(() => {
    if (!question || !analysis || !Object.keys(analysis.result_distribution).length)
      return { answerNodes: [] as ANode[], agentNodes: [] as GNode[], optMap: {} as Record<string, string> }

    const optMap: Record<string, string> = Object.fromEntries(question.options.map(o => [o.id, o.text]))
    const entries = Object.entries(analysis.result_distribution).sort((a, b) => b[1] - a[1])
    const qRes    = responses.filter(r => r.question_id === question.id)
    const sampled = sampleByAnswer(qRes, MAX_SHOW)

    const answerNodes: ANode[] = entries.map(([k, v], i) => {
      const angle = (2 * Math.PI * i / entries.length) - Math.PI / 2
      return { id: k, label: optMap[k] || k, pct: v, angle,
        cx: CX + ANSWER_R * Math.cos(angle), cy: CY + ANSWER_R * Math.sin(angle),
        r: 16 + v * 48, color: PALETTE[i % PALETTE.length] }
    })

    const answerById = new Map(answerNodes.map(a => [a.id, a]))

    // Scatter agents randomly around full ring (no grouping)
    const agentNodes: GNode[] = sampled.map((r, i) => {
      const angle      = pRand(i * 7 + 3) * Math.PI * 2
      const dist       = AGENT_R + (pRand(i * 13 + 97) * 24 - 12)
      const primaryAns = parsePrimaryAnswer(r.answer)
      const an         = answerById.get(primaryAns)
      return {
        key: r.id, answerId: primaryAns,
        cx: CX + dist * Math.cos(angle), cy: CY + dist * Math.sin(angle),
        ax: an?.cx ?? CX, ay: an?.cy ?? CY, color: an?.color ?? '#888',
        p: r.agent_persona, response: r,
      }
    })

    return { answerNodes, agentNodes, optMap }
  }, [question?.id, analysis?.question_id, responses])

  // Reset dragged positions when question changes
  useEffect(() => { setNodePosMap(new Map()) }, [question?.id])

  // Convert client coords → SVG coords
  const toSVG = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: clientX, y: clientY }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const inv = svg.getScreenCTM()?.inverse()
    return inv ? pt.matrixTransform(inv) : { x: clientX, y: clientY }
  }

  const getPos = (key: string, defCx: number, defCy: number) => {
    const ov = nodePosMap.get(key)
    return ov ?? { cx: defCx, cy: defCy }
  }

  if (!answerNodes.length) return (
    <div className="flex-1 flex items-center justify-center text-zinc-700 text-xs font-mono">暂无回答数据</div>
  )

  const lineOp  = (_aid: string) => 0.38
  const agentOp = (_aid: string, key: string) => {
    if (selectedAgent?.r.id === key) return 1
    return 0.85
  }
  // Quadratic Bezier curve — both endpoints follow live drag positions
  const curve = (a: GNode) => {
    const { cx, cy } = getPos(a.key, a.cx, a.cy)
    const { cx: ax, cy: ay } = getPos(`ans_${a.answerId}`, a.ax, a.ay)
    const qx = (CX + ax) / 2 * 0.35 + CX * 0.65
    const qy = (CY + ay) / 2 * 0.35 + CY * 0.65
    return `M ${cx.toFixed(1)},${cy.toFixed(1)} Q ${qx.toFixed(1)},${qy.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`
  }

  return (
    <div ref={rootRef} className="relative flex flex-col flex-1 min-h-0"
      onClick={() => { if (selectedAgent) setSelectedAgent(null); if (selectedAns) setSelectedAns(null) }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full flex-1" style={{ minHeight: 0 }}
        onPointerMove={e => {
          if (!dragRef.current) return
          dragMoved.current = true
          const pt = toSVG(e.clientX, e.clientY)
          const { key, ox, oy } = dragRef.current
          setNodePosMap(prev => new Map(prev).set(key, { cx: pt.x - ox, cy: pt.y - oy }))
        }}
        onPointerUp={() => { dragRef.current = null }}>
        <defs>
          <filter id="ag-glow"  x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="ag-glow2" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="9" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* grid rings */}
        {[55, 105, 160, 195].map(r => (
          <circle key={r} cx={CX} cy={CY} r={r} fill="none"
            stroke="rgba(255,255,255,0.02)" strokeWidth={1} strokeDasharray="2 9" />
        ))}

        {/* curved agent → answer lines */}
        {agentNodes.map(a => (
          <path key={`l-${a.key}`} d={curve(a)} fill="none"
            stroke={a.color} strokeWidth={0.85}
            strokeOpacity={lineOp(a.answerId)}
            style={{ transition: 'stroke-opacity 0.18s' }}
          />
        ))}

        {/* answer nodes — draggable */}
        {answerNodes.map((a, i) => {
          const isSel = selectedAns?.id === a.id
          const { cx, cy } = getPos(`ans_${a.id}`, a.cx, a.cy)
          return (
            <g key={a.id} style={{ cursor: 'pointer' }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => {
                e.stopPropagation()
                dragMoved.current = false
                const pt = toSVG(e.clientX, e.clientY)
                dragRef.current = { key: `ans_${a.id}`, ox: pt.x - cx, oy: pt.y - cy }
                ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              }}
              onPointerUp={e => {
                e.stopPropagation()
                dragRef.current = null
                if (!dragMoved.current) {
                  const rect = rootRef.current?.getBoundingClientRect()
                  const px = e.clientX - (rect?.left ?? 0)
                  const py = e.clientY - (rect?.top ?? 0)
                  setSelectedAns(prev => prev?.id === a.id ? null : { id: a.id, color: a.color, px, py })
                  setSelectedAgent(null)
                }
              }}>
              <circle cx={cx} cy={cy} r={a.r + 14} fill={a.color} fillOpacity={isSel ? 0.09 : 0.03} />
              <circle cx={cx} cy={cy} r={a.r} fill={a.color} fillOpacity={isSel ? 0.25 : 0.14}
                stroke={a.color} strokeWidth={isSel ? 2 : 1.5} strokeOpacity={0.92}
                filter={i === 0 || isSel ? 'url(#ag-glow)' : undefined} />
              {isSel && (
                <circle cx={cx} cy={cy} r={a.r + 6} fill="none"
                  stroke={a.color} strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />
              )}
              <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central"
                fontSize={a.r > 36 ? '14' : '11'} fontWeight="700" fill="white" fillOpacity={0.95}
                style={{ pointerEvents: 'none' }}>
                {(a.pct * 100).toFixed(0)}%
              </text>
              <text x={cx} y={cy + a.r * 0.55 + 3} textAnchor="middle" fontSize="7.5"
                fill="white" fillOpacity={0.55} style={{ pointerEvents: 'none' }}>
                {a.label.length > 10 ? a.label.slice(0, 10) + '…' : a.label}
              </text>
            </g>
          )
        })}

        {/* agent hexagons — draggable */}
        {agentNodes.map(a => {
          const isSel = selectedAgent?.r.id === a.key
          const isDrag = dragRef.current?.key === a.key
          const { cx, cy } = getPos(a.key, a.cx, a.cy)
          return (
            <g key={a.key}
              style={{ cursor: 'pointer' }}
              opacity={agentOp(a.answerId, a.key)}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => {
                e.stopPropagation()
                dragMoved.current = false
                const pt = toSVG(e.clientX, e.clientY)
                dragRef.current = { key: a.key, ox: pt.x - cx, oy: pt.y - cy }
                ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              }}
              onPointerUp={e => {
                e.stopPropagation()
                dragRef.current = null
                if (!dragMoved.current) {
                  const rect = rootRef.current?.getBoundingClientRect()
                  const px = e.clientX - (rect?.left ?? 0)
                  const py = e.clientY - (rect?.top ?? 0)
                  setSelectedAgent(prev => prev?.r.id === a.key ? null : { r: a.response, color: a.color, px, py })
                }
              }}
              onMouseEnter={() => setHoveredKey(a.key)}
              onMouseLeave={() => setHoveredKey(null)}>
              {isSel && (
                <path d={hexPath(cx, cy, 13)} fill="none"
                  stroke={a.color} strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 2" />
              )}
              <path d={hexPath(cx, cy, 8.5)} fill={a.color}
                fillOpacity={isSel ? 0.4 : 0.2}
                stroke={a.color} strokeWidth={isSel ? 1.5 : 1} strokeOpacity={0.9}
                filter={isSel ? 'url(#ag-glow2)' : undefined} />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                fontSize="5.5" fontWeight="700" fill="white" fillOpacity={0.9}
                style={{ pointerEvents: 'none' }}>
                {(a.p.username || 'A').slice(0, 2).toUpperCase()}
              </text>
            </g>
          )
        })}


        {/* ── Stats overlay — top right ── */}
        <g style={{ pointerEvents: 'none' }}>
          <text x={W - 8} y={16} textAnchor="end" fontFamily="monospace" fontSize="10"
            fill="rgba(255,255,255,0.22)" letterSpacing="1">
            {agentNodes.length} AGENTS
          </text>
          {answerNodes.map((a, i) => {
            const rowY = 30 + i * 14
            return (
              <g key={a.id}>
                <circle cx={W - 8} cy={rowY} r={3.5} fill={a.color} fillOpacity={0.85} />
                <text x={W - 15} y={rowY + 4} textAnchor="end" fontFamily="monospace" fontSize="8"
                  fill={a.color} fillOpacity={0.75}>
                  {(a.pct * 100).toFixed(0)}% {a.label.length > 6 ? a.label.slice(0, 6) + '…' : a.label}
                </text>
              </g>
            )
          })}
        </g>

        {/* in-SVG hover name tag */}
        {hoveredKey && !dragRef.current && (() => {
          const a = agentNodes.find(n => n.key === hoveredKey); if (!a) return null
          const { cx, cy } = getPos(a.key, a.cx, a.cy)
          const tag = [a.p.region, a.p.occupation].filter(Boolean).join(' · ')
          const bw = 90, bh = tag ? 28 : 16
          const bx = Math.min(Math.max(cx - bw / 2, 4), W - bw - 4)
          const by = cy - bh - 6
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={bx} y={by} width={bw} height={bh} rx={5}
                fill="#0d1128" fillOpacity={0.97} stroke={a.color} strokeWidth={0.7} strokeOpacity={0.65} />
              <text x={cx} y={by + 10} textAnchor="middle" fontSize="8"
                fill="white" fillOpacity={0.92}>{a.p.username || 'Agent'}</text>
              {tag && <text x={cx} y={by + 21} textAnchor="middle" fontSize="6.5"
                fill={a.color} fillOpacity={0.75}>{tag}</text>}
            </g>
          )
        })()}
      </svg>

      {/* Floating answer detail panel — positioned near click */}
      {selectedAns && (() => {
        const an   = answerNodes.find(a => a.id === selectedAns.id)
        if (!an) return null
        const voters = agentNodes.filter(a => a.answerId === selectedAns.id)
        const PW = 242
        const containerW = rootRef.current?.clientWidth  ?? 400
        const containerH = rootRef.current?.clientHeight ?? 500
        const left = Math.min(Math.max(selectedAns.px + 10, 6), containerW - PW - 6)
        const top  = Math.max(Math.min(selectedAns.py - 20, containerH - 200), 6)
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            className="absolute z-40 rounded-xl border border-white/[0.12] bg-[#0c1020]/95 shadow-2xl px-4 py-3"
            style={{ left, top, width: PW, backdropFilter: 'blur(14px)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: selectedAns.color }} />
              <span className="text-[12px] font-semibold text-zinc-200 flex-1 truncate">{an.label}</span>
              <button onClick={() => setSelectedAns(null)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-baseline gap-3 mb-2.5">
              <span className="text-2xl font-bold font-mono" style={{ color: selectedAns.color }}>
                {(an.pct * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-zinc-500">{voters.length} 位 agent 持此观点</span>
            </div>
            {voters.length > 0 && (
              <div className="space-y-1.5 border-t border-white/[0.06] pt-2">
                <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">代表 agents</p>
                {voters.slice(0, 4).map(v => (
                  <div key={v.key} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0"
                      style={{ background: `${selectedAns.color}20`, border: `1px solid ${selectedAns.color}60`, color: selectedAns.color }}>
                      {(v.p.username || 'A').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate">{v.p.username}</span>
                    {v.p.occupation && <span className="text-zinc-600 shrink-0">· {v.p.occupation}</span>}
                  </div>
                ))}
                {voters.length > 4 && (
                  <p className="text-[9px] text-zinc-600">+{voters.length - 4} 更多...</p>
                )}
              </div>
            )}
          </motion.div>
        )
      })()}

      {/* Floating agent detail panel — positioned near click */}
      {selectedAgent && (() => {
        const PW = 242
        const containerW = rootRef.current?.clientWidth  ?? 400
        const containerH = rootRef.current?.clientHeight ?? 500
        const left = Math.min(Math.max(selectedAgent.px + 10, 6), containerW - PW - 6)
        const top  = Math.max(Math.min(selectedAgent.py - 20, containerH - 180), 6)
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            className="absolute z-40 rounded-xl border border-white/[0.12] bg-[#0c1020]/95 shadow-2xl px-4 py-3"
            style={{ left, top, width: PW, backdropFilter: 'blur(14px)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{ background: `${selectedAgent.color}20`, border: `1.5px solid ${selectedAgent.color}80`, color: selectedAgent.color }}>
                {(selectedAgent.r.agent_persona.username || 'A').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[12px] font-semibold text-zinc-200 truncate">
                    {selectedAgent.r.agent_persona.username || 'Agent'}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: `${selectedAgent.color}20`, color: selectedAgent.color, border: `1px solid ${selectedAgent.color}50` }}>
                    {optMap[selectedAgent.r.answer] || selectedAgent.r.answer}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mb-1.5 text-[10px] text-zinc-500">
                  {selectedAgent.r.agent_persona.region     && <span>📍 {selectedAgent.r.agent_persona.region}</span>}
                  {selectedAgent.r.agent_persona.age_range  && <span>🎂 {selectedAgent.r.agent_persona.age_range}</span>}
                  {selectedAgent.r.agent_persona.occupation && <span>💼 {selectedAgent.r.agent_persona.occupation}</span>}
                  {selectedAgent.r.agent_persona.gender     && <span>👤 {selectedAgent.r.agent_persona.gender}</span>}
                </div>
                {selectedAgent.r.rationale && (
                  <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2 italic border-t border-white/[0.05] pt-1.5 mt-0.5">
                    "{selectedAgent.r.rationale}"
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedAgent(null)}
                className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )
      })()}
    </div>
  )
}

// ── Demographic Breakdown ─────────────────────────────────────────────
const STOP_WORDS = new Set(['的','了','是','在','我','有','和','就','不','人','都','一','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这','那','但','可以','对','the','a','an','is','are','was','be','it','this','that','with','for','of','in','to','and','or','not','as','at','by','from','we','has','have'])
function extractKw(texts: string[]): { word: string; count: number }[] {
  const freq: Record<string, number> = {}
  for (const t of texts)
    t.split(/[\s，。！？、；：""''【】（）(),.!?;:\-—]+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()))
      .forEach(w => { const lw = w.toLowerCase(); freq[lw] = (freq[lw] || 0) + 1 })
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([word, count]) => ({ word, count }))
}

function DemographicBreakdown({ question, analysis, responses }: {
  question: SurveyQuestion; analysis: SurveyAnalysis; responses: SurveyResponse[]
}) {
  type DimKey = 'occupation' | 'region' | 'gender' | 'age_range'
  const DIMS: { key: DimKey; label: string }[] = [
    { key: 'occupation', label: '职业' }, { key: 'region', label: '地区' },
    { key: 'gender', label: '性别' }, { key: 'age_range', label: '年龄段' },
  ]
  const [dim, setDim] = useState<DimKey>('occupation')
  const qRes    = useMemo(() => responses.filter(r => r.question_id === question.id), [responses, question.id])
  const entries = useMemo(() => Object.entries(analysis.result_distribution).sort((a, b) => b[1] - a[1]), [analysis])
  const optMap  = useMemo(() => Object.fromEntries(question.options.map(o => [o.id, o.text])), [question])
  const rows    = useMemo(() => {
    const groups: Record<string, Record<string, number>> = {}
    for (const r of qRes) {
      const val = (r.agent_persona[dim] as string | undefined) || '未知'
      const ans = parsePrimaryAnswer(r.answer)
      if (!groups[val]) groups[val] = {}
      groups[val][ans] = (groups[val][ans] || 0) + 1
    }
    return Object.entries(groups)
      .map(([gval, dist]) => {
        const total = Object.values(dist).reduce((s, v) => s + v, 0)
        return { gval, pcts: Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, v / total])), total }
      })
      .sort((a, b) => b.total - a.total).slice(0, 7)
  }, [qRes, dim])

  if (!qRes.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-mono">暂无回答数据</div>
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-1.5 flex-wrap">
        {DIMS.map(d => (
          <button key={d.key} onClick={() => setDim(d.key)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all ${dim === d.key ? 'bg-violet-500/15 border-violet-500/40 text-violet-300' : 'bg-white/[0.03] border-white/[0.06] text-zinc-500 hover:text-zinc-300'}`}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.slice(0, 5).map(([k], i) => (
          <div key={k} className="flex items-center gap-1.5 text-[9px] text-zinc-500">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate max-w-[72px]">{optMap[k] || k}</span>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map(({ gval, pcts, total }) => (
          <div key={gval}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[150px]">{gval}</span>
              <span className="text-[9px] text-zinc-600 font-mono shrink-0 ml-2">{total} 人</span>
            </div>
            <div className="flex h-5 rounded overflow-hidden">
              {entries.map(([k], i) => {
                const pct = pcts[k] || 0
                if (pct < 0.01) return null
                return (
                  <div key={k} className="flex items-center justify-center"
                    style={{ width: `${pct * 100}%`, background: PALETTE[i % PALETTE.length] + 'cc' }}
                    title={`${optMap[k] || k}: ${(pct * 100).toFixed(0)}%`}>
                    {pct > 0.14 && <span className="text-[8px] font-bold text-black/70">{(pct * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Open-Ended Analysis ───────────────────────────────────────────────
function OpenEndedAnalysis({ question, responses }: {
  question: SurveyQuestion; responses: SurveyResponse[]
}) {
  const qRes   = useMemo(() => responses.filter(r => r.question_id === question.id), [responses, question.id])
  const kws    = useMemo(() => extractKw(qRes.map(r => r.answer)), [qRes])
  const themes = useMemo(() => {
    const topKws = kws.slice(0, 6).map(k => k.word)
    const groups: Record<string, SurveyResponse[]> = {}
    topKws.forEach(kw => { groups[kw] = [] }); groups['其他'] = []
    for (const r of qRes) {
      const hit = topKws.find(kw => r.answer.toLowerCase().includes(kw.toLowerCase()))
      ;(hit ? groups[hit] : groups['其他']).push(r)
    }
    return Object.entries(groups).filter(([, rs]) => rs.length > 0).sort((a, b) => b[1].length - a[1].length).slice(0, 6)
  }, [qRes, kws])

  if (!qRes.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-mono">暂无开放回答</div>
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarWidth: 'none' }}>
      <div>
        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-2.5">高频关键词</p>
        <div className="flex flex-wrap gap-1.5">
          {kws.slice(0, 16).map(({ word, count }, i) => {
            const ratio = count / (kws[0]?.count || 1)
            return (
              <span key={word} className="px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.03]"
                style={{ fontSize: 9 + ratio * 4, color: PALETTE[i % PALETTE.length], opacity: 0.45 + ratio * 0.55 }}>
                {word} <span className="text-zinc-700 text-[8px]">{count}</span>
              </span>
            )
          })}
        </div>
      </div>
      <div>
        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-2">主题聚类 · {qRes.length} 条回答</p>
        <div className="space-y-2">
          {themes.map(([theme, rs], i) => (
            <div key={theme} className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="text-[10px] font-semibold text-zinc-300">{theme}</span>
                <span className="ml-auto text-[9px] text-zinc-600 shrink-0">
                  {rs.length} 人 · {((rs.length / qRes.length) * 100).toFixed(0)}%
                </span>
              </div>
              {rs[0] && (
                <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2 italic">
                  "{rs[0].answer.slice(0, 90)}{rs[0].answer.length > 90 ? '…' : ''}"
                  <span className="not-italic text-zinc-700 ml-1">— {rs[0].agent_persona.username}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Rating View ───────────────────────────────────────────────────────
function RatingView({ question, analysis, responses }: {
  question: SurveyQuestion; analysis: SurveyAnalysis; responses: SurveyResponse[]
}) {
  const qRes    = useMemo(() => responses.filter(r => r.question_id === question.id), [responses, question.id])
  const ratings = useMemo(() => qRes.map(r => parseFloat(r.answer)).filter(v => !isNaN(v)), [qRes])
  const min = question.rating_min ?? 1
  const max = question.rating_max ?? 10
  const range = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  const mean   = ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0
  const std    = ratings.length ? Math.sqrt(ratings.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / ratings.length) : 0
  const counts: Record<number, number> = Object.fromEntries(range.map(v => [v, 0]))
  for (const v of ratings) { const k = Math.round(v); if (k >= min && k <= max) counts[k] = (counts[k] || 0) + 1 }
  const maxCount = Math.max(...Object.values(counts), 1)
  const sorted  = [...ratings].sort((a, b) => a - b)
  const p = (pct: number) => sorted[Math.floor(sorted.length * pct / 100)] ?? mean

  if (!qRes.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-mono">暂无评分数据</div>
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-5" style={{ scrollbarWidth: 'none' }}>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: '均值',   v: mean.toFixed(2),  c: 'text-emerald-400' },
          { l: '标准差', v: std.toFixed(2),   c: 'text-blue-400' },
          { l: '样本数', v: ratings.length,   c: 'text-violet-400' },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2 text-center">
            <div className={`text-base font-bold font-mono ${c}`}>{v}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-3">评分分布</p>
        <div className="flex items-end gap-0.5 h-28">
          {range.map(v => {
            const count = counts[v] || 0
            const pct   = count / maxCount
            const color = v < mean - 0.5 * std ? '#3b82f6' : v > mean + 0.5 * std ? '#10b981' : '#8b5cf6'
            return (
              <div key={v} className="flex-1 flex flex-col items-center gap-0.5">
                {count > 0 && <span className="text-[7px] font-mono text-zinc-600">{count}</span>}
                <motion.div className="w-full rounded-t" initial={{ height: 0 }} animate={{ height: Math.max(pct * 88, count > 0 ? 3 : 0) }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ background: color, opacity: 0.55 + pct * 0.45 }} />
                <span className="text-[8px] font-mono text-zinc-500">{v}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-zinc-600">
          <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-blue-500 inline-block" /> 低分区</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-violet-500 inline-block" /> 均值区</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1 rounded bg-emerald-500 inline-block" /> 高分区</span>
        </div>
      </div>
      <div>
        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-2">分位数</p>
        <div className="grid grid-cols-3 gap-2">
          {[25, 50, 75].map(pp => (
            <div key={pp} className="bg-white/[0.02] rounded-lg p-2 text-center border border-white/[0.05]">
              <div className="text-xs font-bold font-mono text-zinc-300">{p(pp).toFixed(1)}</div>
              <div className="text-[9px] text-zinc-600">P{pp}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Confidence View ───────────────────────────────────────────────────
function ConfidenceView({ question, analysis, responses }: {
  question: SurveyQuestion; analysis: SurveyAnalysis; responses: SurveyResponse[]
}) {
  const qRes   = useMemo(() => responses.filter(r => r.question_id === question.id), [responses, question.id])
  const optMap = useMemo(() => Object.fromEntries(question.options.map(o => [o.id, o.text])), [question])
  const entries = useMemo(() => Object.entries(analysis.result_distribution).sort((a, b) => b[1] - a[1]), [analysis])

  const parsePrimary = (ans: string) => ans.startsWith('[') ? (() => { try { return (JSON.parse(ans) as string[])[0] || ans } catch { return ans } })() : ans

  const { high, mid, low, avgConf, ansConf } = useMemo(() => {
    const high = qRes.filter(r => r.confidence >= 0.75)
    const mid  = qRes.filter(r => r.confidence >= 0.5 && r.confidence < 0.75)
    const low  = qRes.filter(r => r.confidence < 0.5)
    const avg  = qRes.length ? qRes.reduce((s, r) => s + r.confidence, 0) / qRes.length : 0
    const map: Record<string, number[]> = {}
    for (const r of qRes) { const k = parsePrimary(r.answer); if (!map[k]) map[k] = []; map[k].push(r.confidence) }
    const ansConf = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]))
    return { high, mid, low, avgConf: avg, ansConf }
  }, [qRes])

  if (!qRes.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-mono">暂无置信数据</div>
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarWidth: 'none' }}>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: '平均置信度', v: `${(avgConf * 100).toFixed(0)}%`, c: avgConf > 0.7 ? 'text-emerald-400' : avgConf > 0.5 ? 'text-blue-400' : 'text-amber-400' },
          { l: '高置信 ≥75%', v: high.length, c: 'text-emerald-400' },
          { l: '低置信 <50%', v: low.length,  c: 'text-amber-400' },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2 text-center">
            <div className={`text-sm font-bold font-mono ${c}`}>{v}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-2">置信度分布</p>
        <div className="flex h-5 rounded overflow-hidden">
          {[{ count: high.length, color: '#10b981', label: '高' }, { count: mid.length, color: '#3b82f6', label: '中' }, { count: low.length, color: '#f59e0b', label: '低' }]
            .filter(b => b.count > 0).map(b => (
              <div key={b.label} className="flex items-center justify-center transition-all"
                style={{ width: `${(b.count / qRes.length) * 100}%`, background: b.color + 'bb' }}
                title={`${b.label}: ${b.count}`}>
                {b.count / qRes.length > 0.12 && <span className="text-[8px] font-bold text-black/70">{b.count}</span>}
              </div>
            ))}
        </div>
        <div className="flex gap-3 mt-1.5">
          {[{ l: '高 ≥75%', c: '#10b981', n: high.length }, { l: '中 50-75%', c: '#3b82f6', n: mid.length }, { l: '低 <50%', c: '#f59e0b', n: low.length }].map(({ l, c, n }) => (
            <div key={l} className="flex items-center gap-1 text-[9px] text-zinc-500">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: c }} />{l} ({n})
            </div>
          ))}
        </div>
      </div>
      {question.question_type !== 'open_ended' && entries.length > 0 && (
        <div>
          <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-2">各选项置信均值</p>
          <div className="space-y-2.5">
            {entries.map(([k], i) => {
              const conf = ansConf[k] ?? 0
              return (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-400 truncate max-w-[150px]">{optMap[k] || k}</span>
                    <span className="text-[10px] font-mono shrink-0 ml-2" style={{ color: PALETTE[i % PALETTE.length] }}>{(conf * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ background: PALETTE[i % PALETTE.length] + 'aa' }}
                      initial={{ width: 0 }} animate={{ width: `${conf * 100}%` }} transition={{ duration: 0.6 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export CSV ────────────────────────────────────────────────────────
function exportResponsesCSV(survey: Survey, questions: SurveyQuestion[], responses: SurveyResponse[]) {
  const headers = ['题目', '题型', '答案ID', '答案文本', 'Agent', '地区', '职业', '性别', '年龄段', '置信度', '理由']
  const optMaps = Object.fromEntries(questions.map(q => [q.id, Object.fromEntries(q.options.map(o => [o.id, o.text]))]))
  const rows = responses.map(r => {
    const q = questions.find(qx => qx.id === r.question_id)
    const om = optMaps[r.question_id] || {}
    let ansText = r.answer
    if (r.answer.startsWith('[')) {
      try { ansText = (JSON.parse(r.answer) as string[]).map(a => om[a] || a).join('; ') } catch { /* ignore */ }
    } else { ansText = om[r.answer] || r.answer }
    return [q?.question_text || '', q ? (QTYPE_LABELS[q.question_type] || q.question_type) : '',
      r.answer, ansText, r.agent_persona.username || '', r.agent_persona.region || '',
      r.agent_persona.occupation || '', r.agent_persona.gender || '', r.agent_persona.age_range || '',
      r.confidence.toFixed(2), r.rationale || ''].map(v => `"${String(v).replace(/"/g, '""')}"`)
  })
  const csv  = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${survey.title}_responses.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Left Panel ────────────────────────────────────────────────────────
function LeftPanel({ survey, questions, analyses, responses, activeQ, onSelectQ, liveStatus, onRun, running, runError }: {
  survey: Survey; questions: SurveyQuestion[]; analyses: SurveyAnalysis[]; responses: SurveyResponse[]
  activeQ: string; onSelectQ: (id: string) => void; liveStatus: string
  onRun: () => void; running: boolean; runError: string
}) {
  const st = STATUS_MAP[liveStatus] ?? STATUS_MAP.draft
  const aq = questions.find(q => q.id === activeQ) ?? null
  const aa = analyses.find(a => a.question_id === activeQ) ?? null
  const [view, setView] = useState('graph')
  useEffect(() => setView('graph'), [activeQ])
  return (
    <div className="flex flex-col h-full bg-[#060a14]">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">Agent Graph</span>
        </div>
        <div className="flex items-center gap-2">
          {liveStatus === 'completed' && responses.length > 0 && (
            <button onClick={() => exportResponsesCSV(survey, questions, responses)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono border border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:border-white/20 transition-all"
              title="导出 CSV">
              <Upload className="w-3 h-3" /> CSV
            </button>
          )}
          <span className={`flex items-center gap-1.5 text-[11px] font-medium ${st.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
          </span>
        </div>
      </div>
      {/* running / draft — centered in remaining space */}
      {(liveStatus === 'running' || liveStatus === 'draft') && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-4 min-h-0">
          {liveStatus === 'running' && (
            <>
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border border-amber-400/20 animate-ping" />
                <div className="absolute inset-4 rounded-full border border-amber-400/30 animate-ping" style={{ animationDelay: '0.4s' }} />
                <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-7 h-7 text-amber-400 animate-spin" /></div>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono text-center">AI 智能体收集意见中<br/>Opinion data gathering...</p>
            </>
          )}
          {liveStatus === 'draft' && (
            <>
              <div className="w-12 h-12 rounded-full border border-zinc-700 flex items-center justify-center text-xl">📋</div>
              <p className="text-xs text-zinc-500 text-center font-mono">{questions.length} 道题目 · {survey.target_agent_count} 目标 Agent</p>
              <button onClick={onRun} disabled={running}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold rounded-xl text-sm transition-colors">
                {running ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />启动中...</span> : '▶ 启动调查'}
              </button>
              <div className="w-full space-y-1.5">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex gap-2 text-[11px] text-zinc-600 font-mono">
                    <span className="text-zinc-700">{i + 1}.</span><span className="line-clamp-1">{q.question_text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* completed — stat cards + tab nav + content */}
      {liveStatus === 'completed' && (
        aa ? (() => {
          const sorted = Object.entries(aa.result_distribution).sort((a, b) => b[1] - a[1])
          const lead   = sorted.length >= 2 ? ((sorted[0][1] - sorted[1][1]) * 100) : (sorted[0]?.[1] ?? 0) * 100
          const isOE     = aq?.question_type === 'open_ended'
          const isRating = aq?.question_type === 'rating'
          const tabs   = [
            { id: 'graph',    label: isRating ? '评分图' : '图谱' },
            { id: 'demo',     label: '人口统计' },
            { id: 'confidence', label: '置信度' },
            ...(isOE ? [{ id: 'insights', label: '观点分析' }] : []),
          ]
          return (
            <>
              <div className="shrink-0 grid grid-cols-3 gap-2 px-4 pt-3 pb-2">
                {[
                  { l: '有效回答', v: aa.analyzed_response_count,               c: 'text-emerald-400' },
                  { l: '分歧率',   v: `${(aa.dissent_rate * 100).toFixed(0)}%`,  c: aa.dissent_rate > 0.5 ? 'text-amber-400' : 'text-blue-400' },
                  { l: '共识强度', v: `+${lead.toFixed(0)}%`,                    c: lead > 30 ? 'text-violet-400' : lead > 10 ? 'text-blue-400' : 'text-zinc-500' },
                ].map(({ l, v, c }) => (
                  <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2 text-center">
                    <div className={`text-sm font-bold font-mono ${c}`}>{v}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{l}</div>
                  </div>
                ))}
              </div>
              {/* Tab navigation */}
              <div className="shrink-0 flex border-b border-white/[0.05] px-3">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => setView(tab.id)}
                    className={`px-3 py-2 text-[11px] font-mono border-b-2 transition-all -mb-px ${
                      view === tab.id ? 'border-violet-500 text-violet-300' : 'border-transparent text-zinc-600 hover:text-zinc-400'
                    }`}>{tab.label}</button>
                ))}
              </div>
              {view === 'graph'      && aq && (isRating
                ? <RatingView question={aq} analysis={aa} responses={responses} />
                : <AgentGraphView question={aq} analysis={aa} responses={responses} />)}
              {view === 'demo'       && aq && <DemographicBreakdown question={aq} analysis={aa} responses={responses} />}
              {view === 'confidence' && aq && <ConfidenceView question={aq} analysis={aa} responses={responses} />}
              {view === 'insights'   && aq && isOE && <OpenEndedAnalysis question={aq} responses={responses} />}
            </>
          )
        })() : <p className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-mono">该题目暂无分析数据</p>
      )}
      {runError && (
        <div className="mx-3 mb-2 px-3 py-2 bg-red-400/10 border border-red-400/20 rounded-lg text-[11px] text-red-400 flex items-center gap-1.5 shrink-0">
          <AlertCircle className="w-3 h-3 shrink-0" />{runError}
        </div>
      )}
      {questions.length > 0 && (
        <div className="border-t border-white/[0.05] px-3 py-2 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {questions.map((q, i) => (
              <button key={q.id} onClick={() => onSelectQ(q.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all border ${
                  activeQ === q.id ? 'bg-violet-500/15 border-violet-500/40 text-violet-300' : 'bg-white/[0.03] border-white/[0.06] text-zinc-500 hover:text-zinc-300'
                }`}>Q{i + 1}</button>
            ))}
          </div>
          {aq && <p className="mt-1.5 text-[11px] text-zinc-600 line-clamp-2 leading-relaxed">{aq.question_text}</p>}
        </div>
      )}
    </div>
  )
}

// ── Persona Snippet ───────────────────────────────────────────────────
function PersonaSnippet({ breakdown, optionMap }: { breakdown: PersonaBreakdown[]; optionMap: Record<string, string> }) {
  const [dim, setDim] = useState(breakdown[0]?.dimension || '')
  const current = breakdown.find(b => b.dimension === dim)
  if (!current) return null
  return (
    <div>
      <div className="flex gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider self-center mr-1">人群分布</span>
        {breakdown.map(b => (
          <button key={b.dimension} onClick={e => { e.stopPropagation(); setDim(b.dimension) }}
            className={`px-2 py-0.5 rounded text-[10px] border font-mono transition-all ${dim === b.dimension ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-white/[0.07] text-zinc-600 hover:text-zinc-400'}`}>
            {b.dimension}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(current.groups).slice(0, 4).map(([gval, dist]) => {
          const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]
          if (!top) return null
          return (
            <div key={gval} className="bg-white/[0.02] rounded-lg px-2.5 py-1.5">
              <div className="text-[10px] text-zinc-500 font-mono">{gval}</div>
              <div className="text-[11px] text-zinc-300 truncate">{optionMap[top[0]] || top[0]}</div>
              <div className="text-[10px] font-mono mt-0.5" style={{ color: PALETTE[0] }}>{(top[1] * 100).toFixed(0)}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Report View (§-section newspaper renderer) ───────────────────────
function ReportView({ text }: { text: string }) {
  const sections = useMemo(() => {
    const parts = text.split(/(?=^§\s)/m)
    return parts.map(p => {
      const nl = p.indexOf('\n')
      if (nl === -1) return { title: p.replace(/^§\s*/, '').trim(), body: '' }
      return {
        title: p.slice(0, nl).replace(/^§\s*/, '').trim(),
        body: p.slice(nl + 1).trim(),
      }
    }).filter(s => s.title || s.body)
  }, [text])

  const SECTION_ICONS: Record<string, string> = {
    '导语': '◎', '核心发现': '✦', '群体图谱': '◈', '异见声音': '◇',
    '信号与洞察': '◉', '预测与建议': '◆',
  }

  if (!sections.length) {
    return <p className="text-sm text-zinc-300 leading-loose font-serif whitespace-pre-wrap">{text}</p>
  }

  return (
    <div className="space-y-0">
      {sections.map((s, i) => (
        <div key={i}>
          {/* Section divider + heading */}
          <div className={`flex items-center gap-3 py-4 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>
            <span className="text-amber-500/80 text-base shrink-0">{SECTION_ICONS[s.title] ?? '§'}</span>
            <h4 className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-400/80 font-semibold">{s.title}</h4>
            <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 to-transparent" />
          </div>
          {/* First paragraph as pull-quote style, rest normal */}
          {s.body && (() => {
            const paras = s.body.split(/\n{2,}/).filter(Boolean)
            return (
              <div className="space-y-3 pb-2">
                {paras.map((para, pi) => (
                  pi === 0 && i === 0
                    ? <p key={pi} className="text-base font-serif text-zinc-100 leading-loose font-medium border-l-2 border-amber-500/50 pl-4">{para}</p>
                    : <p key={pi} className="text-[13px] font-serif text-zinc-300 leading-[1.9] pl-0">{para}</p>
                ))}
              </div>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

// ── Right Panel (Survey Oracle Newspaper) ────────────────────────────
function RightPanel({ survey, questions, analyses, activeQ, onSelectQ, liveStatus }: {
  survey: Survey; questions: SurveyQuestion[]; analyses: SurveyAnalysis[]
  activeQ: string; onSelectQ: (id: string) => void; liveStatus: string
}) {
  const futureDate = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 2)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  }, [])
  const globalReport = analyses.find(a => a.full_report)?.full_report

  return (
    <div className="h-full overflow-y-auto bg-[#060a14]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
      <div className="min-h-full bg-gradient-to-b from-[#07091c] to-[#060a14]">

        {/* Masthead */}
        <div className="border-b-2 border-amber-500/40 px-6 py-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
          </div>
          <h1 className="text-center text-3xl font-bold text-white font-serif tracking-widest mb-1">THE SURVEY ORACLE</h1>
          <p className="text-center text-[11px] text-zinc-500 font-mono">AI 集体意见报告 · {futureDate}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <span className="text-[10px] text-amber-600/70 font-mono uppercase tracking-widest">{TYPE_LABELS[survey.survey_type] || survey.survey_type} · Survey Intelligence</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          </div>
        </div>

        {/* Survey title */}
        <div className="px-6 py-4 border-b border-white/[0.05]">
          <h2 className="text-xl font-bold text-white font-serif leading-snug mb-1">{survey.title}</h2>
          {survey.description && <p className="text-sm text-zinc-400 leading-relaxed">{survey.description}</p>}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 border-b border-white/[0.05]">
          {[
            { l: '题目数',    v: questions.length,                              icon: <BarChart3 className="w-3.5 h-3.5" />, c: 'text-blue-400' },
            { l: '智能体回答', v: (survey.response_count || 0).toLocaleString(), icon: <Users className="w-3.5 h-3.5" />,    c: 'text-violet-400' },
            { l: '目标 Agent', v: survey.target_agent_count || '全量',           icon: <Users className="w-3.5 h-3.5" />,    c: 'text-emerald-400' },
            { l: '完成时间',   v: survey.completed_at ? new Date(survey.completed_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—', icon: <Clock className="w-3.5 h-3.5" />, c: 'text-amber-400' },
          ].map(({ l, v, icon, c }, idx) => (
            <div key={idx} className={`px-4 py-3 text-center ${idx < 3 ? 'border-r border-white/[0.05]' : ''}`}>
              <div className={`flex justify-center mb-1 opacity-60 ${c}`}>{icon}</div>
              <div className={`text-lg font-bold font-mono ${c}`}>{v}</div>
              <div className="text-[10px] text-zinc-600">{l}</div>
            </div>
          ))}
        </div>

        {/* Waiting state */}
        {liveStatus !== 'completed' && (
          <div className="px-6 py-16 text-center">
            <div className="text-5xl mb-4">{liveStatus === 'running' ? '⏳' : '📋'}</div>
            <p className="text-zinc-500 font-mono text-sm">{liveStatus === 'running' ? 'AI 智能体意见收集中' : '调查尚未启动'}</p>
            <p className="text-zinc-700 font-mono text-xs mt-1">{liveStatus === 'running' ? '报告将在全部回答完成后自动生成' : '点击左侧「启动调查」部署 AI 智能体'}</p>
          </div>
        )}

        {/* Single active-question deep dive */}
        {liveStatus === 'completed' && questions.length > 0 && (() => {
          const qi  = questions.findIndex(q => q.id === activeQ)
          const q   = questions[qi]
          const an  = q ? analyses.find(a => a.question_id === q.id) : null
          const optMap = q ? Object.fromEntries(q.options.map(o => [o.id, o.text])) : {}
          const entries = an ? Object.entries(an.result_distribution).sort((a, b) => b[1] - a[1]) : []
          const prev = qi > 0 ? questions[qi - 1] : null
          const next = qi < questions.length - 1 ? questions[qi + 1] : null
          return (
            <div className="px-6 py-5">
              {/* question navigator */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => prev && onSelectQ(prev.id)} disabled={!prev}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 disabled:opacity-20 disabled:cursor-default transition-colors">
                  ← {prev ? `Q${qi} ${prev.question_text.slice(0, 14)}…` : ''}
                </button>
                <span className="text-[11px] font-mono text-zinc-600">Q{qi + 1} / {questions.length}</span>
                <button onClick={() => next && onSelectQ(next.id)} disabled={!next}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 disabled:opacity-20 disabled:cursor-default transition-colors">
                  {next ? `Q${qi + 2} ${next.question_text.slice(0, 14)}…` : ''} →
                </button>
              </div>

              {q && (
                <AnimatePresence mode="wait">
                  <motion.article key={q.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}
                    className="rounded-xl border border-violet-500/25 bg-violet-500/[0.03] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/[0.05] flex items-start gap-3">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 text-[12px] font-bold font-mono flex items-center justify-center">{qi + 1}</span>
                      <div>
                        <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider mb-1">{QTYPE_LABELS[q.question_type] || q.question_type}</div>
                        <h3 className="text-base font-bold font-serif leading-snug text-white">{q.question_text}</h3>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      {!an ? <p className="text-xs text-zinc-600 font-mono">暂无分析数据</p> : (
                        <div className="space-y-3">
                          {entries.map(([k, v], i) => (
                            <div key={k}>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="text-zinc-300 truncate max-w-[70%]">{optMap[k] || k}</span>
                                <span className="font-mono shrink-0" style={{ color: PALETTE[i % PALETTE.length] }}>{(v * 100).toFixed(0)}%</span>
                              </div>
                              <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                                <motion.div className="h-full rounded-full" style={{ background: PALETTE[i % PALETTE.length] }}
                                  initial={{ width: 0 }} animate={{ width: `${v * 100}%` }}
                                  transition={{ delay: i * 0.04, duration: 0.7, ease: 'easeOut' }} />
                              </div>
                            </div>
                          ))}
                          {an.key_insights.length > 0 && (
                            <div className="border-l-2 border-amber-500/35 pl-3 mt-2">
                              {an.key_insights.slice(0, 3).map((ins, i) => (
                                <p key={i} className="text-xs text-zinc-400 leading-relaxed mb-1">{ins}</p>
                              ))}
                            </div>
                          )}
                          {an.dissent_rate > 0.55 && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/[0.08] border border-amber-500/25 rounded-lg text-[11px] text-amber-400 font-mono">
                              ⚠ 高分歧 — 共识未形成
                            </div>
                          )}
                          {an.persona_breakdown.length > 0 && <PersonaSnippet breakdown={an.persona_breakdown} optionMap={optMap} />}
                        </div>
                      )}
                    </div>
                  </motion.article>
                </AnimatePresence>
              )}
            </div>
          )
        })()}

        {/* Full LLM report — newspaper layout */}
        {globalReport && liveStatus === 'completed' && (
          <div className="mx-6 mb-10 border border-amber-500/15 rounded-xl overflow-hidden">
            {/* masthead stripe */}
            <div className="px-5 py-3 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-500/20 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px w-6 bg-amber-500/40" />
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <div className="flex-1 h-px w-6 bg-amber-500/40" />
              </div>
              <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-amber-400/90 font-semibold">Special Report · DelphiGraph Intelligence</span>
            </div>
            <div className="px-6 py-5">
              <ReportView text={globalReport} />
            </div>
            {/* footer rule */}
            <div className="px-6 pb-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-amber-500/10" />
              <span className="text-[10px] font-mono text-zinc-700 tracking-widest uppercase">End of Report · DelphiGraph Survey Oracle</span>
              <div className="flex-1 h-px bg-amber-500/10" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────
export default function SurveyDetailClient({ survey, questions, analyses: initialAnalyses, responses: initialResponses }: Props) {
  // ── Layout ──────────────────────────────────────────────────────────
  const [leftRatio, setLeftRatio] = useState(44)
  const [focus, setFocus]         = useState<'none' | 'left' | 'right'>('none')
  const [drag, setDrag]           = useState(false)

  // ── Live data ────────────────────────────────────────────────────────
  const [activeQ, setActiveQ]       = useState(questions[0]?.id || '')
  const [running, setRunning]       = useState(false)
  const [runError, setRunError]     = useState('')
  const [liveStatus, setLiveStatus] = useState(survey.status)
  const [liveAnalyses, setLiveAnalyses] = useState(initialAnalyses)
  const [liveResponsesData, setLiveResponsesData] = useState<SurveyResponse[]>(initialResponses)
  const [liveResponses, setLiveResponses] = useState(survey.response_count)
  const liveStatusRef = useRef(survey.status)
  useEffect(() => { liveStatusRef.current = liveStatus }, [liveStatus])

  // ── Simulation state ─────────────────────────────────────────────────
  const [sim, setSim] = useState<SimState>({
    phase: 'idle', batchDone: 0, totalBatches: TOTAL_BATCHES,
    uploadedCount: 0, totalTarget: TOTAL_BATCHES * 10, agents: [], log: [],
  })
  const [showSim, setShowSim]   = useState(false)
  const simAbortRef             = useRef(false)
  const pollTimerRef            = useRef<ReturnType<typeof setInterval> | null>(null)

  const st = STATUS_MAP[liveStatus] ?? STATUS_MAP.draft

  // ── Normal run (auth-required) ───────────────────────────────────────
  const handleRun = async () => {
    setRunning(true); setRunError(''); setLiveStatus('running')
    try {
      const res  = await fetch(`/api/surveys/${survey.id}/run`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setRunError(data.error || '运行失败'); setLiveStatus('draft') }
      else         { setLiveStatus('completed'); window.location.reload() }
    } catch (e) { setRunError(String(e)); setLiveStatus('draft') }
    finally     { setRunning(false) }
  }

  // ── Draggable divider ────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); setDrag(true)
    const sx = e.clientX; const sr = leftRatio
    const mv = (ev: MouseEvent) => setLeftRatio(Math.min(75, Math.max(28, sr + (ev.clientX - sx) / window.innerWidth * 100)))
    const up = () => { setDrag(false); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
  }, [leftRatio])

  // ── Sim helpers ──────────────────────────────────────────────────────
  const addLog = useCallback((msg: string) => {
    setSim(prev => ({ ...prev, log: [...prev.log.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`] }))
  }, [])

  const stopPoll = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
  }, [])

  // ── Poll survey_analyses for new results ─────────────────────────────
  const startPolling = useCallback(() => {
    stopPoll()
    pollTimerRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/surveys/${survey.id}`)
        if (!res.ok) return
        const data = await res.json()
        const fetchedAnalyses: SurveyAnalysis[] = data.analyses || []
        const fetchedStatus: string             = data.survey?.status || liveStatusRef.current

        if (fetchedAnalyses.length > 0) {
          setLiveAnalyses(fetchedAnalyses)
          setLiveResponses(data.survey?.response_count || 0)
          if (data.responses?.length) setLiveResponsesData(data.responses)
        }
        if (fetchedStatus !== liveStatusRef.current) setLiveStatus(fetchedStatus)

        if (fetchedStatus === 'completed') {
          addLog('🎉 调查已完成！分析结果已更新。')
          setSim(prev => ({ ...prev, phase: 'complete' }))
          stopPoll()
        }
      } catch (err) { console.error('[survey poll]', err) }
    }, POLL_INTERVAL_MS)
  }, [survey.id, addLog, stopPoll])

  useEffect(() => () => stopPoll(), [stopPoll])

  // ── Upload one batch ─────────────────────────────────────────────────
  const uploadBatch = useCallback(async (
    batchIdx: number,
    agents: { id: string; username: string }[],
  ): Promise<{ inserted: number; total_responses: number } | null> => {
    try {
      const res  = await fetch('/api/test/survey-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survey_id: survey.id, batch_index: batchIdx, agents, questions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      return { inserted: data.inserted, total_responses: data.total_responses }
    } catch (err) {
      addLog(`❌ 批次 ${batchIdx + 1} 上传失败: ${err}`)
      return null
    }
  }, [survey.id, questions, addLog])

  // ── Main simulation flow ─────────────────────────────────────────────
  const startSimulation = useCallback(async () => {
    simAbortRef.current = false
    setShowSim(true)
    setSim({ phase: 'preparing', batchDone: 0, totalBatches: TOTAL_BATCHES,
      uploadedCount: 0, totalTarget: TOTAL_BATCHES * 10, agents: [], log: [] })
    addLog('🚀 启动调查模拟测试流程...')
    addLog(`📋 目标: ${TOTAL_BATCHES * 10} 条回答（${TOTAL_BATCHES}批 × 10 Agent），间隔 ${BATCH_INTERVAL_MS / 1000}s`)

    // Step 1: Prepare agents
    addLog('🧹 清除历史数据，复用 SimAgent 档案...')
    let agents: { id: string; username: string }[] = []
    try {
      const res  = await fetch('/api/test/survey-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survey_id: survey.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Prepare failed')
      agents = data.agents || []
      addLog(`✅ 历史数据已清除，${agents.length} 个 SimAgent 就绪（${data.reused ? '复用' : '新建'}）`)
      addLog(`   Agent 示例: ${agents.slice(0, 3).map((a: { id: string; username: string }) => a.username).join(', ')}...`)
      setLiveStatus('draft')
      setLiveAnalyses([])
      setLiveResponsesData([])
      setSim(prev => ({ ...prev, agents, phase: 'uploading' }))
    } catch (err) {
      addLog(`❌ Agent 准备失败: ${err}`)
      setSim(prev => ({ ...prev, phase: 'error', error: String(err) }))
      return
    }

    // Step 2: Start polling for results
    startPolling()

    // Step 3: Upload batches
    let totalUploaded = 0
    for (let bi = 0; bi < TOTAL_BATCHES; bi++) {
      if (simAbortRef.current) { addLog('⏹ 已中止'); break }
      addLog(`📤 上传批次 ${bi + 1}/${TOTAL_BATCHES}（Agent ${bi * 10 + 1}–${bi * 10 + 10}）...`)
      const result = await uploadBatch(bi, agents)
      if (result) {
        totalUploaded += result.inserted
        setLiveResponses(result.total_responses)
        setSim(prev => ({ ...prev, batchDone: bi + 1, uploadedCount: totalUploaded }))
        addLog(`   ✓ 插入 ${result.inserted} 条，累计 ${result.total_responses} 条`)
      } else {
        addLog(`   ⚠️ 批次 ${bi + 1} 失败，跳过`)
      }
      if (bi < TOTAL_BATCHES - 1 && !simAbortRef.current)
        await new Promise(r => setTimeout(r, BATCH_INTERVAL_MS))
    }

    // Step 4: Trigger analysis
    if (!simAbortRef.current) {
      addLog(`🏁 上传完成！共 ${totalUploaded} 条回答`)
      addLog('🔬 触发调查分析引擎...')
      setSim(prev => ({ ...prev, phase: 'analyzing' }))
      setLiveStatus('running')
      try {
        const res  = await fetch('/api/test/survey-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ survey_id: survey.id }),
        })
        const data = await res.json()
        if (!res.ok) {
          addLog(`❌ 引擎返回错误: ${data.error}`)
          if (res.status === 503) addLog('   ⚠️ Python 后端未启动，请检查 survey_engine 服务')
          setSim(prev => ({ ...prev, phase: 'error', error: data.error }))
          return
        }
        addLog('⚙️ 分析引擎已接受任务，轮询结果中...')
        setSim(prev => ({ ...prev, phase: 'polling' }))
      } catch (err) {
        addLog(`❌ 引擎请求失败: ${err}`)
        setSim(prev => ({ ...prev, phase: 'error', error: String(err) }))
      }
    }
  }, [survey.id, addLog, uploadBatch, startPolling])

  const stopSimulation = useCallback(() => {
    simAbortRef.current = true
    stopPoll()
    setSim(prev => ({ ...prev, phase: 'idle' }))
  }, [stopPoll])

  // ── Phase icon map ───────────────────────────────────────────────────
  const simPhaseIcon: Record<SimPhase, React.ReactNode> = {
    idle:      null,
    preparing: <Loader2 className="w-3 h-3 animate-spin" />,
    uploading: <Upload className="w-3 h-3 animate-pulse" />,
    analyzing: <Brain className="w-3 h-3 animate-pulse" />,
    polling:   <RefreshCw className="w-3 h-3 animate-spin" />,
    complete:  <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    error:     <AlertCircle className="w-3 h-3 text-rose-400" />,
  }
  const simPhaseLabel: Partial<Record<SimPhase, string>> = {
    preparing: '准备中',
    uploading: `批次 ${sim.batchDone}/${sim.totalBatches}`,
    analyzing: '分析中',
    polling:   '轮询中',
    complete:  '完成',
    error:     '错误',
  }

  const eff = focus === 'left' ? 100 : focus === 'right' ? 0 : leftRatio

  return (
    <div className="flex flex-col h-[calc(100vh-68px)] bg-[#060a14] overflow-hidden">

      {/* ── Simulation Panel (floating) ─────────────────────────────── */}
      <AnimatePresence>
        {showSim && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-[60px] right-4 z-50 w-96 max-h-[72vh] flex flex-col bg-[#0d1225]/95 border border-cyan-500/20 rounded-xl shadow-2xl shadow-cyan-500/10 backdrop-blur-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-cyan-500/5">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-cyan-300">调查模拟测试</span>
                {sim.phase !== 'idle' && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                    {simPhaseIcon[sim.phase]}
                    {simPhaseLabel[sim.phase] ?? ''}
                  </span>
                )}
              </div>
              <button onClick={() => setShowSim(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            {sim.phase !== 'idle' && (
              <div className="px-4 py-2 border-b border-white/[0.04]">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1.5">
                  <span>回答上传进度</span>
                  <span className="text-cyan-400">{sim.uploadedCount} / {sim.totalTarget} 条</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full"
                    animate={{ width: `${(sim.batchDone / sim.totalBatches) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 mt-1">
                  <span>批次 {sim.batchDone}/{sim.totalBatches}</span>
                  <span className="text-zinc-500">{questions.length} 题 × {sim.agents.length || '?'} Agent</span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="px-4 py-2.5 flex gap-2 border-b border-white/[0.04]">
              {sim.phase === 'idle' || sim.phase === 'complete' || sim.phase === 'error' ? (
                <button onClick={startSimulation}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 transition-all">
                  <Play className="w-3.5 h-3.5" />
                  {sim.phase === 'complete' ? '重新模拟' : '开始模拟'}
                </button>
              ) : (
                <button onClick={stopSimulation}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition-all">
                  <X className="w-3.5 h-3.5" />
                  中止模拟
                </button>
              )}
            </div>

            {/* Log */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              {sim.log.length === 0 ? (
                <p className="text-[11px] text-zinc-600 italic font-mono">点击「开始模拟」启动 AI 智能体调查流程</p>
              ) : (
                [...sim.log].reverse().map((line, i) => (
                  <p key={i} className="text-[10px] font-mono text-zinc-400 leading-relaxed">{line}</p>
                ))
              )}
            </div>

            {sim.phase === 'error' && sim.error && (
              <div className="px-4 py-2 border-t border-rose-500/20 bg-rose-500/5">
                <p className="text-[10px] text-rose-400 font-mono">{sim.error}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] shrink-0">
        <Link href="/market-search" className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-px h-4 bg-white/10" />
        <span className={`flex items-center gap-1.5 text-xs ${st.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
        </span>
        <span className="text-xs text-zinc-600 bg-zinc-800/60 px-2 py-0.5 rounded font-mono">{TYPE_LABELS[survey.survey_type] || survey.survey_type}</span>
        <h1 className="flex-1 text-sm font-bold text-white truncate font-serif">{survey.title}</h1>
        {liveResponses > 0 && (
          <span className="text-[11px] font-mono text-zinc-500 shrink-0">
            <span className="text-violet-400">{liveResponses}</span> 回答
          </span>
        )}
        {/* Sim button */}
        <div className="w-px h-4 bg-white/10 shrink-0" />
        <button onClick={() => setShowSim(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all border shrink-0 ${
            showSim
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              : 'bg-white/5 text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 border-white/10 hover:border-cyan-500/30'
          }`} title="调查模拟测试面板">
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">模拟测试</span>
          {sim.phase !== 'idle' && sim.phase !== 'complete' && sim.phase !== 'error' && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          )}
        </button>
        <button onClick={() => setFocus(f => f === 'left' ? 'none' : 'left')} title="最大化左侧"
          className="p-1.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors">
          {focus === 'left' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => setFocus(f => f === 'right' ? 'none' : 'right')} title="最大化右侧"
          className="p-1.5 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors">
          {focus === 'right' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Panels */}
      <div className="flex flex-1 overflow-hidden">
        {eff > 0 && (
          <div className="h-full overflow-hidden" style={{ width: `${eff}%` }}>
            <LeftPanel
              survey={survey} questions={questions} analyses={liveAnalyses}
              responses={liveResponsesData}
              activeQ={activeQ} onSelectQ={setActiveQ} liveStatus={liveStatus}
              onRun={handleRun} running={running} runError={runError}
            /></div>
        )}
        {eff > 0 && eff < 100 && (
          <div
            className={`relative z-10 w-1 cursor-col-resize flex-shrink-0 flex items-center justify-center ${drag ? 'bg-violet-500/30' : 'bg-white/[0.04] hover:bg-violet-500/20'} transition-colors`}
            onMouseDown={handleMouseDown}
          >
            <GripVertical className="w-3 h-3 text-zinc-600" />
          </div>
        )}
        {eff < 100 && (
          <div className="h-full flex-1 overflow-hidden">
            <RightPanel survey={survey} questions={questions} analyses={liveAnalyses}
              activeQ={activeQ} onSelectQ={setActiveQ} liveStatus={liveStatus} />
          </div>
        )}
      </div>
    </div>
  )
}
