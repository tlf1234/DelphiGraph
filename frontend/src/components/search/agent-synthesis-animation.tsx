'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion } from 'framer-motion'
import { Network, Zap } from 'lucide-react'

type Phase = 'gathering' | 'connecting' | 'synthesizing' | 'complete'

const PHASES: Phase[] = ['gathering', 'connecting', 'synthesizing', 'complete']

interface AgentNode extends d3.SimulationNodeDatum {
  id: string
  isCenter: boolean
}

interface AgentLink extends d3.SimulationLinkDatum<AgentNode> {
  source: string | AgentNode
  target: string | AgentNode
}

const PHASE_LABELS: Record<Phase, string> = {
  gathering:    '正在召集智能体...',
  connecting:   '智能体正在连接...',
  synthesizing: '正在汇聚集体智慧...',
  complete:     '未来洞察生成完成！',
}

const STATS: Record<Phase, { agents: number; predictions: number; consensus: number }> = {
  gathering:    { agents: 0,  predictions: 0,   consensus: 0   },
  connecting:   { agents: 8,  predictions: 28,  consensus: 45  },
  synthesizing: { agents: 8,  predictions: 156, consensus: 73  },
  complete:     { agents: 8,  predictions: 247, consensus: 100 },
}

export function AgentSynthesisAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const [phase, setPhase] = useState<Phase>('gathering')

  // Phase progression
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('connecting'),   1200),
      setTimeout(() => setPhase('synthesizing'), 2800),
      setTimeout(() => setPhase('complete'),     4500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  // D3 graph — runs once on mount
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const W  = containerRef.current.clientWidth || 640
    const H  = 260
    const CX = W / 2
    const CY = H / 2
    const AGENT_COUNT = 8

    const svg = d3.select(svgRef.current).attr('width', W).attr('height', H)
    svg.selectAll('*').remove()

    // ── defs ─────────────────────────────────────────────────────────
    const defs = svg.append('defs')

    const mkGlow = (id: string, blur: number) => {
      const f = defs.append('filter').attr('id', id)
        .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%')
      f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', blur).attr('result', 'b')
      const m = f.append('feMerge')
      m.append('feMergeNode').attr('in', 'b')
      m.append('feMergeNode').attr('in', 'SourceGraphic')
    }
    mkGlow('glow-sm', 3)
    mkGlow('glow-lg', 8)

    // ── nodes ─────────────────────────────────────────────────────────
    const nodes: AgentNode[] = [
      { id: 'center', isCenter: true, fx: CX, fy: CY },
      ...Array.from({ length: AGENT_COUNT }, (_, i) => {
        const angle = (i * Math.PI * 2 / AGENT_COUNT) - Math.PI / 2
        const r = 95 + (Math.random() - 0.5) * 12
        return {
          id: `a${i}`,
          isCenter: false,
          x: CX + r * Math.cos(angle) + (Math.random() - 0.5) * 14,
          y: CY + r * Math.sin(angle) + (Math.random() - 0.5) * 14,
        }
      }),
    ]

    const agentNodes = nodes.filter(n => !n.isCenter)
    const links: AgentLink[] = agentNodes.map(n => ({ source: n.id, target: 'center' }))

    // ── simulation ────────────────────────────────────────────────────
    const sim = d3.forceSimulation<AgentNode>(nodes)
      .force('link', d3.forceLink<AgentNode, AgentLink>(links)
        .id(d => d.id).distance(100).strength(0.45))
      .force('charge',  d3.forceManyBody<AgentNode>().strength(-70))
      .force('collide', d3.forceCollide<AgentNode>(22))
      .force('radial',  d3.forceRadial<AgentNode>(100, CX, CY)
        .strength(d => d.isCenter ? 0 : 0.55))
      .alphaDecay(0.012)
      .velocityDecay(0.38)

    // ── layers ────────────────────────────────────────────────────────
    const gLinks     = svg.append('g')
    const gParticles = svg.append('g')
    const gAgents    = svg.append('g')
    const gCenter    = svg.append('g')

    // ── link lines (quadratic bezier curves) ─────────────────────────
    const linkLines = gLinks.selectAll<SVGPathElement, AgentLink>('path')
      .data(links).join('path')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(16,185,129,0)')
      .attr('stroke-width', 1.3)
      .attr('stroke-dasharray', '5 4')

    // ── agent nodes ───────────────────────────────────────────────────
    const agentGs = gAgents.selectAll<SVGGElement, AgentNode>('g')
      .data(agentNodes).join('g')
      .attr('opacity', 0)

    agentGs.append('circle').attr('r', 19)
      .attr('fill', '#10b981').attr('opacity', 0.1)
      .attr('filter', 'url(#glow-sm)')

    agentGs.append('circle').attr('r', 13).attr('class', 'agent-body')
      .attr('fill', '#0b1525').attr('stroke', '#34d399').attr('stroke-width', 1.8)

    agentGs.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('font-size', '12').attr('pointer-events', 'none')
      .text('🧠')

    // ── center node ───────────────────────────────────────────────────
    const pulseRing = gCenter.append('circle')
      .attr('cx', CX).attr('cy', CY).attr('r', 20)
      .attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 1.5)
      .attr('opacity', 0)

    const centerCircle = gCenter.append('circle')
      .attr('cx', CX).attr('cy', CY).attr('r', 18)
      .attr('fill', '#0b1525').attr('stroke', '#10b981').attr('stroke-width', 2)
      .attr('opacity', 0).attr('filter', 'url(#glow-lg)')

    const centerIcon = gCenter.append('text')
      .attr('x', CX).attr('y', CY)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('font-size', '15').attr('opacity', 0)
      .text('✦')

    // ── tick ──────────────────────────────────────────────────────────
    const CURVE_OFFSET = 28

    sim.on('tick', () => {
      linkLines.attr('d', d => {
        const sx = (d.source as AgentNode).x!
        const sy = (d.source as AgentNode).y!
        const tx = (d.target as AgentNode).x!
        const ty = (d.target as AgentNode).y!
        const mx = (sx + tx) / 2
        const my = (sy + ty) / 2
        const dx = tx - sx
        const dy = ty - sy
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        const cpx = mx + (-dy / len) * CURVE_OFFSET
        const cpy = my + ( dx / len) * CURVE_OFFSET
        return `M${sx},${sy} Q${cpx},${cpy} ${tx},${ty}`
      })
      agentGs.attr('transform', d => `translate(${d.x!},${d.y!})`)
    })

    // ── phase: gathering — reveal agents ──────────────────────────────
    agentGs.each(function(_, i) {
      d3.select(this).transition().delay(i * 130).duration(400).attr('opacity', 1)
    })

    // ── phase: connecting — show links ────────────────────────────────
    const t1 = setTimeout(() => {
      linkLines.each(function(_, i) {
        d3.select(this).transition().delay(i * 80).duration(500)
          .attr('stroke', 'rgba(16,185,129,0.45)')
      })
    }, 1200)

    // ── phase: synthesizing — center + particles ──────────────────────
    let particleInterval: ReturnType<typeof setInterval>

    const t2 = setTimeout(() => {
      centerCircle.transition().duration(600).attr('opacity', 1)
      centerIcon.transition().duration(600).attr('opacity', 1)
      linkLines.transition().duration(400)
        .attr('stroke', 'rgba(16,185,129,0.65)')
        .attr('stroke-width', 1.6)

      // Pulsing ring
      ;(function pulse() {
        pulseRing.attr('r', 20).attr('opacity', 0.85)
          .transition().duration(1100).ease(d3.easeCubicOut)
          .attr('r', 36).attr('opacity', 0)
          .on('end', pulse)
      })()

      // Data particles travel along each link
      particleInterval = setInterval(() => {
        const lk = links[Math.floor(Math.random() * links.length)]
        const src = lk.source as AgentNode
        const tgt = lk.target as AgentNode
        if (src.x == null || tgt.x == null) return

        const sx = src.x!, sy = src.y!, tx = tgt.x!, ty = tgt.y!

        const p = gParticles.append('circle')
          .attr('r', 2.2).attr('fill', '#34d399').attr('opacity', 0.9)
          .attr('cx', sx).attr('cy', sy)

        p.transition()
          .duration(600 + Math.random() * 350).ease(d3.easeLinear)
          .attr('cx', tx).attr('cy', ty).attr('opacity', 0)
          .on('end', () => p.remove())
      }, 95)
    }, 2800)

    // ── phase: complete — final color shift ───────────────────────────
    const t3 = setTimeout(() => {
      centerCircle.transition().duration(400).attr('stroke', '#6ee7b7').attr('stroke-width', 2.5)
      linkLines.transition().duration(400)
        .attr('stroke', 'rgba(99,102,241,0.75)')
        .attr('stroke-dasharray', '0')
        .attr('stroke-width', 1.7)
      agentGs.selectAll<SVGCircleElement, AgentNode>('circle.agent-body')
        .transition().duration(400).attr('stroke', '#818cf8')
    }, 4500)

    return () => {
      sim.stop()
      clearInterval(particleInterval)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  const stats = STATS[phase]

  return (
    <div className="w-full max-w-4xl mx-auto my-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative bg-gradient-to-br from-zinc-900 to-zinc-800 border-2 border-emerald-500/30 rounded-lg p-6 overflow-hidden"
      >
        {/* Background grid */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(16,185,129,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.2) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        {/* Header */}
        <div className="text-center mb-3 relative z-10">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Network className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="text-base font-bold text-emerald-400 font-mono tracking-widest">
              AI AGENTS SYNTHESIZING
            </h3>
            <Network className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <p className="text-xs text-zinc-400 font-mono">{PHASE_LABELS[phase]}</p>
        </div>

        {/* D3 canvas */}
        <div ref={containerRef} className="w-full">
          <svg ref={svgRef} className="w-full block" />
        </div>

        {/* Phase dots */}
        <div className="flex justify-center gap-2 mt-1 mb-2 relative z-10">
          {PHASES.map((p, i) => (
            <div
              key={p}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                PHASES.indexOf(phase) >= i ? 'bg-emerald-400 scale-125' : 'bg-zinc-600'
              }`}
            />
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full h-0.5 bg-zinc-800 rounded-full overflow-hidden mb-4 relative z-10">
          <motion.div
            animate={{ width: { gathering: '25%', connecting: '50%', synthesizing: '75%', complete: '100%' }[phase] }}
            transition={{ duration: 0.5 }}
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center relative z-10">
          <div>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.agents}</div>
            <div className="text-xs text-zinc-500 font-mono">Agents Active</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400 font-mono">{stats.predictions}</div>
            <div className="text-xs text-zinc-500 font-mono">Predictions</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400 font-mono">{stats.consensus}%</div>
            <div className="text-xs text-zinc-500 font-mono">Consensus</div>
          </div>
        </div>

        {/* Complete badge */}
        {phase === 'complete' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex justify-center relative z-10"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/50 rounded-full">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400 font-mono">
                Collective Intelligence Ready
              </span>
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
