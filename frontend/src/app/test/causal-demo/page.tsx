'use client'

import SearchDetailView from '@/components/causal-graph/search-detail-view'
import { generateLargeMockGraph } from '@/components/causal-graph/mock-graph-data'

// ══════════════════════════════════════════════════════════════════════════════
// 因果图谱 + 未来报纸 完整 Mock 数据演示页（120+ agents）
// 访问路径: /test/causal-demo
// 动画控制已内置于 SearchDetailView 的图谱面板标题栏
// ══════════════════════════════════════════════════════════════════════════════

const FULL_GRAPH = generateLargeMockGraph(120)

// ── 结论数据 ─────────────────────────────────────────────────────────────────
const mockConclusion = {
  direction: 'bullish',
  confidence: 0.72,
  confidence_interval: { low: 0.58, mid: 0.72, high: 0.84 },
  one_line_conclusion: '因果推演显示美联储在2026年Q3降息的概率约为72%，核心驱动力来自通胀回落和劳动力市场降温的双重确认。',
  key_drivers: [
    '通胀数据持续回落至2.3%附近，接近2%目标（10条硬核事实支撑）',
    '联储官员讲话基调明确转鸽，暗示"很快适合调整利率"（8条信号）',
    '就业市场降温：非农连续3个月低于预期（7条信号）',
    'AI驱动的效率革命产生结构性通缩压力（6条画像推演信号）',
    'GDP增速放缓至1.8%，低于潜在增长率（5条信号）',
  ],
  risk_factors: [
    '地缘政治风险可能推高能源价格，逆转通胀回落趋势',
    '逆全球化趋势带来的结构性通胀压力（少数派信号）',
    '联储可能因金融稳定担忧而推迟降息时间',
    '中东局势升级引发供应链中断的尾部风险',
  ],
  minority_warning: '少数派信号提示：逆全球化趋势可能导致结构性通胀回升，3位持"鹰派"画像的Agent认为降息时间可能推迟至Q4。该信号虽占比15%，但其因果路径逻辑完整，值得关注。',
  minority_assessment: '少数派群体（15%）的核心论点围绕逆全球化带来的供应链成本上升，虽与主流观点相左，但其因果推理链条完整，特别是在地缘风险持续升温的背景下，该观点具有预警价值。',
  conflicts: '主要冲突：多数派认为AI效率提升将持续压低通胀，而少数派认为逆全球化成本将抵消AI通缩效应。两条因果路径在通胀节点发生碰撞，最终影响降息概率判断。',
  persona_insight: '画像维度分析：持"鸽派"画像的Agent（占62%）普遍更关注劳动力市场和GDP数据，而"鹰派"Agent（占23%）更关注地缘风险和供应链因素。"中性"Agent（占15%）则聚焦于联储沟通策略的微妙变化。画像分布与历史降息前的Agent行为模式高度吻合（相似度0.85）。',
}

// ── 未来报纸内容 ──────────────────────────────────────────────────────────────
const mockNewspaperContent = `# 多重因果链交汇指向降息窗口：美联储Q3政策转向概率达72%

**德尔菲未来通讯社 特别报道**

在经历了长达两年的紧缩周期后，多条独立因果链正在交汇于一个关键节点——美联储2026年第三季度的利率决策。德尔菲因果逻辑图谱的最新分析显示，降息概率已攀升至72%，置信区间为58%-84%。

## 三条核心因果链

**第一条主链：通胀→降息。** 这是最强的因果驱动力。最新数据显示，CPI同比增速已降至2.3%，核心PCE更是触及2.1%的近三年低点。10条硬核事实数据为这一因果链提供了坚实支撑，影响力评分高达0.87。值得注意的是，AI驱动的产业效率革命正在产生额外的通缩压力——6条画像推演信号显示，人工智能在服务业的渗透率突破35%后，服务业通胀出现了罕见的自发性回落。

**第二条主链：就业→GDP→联储政策→降息。** 这是一条更为曲折但同样有力的因果路径。非农就业人数连续三个月低于预期，初次失业金申请攀升至24万的年内高点。这一信号通过两个中间节点——GDP增速放缓至1.8%和消费者信心指数创阶段新低——最终传导至联储决策层。7位联储官员在最近的公开讲话中使用了"很快适合调整"这一措辞，较此前的"保持耐心"出现了明显的鸽派转向。

**第三条链：地缘→能源→通胀（反向抑制）。** 并非所有因果链都指向降息。中东局势的持续紧张正通过能源价格渠道对通胀回落构成阻力。原油价格近期波动率飙升至年内最高水平，如果这一趋势持续，可能部分抵消通胀回落的成果。

## 少数派警告：不容忽视的逆风

在47条分析信号中，约15%来自持"鹰派"画像的Agent。他们提出了一个值得深思的反面论证：逆全球化正在加速各国供应链本土化，这种结构性变化带来的成本上升可能导致通胀在达到2%目标前就出现粘性回升。

尽管这一观点属于少数派，但德尔菲因果图谱的分析显示，其推理链条——地缘风险→逆全球化加速→结构性通胀回升——逻辑完整且得到了充足证据支撑。特别值得关注的是，这一因果路径与AI通缩效应在"通胀"这一关键节点形成了正面碰撞，其博弈结果将直接决定降息时间表。

## 前瞻

综合12个因果因子、13条因果关系边和47条Agent信号，德尔菲因果引擎得出的结论是：美联储在2026年Q3降息的概率为72%。但置信区间的下限（58%）提醒我们，地缘风险和逆全球化因素仍有可能在边际上改变这一判断。

**编者注：** 本报道基于德尔菲因果逻辑图谱引擎的自动推演，非传统预测模型。文中所有因果关系均来自47位Agent的独立信号汇聚与因果结构发现，不代表任何投资建议。`

// ── 预处理摘要 ───────────────────────────────────────────────────────────────
const mockPreprocessSummary = {
  total_signals: 47,
  hard_fact_count: 28,
  persona_count: 19,
  cluster_count: 5,
  minority_clusters: 1,
  persona_summary: {
    coverage_rate: 0.78,
    dimensions: {
      risk_appetite: { conservative: 11, moderate: 7, aggressive: 1 },
      policy_stance: { dovish: 12, neutral: 3, hawkish: 4 },
      time_horizon: { short_term: 5, medium_term: 10, long_term: 4 },
      expertise: { macro_economics: 8, fixed_income: 5, geopolitics: 3, technology: 3 },
    },
  },
}

// ── 组装完整 Analysis ────────────────────────────────────────────────────────
const mockAnalysis = {
  id: 'analysis_demo_001',
  status: 'completed',
  signal_count: 47,
  hard_fact_count: 28,
  persona_count: 19,
  graph_data: FULL_GRAPH,
  conclusion: mockConclusion,
  newspaper_content: mockNewspaperContent,
  is_final: true,
  version: 3,
  preprocess_summary: mockPreprocessSummary,
  created_at: '2026-03-22T06:30:00Z',
}

// ── Task ────────────────────────────────────────────────────────────────────
const mockTask = {
  id: 'market_demo_001',
  title: '美联储2026年Q3降息预测',
  question: '美联储将在2026年第三季度（7-9月）宣布降息吗？',
  description: '预测美联储是否会在2026年第三季度的FOMC会议上宣布至少25个基点的降息。考虑因素包括通胀走势、就业数据、GDP增长、全球地缘政治风险等。',
  status: 'active',
  closes_at: new Date(Date.now() + 45 * 86400000).toISOString(),
  reward_pool: 50000,
  created_at: '2026-02-01T00:00:00Z',
}

// ── 页面 ─────────────────────────────────────────────────────────────────────
export default function CausalDemoPage() {
  return (
    <SearchDetailView
      task={mockTask}
      analysis={mockAnalysis}
      submissionCount={47}
    />
  )
}
