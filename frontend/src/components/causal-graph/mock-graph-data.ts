/**
 * 完整因果图谱 Mock 数据
 * 4层架构: Agent(hexagon) → Signal(dot) → CausalFactor(circle) → Target(diamond)
 */

// ── 节点类型 ────────────────────────────────────────────────────────────────
export type NodeType = 'agent' | 'signal' | 'factor' | 'target'
export type EdgeType = 'agent_signal' | 'signal_factor' | 'factor_factor' | 'factor_target'

export interface GraphNode {
  id: string
  name: string
  node_type: NodeType
  // Agent
  persona?: { stance?: string; expertise?: string; risk_appetite?: string; time_horizon?: string }
  avatar_label?: string
  // Signal
  evidence_type?: string  // hard_fact | persona_inference
  source_description?: string
  relevance_score?: number
  // Factor
  category?: string
  factor_type?: string
  impact_score?: number
  confidence?: number
  evidence_direction?: string
  is_minority_driven?: boolean
  hard_fact_count?: number
  persona_count?: number
  total_evidence_count?: number
  // Target
  is_target?: boolean
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  edge_type: EdgeType
  relation_type?: string
  weight?: number
  direction?: string
  strength?: string
  evidence_count?: number
  reasoning?: string
}

export interface EnrichedGraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── Agent 节点 ──────────────────────────────────────────────────────────────
const agents: GraphNode[] = [
  { id: 'ag_1', name: 'MacroHawk-7B', node_type: 'agent', avatar_label: 'A1', persona: { stance: 'hawkish', expertise: 'macro_economics', risk_appetite: 'conservative', time_horizon: 'medium_term' } },
  { id: 'ag_2', name: 'BondSage-13B', node_type: 'agent', avatar_label: 'A2', persona: { stance: 'dovish', expertise: 'fixed_income', risk_appetite: 'moderate', time_horizon: 'long_term' } },
  { id: 'ag_3', name: 'GeoRisk-AI', node_type: 'agent', avatar_label: 'A3', persona: { stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative', time_horizon: 'short_term' } },
  { id: 'ag_4', name: 'TechAlpha-v2', node_type: 'agent', avatar_label: 'A4', persona: { stance: 'dovish', expertise: 'technology', risk_appetite: 'aggressive', time_horizon: 'long_term' } },
  { id: 'ag_5', name: 'QuantFlow-LLM', node_type: 'agent', avatar_label: 'A5', persona: { stance: 'neutral', expertise: 'macro_economics', risk_appetite: 'moderate', time_horizon: 'medium_term' } },
  { id: 'ag_6', name: 'SentimentPro', node_type: 'agent', avatar_label: 'A6', persona: { stance: 'dovish', expertise: 'behavioral', risk_appetite: 'moderate', time_horizon: 'short_term' } },
  { id: 'ag_7', name: 'PolicyBot-3', node_type: 'agent', avatar_label: 'A7', persona: { stance: 'dovish', expertise: 'macro_economics', risk_appetite: 'conservative', time_horizon: 'medium_term' } },
  { id: 'ag_8', name: 'DeGlobal-AI', node_type: 'agent', avatar_label: 'A8', persona: { stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative', time_horizon: 'long_term' } },
]

// ── Signal 节点（Agent 提交的具体数据点） ────────────────────────────────────
const signals: GraphNode[] = [
  // A1 signals
  { id: 'sig_01', name: 'CPI同比2.3%', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'BLS官方数据', relevance_score: 0.95 },
  { id: 'sig_02', name: '核心PCE 2.1%', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'BEA发布', relevance_score: 0.92 },
  // A2 signals
  { id: 'sig_03', name: '国债收益率倒挂收窄', node_type: 'signal', evidence_type: 'hard_fact', source_description: '彭博终端', relevance_score: 0.85 },
  { id: 'sig_04', name: '联储鸽派措辞增加', node_type: 'signal', evidence_type: 'persona_inference', source_description: 'FOMC纪要分析', relevance_score: 0.88 },
  // A3 signals
  { id: 'sig_05', name: '中东冲突升级', node_type: 'signal', evidence_type: 'hard_fact', source_description: '路透社', relevance_score: 0.78 },
  { id: 'sig_06', name: '供应链风险指数上升', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'NY Fed GSCPI', relevance_score: 0.72 },
  // A4 signals
  { id: 'sig_07', name: 'AI渗透率超35%', node_type: 'signal', evidence_type: 'persona_inference', source_description: 'McKinsey报告', relevance_score: 0.70 },
  { id: 'sig_08', name: '服务业通胀自发回落', node_type: 'signal', evidence_type: 'persona_inference', source_description: '推演模型', relevance_score: 0.65 },
  // A5 signals
  { id: 'sig_09', name: '非农低于预期(连续3月)', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'BLS就业报告', relevance_score: 0.90 },
  { id: 'sig_10', name: 'GDP环比1.8%', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'BEA初值', relevance_score: 0.82 },
  // A6 signals
  { id: 'sig_11', name: '消费者信心指数新低', node_type: 'signal', evidence_type: 'hard_fact', source_description: '密歇根大学', relevance_score: 0.75 },
  { id: 'sig_12', name: 'FedWatch鸽派概率78%', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'CME FedWatch', relevance_score: 0.80 },
  // A7 signals
  { id: 'sig_13', name: '新屋开工下滑12%', node_type: 'signal', evidence_type: 'hard_fact', source_description: '商务部', relevance_score: 0.68 },
  { id: 'sig_14', name: '初次失业金24万', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'DOL周报', relevance_score: 0.85 },
  // A8 signals (minority)
  { id: 'sig_15', name: '逆全球化成本测算', node_type: 'signal', evidence_type: 'persona_inference', source_description: '推演模型', relevance_score: 0.60 },
  { id: 'sig_16', name: 'OPEC+减产延续', node_type: 'signal', evidence_type: 'hard_fact', source_description: 'OPEC公报', relevance_score: 0.70 },
]

// ── 因果因子节点（聚合后） ───────────────────────────────────────────────────
const factors: GraphNode[] = [
  { id: 'f_inflation', name: '通胀数据回落', node_type: 'factor', factor_type: 'economic', category: 'economic', impact_score: 0.87, confidence: 0.88, evidence_direction: 'bullish', hard_fact_count: 10, persona_count: 2, total_evidence_count: 12 },
  { id: 'f_fed', name: '联储政策信号', node_type: 'factor', factor_type: 'political', category: 'political', impact_score: 0.92, confidence: 0.85, evidence_direction: 'bullish', hard_fact_count: 8, persona_count: 3, total_evidence_count: 11 },
  { id: 'f_employ', name: '就业市场降温', node_type: 'factor', factor_type: 'economic', category: 'economic', impact_score: 0.78, confidence: 0.75, evidence_direction: 'bullish', hard_fact_count: 7, persona_count: 4, total_evidence_count: 11 },
  { id: 'f_gdp', name: 'GDP增速放缓', node_type: 'factor', factor_type: 'economic', category: 'economic', impact_score: 0.72, confidence: 0.70, evidence_direction: 'bullish', hard_fact_count: 5, persona_count: 3, total_evidence_count: 8 },
  { id: 'f_ai', name: 'AI效率革命', node_type: 'factor', factor_type: 'technological', category: 'technological', impact_score: 0.55, confidence: 0.62, evidence_direction: 'bullish', hard_fact_count: 3, persona_count: 6, total_evidence_count: 9 },
  { id: 'f_geo', name: '地缘政治风险', node_type: 'factor', factor_type: 'political', category: 'political', impact_score: 0.65, confidence: 0.58, evidence_direction: 'bearish', hard_fact_count: 4, persona_count: 5, total_evidence_count: 9 },
  { id: 'f_consumer', name: '消费者信心', node_type: 'factor', factor_type: 'social', category: 'social', impact_score: 0.50, confidence: 0.68, evidence_direction: 'bullish', hard_fact_count: 4, persona_count: 2, total_evidence_count: 6 },
  { id: 'f_housing', name: '房市冷却', node_type: 'factor', factor_type: 'economic', category: 'economic', impact_score: 0.48, confidence: 0.72, evidence_direction: 'bullish', hard_fact_count: 5, persona_count: 1, total_evidence_count: 6 },
  { id: 'f_energy', name: '能源价格波动', node_type: 'factor', factor_type: 'economic', category: 'economic', impact_score: 0.42, confidence: 0.55, evidence_direction: 'bearish', hard_fact_count: 3, persona_count: 2, total_evidence_count: 5 },
  { id: 'f_sentiment', name: '市场情绪转向', node_type: 'factor', factor_type: 'social', category: 'social', impact_score: 0.38, confidence: 0.65, evidence_direction: 'bullish', hard_fact_count: 2, persona_count: 5, total_evidence_count: 7 },
  { id: 'f_deglobal', name: '逆全球化加速', node_type: 'factor', factor_type: 'political', category: 'political', impact_score: 0.60, confidence: 0.45, evidence_direction: 'bearish', is_minority_driven: true, hard_fact_count: 1, persona_count: 3, total_evidence_count: 4 },
]

// ── 预测目标节点 ────────────────────────────────────────────────────────────
const target: GraphNode = {
  id: 'target_001', name: '美联储Q3降息', node_type: 'target', is_target: true,
  impact_score: 1.0, confidence: 0.72, evidence_direction: 'bullish',
}

// ── 边：Agent → Signal ──────────────────────────────────────────────────────
const agentSignalEdges: GraphEdge[] = [
  { id: 'e_as_01', source: 'ag_1', target: 'sig_01', edge_type: 'agent_signal', weight: 0.95 },
  { id: 'e_as_02', source: 'ag_1', target: 'sig_02', edge_type: 'agent_signal', weight: 0.92 },
  { id: 'e_as_03', source: 'ag_2', target: 'sig_03', edge_type: 'agent_signal', weight: 0.85 },
  { id: 'e_as_04', source: 'ag_2', target: 'sig_04', edge_type: 'agent_signal', weight: 0.88 },
  { id: 'e_as_05', source: 'ag_3', target: 'sig_05', edge_type: 'agent_signal', weight: 0.78 },
  { id: 'e_as_06', source: 'ag_3', target: 'sig_06', edge_type: 'agent_signal', weight: 0.72 },
  { id: 'e_as_07', source: 'ag_4', target: 'sig_07', edge_type: 'agent_signal', weight: 0.70 },
  { id: 'e_as_08', source: 'ag_4', target: 'sig_08', edge_type: 'agent_signal', weight: 0.65 },
  { id: 'e_as_09', source: 'ag_5', target: 'sig_09', edge_type: 'agent_signal', weight: 0.90 },
  { id: 'e_as_10', source: 'ag_5', target: 'sig_10', edge_type: 'agent_signal', weight: 0.82 },
  { id: 'e_as_11', source: 'ag_6', target: 'sig_11', edge_type: 'agent_signal', weight: 0.75 },
  { id: 'e_as_12', source: 'ag_6', target: 'sig_12', edge_type: 'agent_signal', weight: 0.80 },
  { id: 'e_as_13', source: 'ag_7', target: 'sig_13', edge_type: 'agent_signal', weight: 0.68 },
  { id: 'e_as_14', source: 'ag_7', target: 'sig_14', edge_type: 'agent_signal', weight: 0.85 },
  { id: 'e_as_15', source: 'ag_8', target: 'sig_15', edge_type: 'agent_signal', weight: 0.60 },
  { id: 'e_as_16', source: 'ag_8', target: 'sig_16', edge_type: 'agent_signal', weight: 0.70 },
]

// ── 边：Signal → Factor ─────────────────────────────────────────────────────
const signalFactorEdges: GraphEdge[] = [
  { id: 'e_sf_01', source: 'sig_01', target: 'f_inflation', edge_type: 'signal_factor', direction: 'positive', weight: 0.95 },
  { id: 'e_sf_02', source: 'sig_02', target: 'f_inflation', edge_type: 'signal_factor', direction: 'positive', weight: 0.92 },
  { id: 'e_sf_03', source: 'sig_03', target: 'f_fed', edge_type: 'signal_factor', direction: 'positive', weight: 0.80 },
  { id: 'e_sf_04', source: 'sig_04', target: 'f_fed', edge_type: 'signal_factor', direction: 'positive', weight: 0.88 },
  { id: 'e_sf_05', source: 'sig_05', target: 'f_geo', edge_type: 'signal_factor', direction: 'negative', weight: 0.78 },
  { id: 'e_sf_06', source: 'sig_06', target: 'f_geo', edge_type: 'signal_factor', direction: 'negative', weight: 0.72 },
  { id: 'e_sf_07', source: 'sig_07', target: 'f_ai', edge_type: 'signal_factor', direction: 'positive', weight: 0.70 },
  { id: 'e_sf_08', source: 'sig_08', target: 'f_ai', edge_type: 'signal_factor', direction: 'positive', weight: 0.65 },
  { id: 'e_sf_09', source: 'sig_09', target: 'f_employ', edge_type: 'signal_factor', direction: 'positive', weight: 0.90 },
  { id: 'e_sf_10', source: 'sig_10', target: 'f_gdp', edge_type: 'signal_factor', direction: 'positive', weight: 0.82 },
  { id: 'e_sf_11', source: 'sig_11', target: 'f_consumer', edge_type: 'signal_factor', direction: 'positive', weight: 0.75 },
  { id: 'e_sf_12', source: 'sig_12', target: 'f_sentiment', edge_type: 'signal_factor', direction: 'positive', weight: 0.80 },
  { id: 'e_sf_13', source: 'sig_13', target: 'f_housing', edge_type: 'signal_factor', direction: 'positive', weight: 0.68 },
  { id: 'e_sf_14', source: 'sig_14', target: 'f_employ', edge_type: 'signal_factor', direction: 'positive', weight: 0.85 },
  { id: 'e_sf_15', source: 'sig_15', target: 'f_deglobal', edge_type: 'signal_factor', direction: 'negative', weight: 0.60 },
  { id: 'e_sf_16', source: 'sig_16', target: 'f_energy', edge_type: 'signal_factor', direction: 'negative', weight: 0.70 },
]

// ── 边：Factor → Factor / Target ────────────────────────────────────────────
const causalEdges: GraphEdge[] = [
  { id: 'e_ff_01', source: 'f_inflation', target: 'target_001', edge_type: 'factor_target', relation_type: 'DRIVES', weight: 0.88, direction: 'positive', strength: 'strong', evidence_count: 10, reasoning: '通胀持续回落是降息的核心前提条件' },
  { id: 'e_ff_02', source: 'f_fed', target: 'target_001', edge_type: 'factor_target', relation_type: 'DRIVES', weight: 0.85, direction: 'positive', strength: 'strong', evidence_count: 8, reasoning: '联储官员讲话基调偏鸽' },
  { id: 'e_ff_03', source: 'f_employ', target: 'target_001', edge_type: 'factor_target', relation_type: 'DRIVES', weight: 0.72, direction: 'positive', strength: 'strong', evidence_count: 7 },
  { id: 'e_ff_04', source: 'f_gdp', target: 'f_fed', edge_type: 'factor_factor', relation_type: 'AMPLIFIES', weight: 0.68, direction: 'positive', strength: 'moderate', evidence_count: 5 },
  { id: 'e_ff_05', source: 'f_ai', target: 'f_inflation', edge_type: 'factor_factor', relation_type: 'AMPLIFIES', weight: 0.55, direction: 'positive', strength: 'moderate', evidence_count: 6 },
  { id: 'e_ff_06', source: 'f_geo', target: 'f_energy', edge_type: 'factor_factor', relation_type: 'TRIGGERS', weight: 0.62, direction: 'negative', strength: 'moderate', evidence_count: 5 },
  { id: 'e_ff_07', source: 'f_energy', target: 'f_inflation', edge_type: 'factor_factor', relation_type: 'INHIBITS', weight: 0.48, direction: 'negative', strength: 'moderate', evidence_count: 4 },
  { id: 'e_ff_08', source: 'f_consumer', target: 'f_gdp', edge_type: 'factor_factor', relation_type: 'AMPLIFIES', weight: 0.52, direction: 'positive', strength: 'moderate', evidence_count: 4 },
  { id: 'e_ff_09', source: 'f_housing', target: 'f_gdp', edge_type: 'factor_factor', relation_type: 'AMPLIFIES', weight: 0.45, direction: 'positive', strength: 'weak', evidence_count: 3 },
  { id: 'e_ff_10', source: 'f_sentiment', target: 'f_fed', edge_type: 'factor_factor', relation_type: 'CORRELATES_WITH', weight: 0.40, direction: 'positive', strength: 'weak', evidence_count: 4 },
  { id: 'e_ff_11', source: 'f_deglobal', target: 'f_inflation', edge_type: 'factor_factor', relation_type: 'INHIBITS', weight: 0.58, direction: 'negative', strength: 'moderate', evidence_count: 3 },
  { id: 'e_ff_12', source: 'f_geo', target: 'f_deglobal', edge_type: 'factor_factor', relation_type: 'AMPLIFIES', weight: 0.50, direction: 'positive', strength: 'moderate', evidence_count: 2 },
  { id: 'e_ff_13', source: 'f_employ', target: 'f_consumer', edge_type: 'factor_factor', relation_type: 'DRIVES', weight: 0.55, direction: 'positive', strength: 'moderate', evidence_count: 4 },
]

// ── 导出完整图谱数据 ────────────────────────────────────────────────────────
export const MOCK_ENRICHED_GRAPH: EnrichedGraphData = {
  nodes: [...agents, ...signals, ...factors, target],
  edges: [...agentSignalEdges, ...signalFactorEdges, ...causalEdges],
}

// ══════════════════════════════════════════════════════════════════════════════
// 大规模 Mock 数据生成器（120+ agents）
// ══════════════════════════════════════════════════════════════════════════════

const AG_PREFIXES = ['Macro','Bond','Geo','Tech','Quant','Senti','Policy','Trade','Credit','Energy',
  'Supply','Fiscal','Labor','House','Crypto','ESG','Climate','Yield','Vol','Alpha',
  'Beta','Gamma','Delta','Sigma','Omega','Infra','Comm','FX','Rate','Equity']
const AG_SUFFIXES = ['Hawk','Sage','Risk','Flow','Pro','Bot','AI','LLM','GPT','v2',
  'v3','7B','13B','Net','Core','Eye','Scan','Pulse','Mind','Edge']
const EXPERTISES = ['macro_economics','fixed_income','geopolitics','technology','behavioral',
  'energy','real_estate','credit','trade','fiscal_policy','labor_market','supply_chain']
const STANCES: Array<'dovish'|'hawkish'|'neutral'> = ['dovish','hawkish','neutral']
const RISK_APPS = ['conservative','moderate','aggressive']
const TIME_HRZ = ['short_term','medium_term','long_term']

const LARGE_FACTORS: Array<{id:string;name:string;type:string;dir:string}> = [
  {id:'lf_inflation',name:'通胀数据回落',type:'economic',dir:'bullish'},
  {id:'lf_fed',name:'联储政策信号',type:'political',dir:'bullish'},
  {id:'lf_employ',name:'就业市场降温',type:'economic',dir:'bullish'},
  {id:'lf_gdp',name:'GDP增速放缓',type:'economic',dir:'bullish'},
  {id:'lf_ai',name:'AI效率革命',type:'technological',dir:'bullish'},
  {id:'lf_geo',name:'地缘政治风险',type:'political',dir:'bearish'},
  {id:'lf_consumer',name:'消费者信心',type:'social',dir:'bullish'},
  {id:'lf_housing',name:'房市冷却',type:'economic',dir:'bullish'},
  {id:'lf_energy',name:'能源价格波动',type:'economic',dir:'bearish'},
  {id:'lf_sentiment',name:'市场情绪转向',type:'social',dir:'bullish'},
  {id:'lf_deglobal',name:'逆全球化加速',type:'political',dir:'bearish'},
  {id:'lf_credit',name:'信贷条件收紧',type:'economic',dir:'bullish'},
  {id:'lf_fiscal',name:'财政政策扩张',type:'political',dir:'bearish'},
  {id:'lf_supply',name:'供应链修复',type:'economic',dir:'bullish'},
  {id:'lf_crypto',name:'加密市场联动',type:'technological',dir:'neutral'},
]

const SIG_TEMPLATES: Record<string,string[]> = {
  lf_inflation: ['CPI同比{v}%','核心PCE{v}%','PPI环比{v}%','服务通胀{v}%','食品CPI{v}%'],
  lf_fed: ['联储鸽派措辞','FOMC纪要分析','联储官员讲话','利率期货信号','联储资产负债表'],
  lf_employ: ['非农{v}万','失业率{v}%','初请{v}万','职位空缺率{v}%','劳动参与率{v}%'],
  lf_gdp: ['GDP环比{v}%','制造业PMI{v}','服务业PMI{v}','零售销售{v}%','工业产出{v}%'],
  lf_ai: ['AI渗透率{v}%','自动化指数{v}','科技投资{v}B','AI专利{v}K','算力增长{v}%'],
  lf_geo: ['冲突风险指数{v}','制裁影响{v}%','军事紧张{v}','外交事件{v}','领土争端{v}'],
  lf_consumer: ['消费者信心{v}','零售信心{v}','消费贷{v}B','储蓄率{v}%','消费意愿{v}'],
  lf_housing: ['新屋开工{v}K','房价指数{v}','抵押贷利率{v}%','二手房销售{v}K','建筑许可{v}K'],
  lf_energy: ['原油{v}$/bbl','天然气{v}$/MMBtu','OPEC+产量{v}Mb','电价指数{v}','碳价{v}€'],
  lf_sentiment: ['VIX{v}','Put/Call{v}','资金流向{v}B','散户情绪{v}','机构仓位{v}%'],
  lf_deglobal: ['贸易壁垒{v}','关税率{v}%','供应链回迁{v}','FDI变化{v}%','技术脱钩{v}'],
  lf_credit: ['信用利差{v}bp','贷款标准{v}','违约率{v}%','企业债{v}B','银行准备金{v}'],
  lf_fiscal: ['赤字率{v}%','国债发行{v}B','财政支出{v}B','税收{v}B','基建投资{v}B'],
  lf_supply: ['航运指数{v}','库存周转{v}','交货时间{v}d','港口吞吐{v}M','物流成本{v}'],
  lf_crypto: ['BTC{v}K','ETH{v}K','加密市值{v}T','链上活跃{v}M','DeFi TVL{v}B'],
}

const FACTOR_FACTOR_EDGES: Array<{s:string;t:string;rel:string;dir:string;w:number}> = [
  {s:'lf_gdp',t:'lf_fed',rel:'AMPLIFIES',dir:'positive',w:0.68},
  {s:'lf_ai',t:'lf_inflation',rel:'AMPLIFIES',dir:'positive',w:0.55},
  {s:'lf_geo',t:'lf_energy',rel:'TRIGGERS',dir:'negative',w:0.62},
  {s:'lf_energy',t:'lf_inflation',rel:'INHIBITS',dir:'negative',w:0.48},
  {s:'lf_consumer',t:'lf_gdp',rel:'AMPLIFIES',dir:'positive',w:0.52},
  {s:'lf_housing',t:'lf_gdp',rel:'AMPLIFIES',dir:'positive',w:0.45},
  {s:'lf_sentiment',t:'lf_fed',rel:'CORRELATES_WITH',dir:'positive',w:0.40},
  {s:'lf_deglobal',t:'lf_inflation',rel:'INHIBITS',dir:'negative',w:0.58},
  {s:'lf_geo',t:'lf_deglobal',rel:'AMPLIFIES',dir:'positive',w:0.50},
  {s:'lf_employ',t:'lf_consumer',rel:'DRIVES',dir:'positive',w:0.55},
  {s:'lf_credit',t:'lf_housing',rel:'DRIVES',dir:'positive',w:0.52},
  {s:'lf_fiscal',t:'lf_gdp',rel:'INHIBITS',dir:'negative',w:0.46},
  {s:'lf_supply',t:'lf_inflation',rel:'AMPLIFIES',dir:'positive',w:0.44},
  {s:'lf_crypto',t:'lf_sentiment',rel:'CORRELATES_WITH',dir:'positive',w:0.35},
  {s:'lf_credit',t:'lf_consumer',rel:'DRIVES',dir:'positive',w:0.48},
  {s:'lf_fiscal',t:'lf_employ',rel:'AMPLIFIES',dir:'positive',w:0.42},
]

// 简易确定性随机
function seededRand(seed: number) { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 } }

export function generateLargeMockGraph(agentCount = 120): EnrichedGraphData {
  const rand = seededRand(42)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const rv = (lo: number, hi: number) => +(lo + rand() * (hi - lo)).toFixed(2)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Target
  nodes.push({ id: 'lt_001', name: '美联储Q3降息', node_type: 'target', is_target: true, impact_score: 1.0, confidence: 0.72, evidence_direction: 'bullish' })

  // Factors
  LARGE_FACTORS.forEach(f => {
    nodes.push({
      id: f.id, name: f.name, node_type: 'factor', factor_type: f.type, category: f.type,
      impact_score: rv(0.3, 0.95), confidence: rv(0.4, 0.9), evidence_direction: f.dir,
      hard_fact_count: Math.floor(rv(1, 12)), persona_count: Math.floor(rv(1, 8)),
      total_evidence_count: Math.floor(rv(3, 18)),
      is_minority_driven: f.id === 'lf_deglobal',
    })
  })

  // Factor → Factor edges
  FACTOR_FACTOR_EDGES.forEach((e, i) => {
    edges.push({ id: `le_ff_${i}`, source: e.s, target: e.t, edge_type: 'factor_factor', relation_type: e.rel, direction: e.dir, weight: e.w, strength: e.w > 0.55 ? 'strong' : 'moderate' })
  })

  // Factor → Target edges (top factors)
  ;['lf_inflation','lf_fed','lf_employ','lf_gdp','lf_ai','lf_consumer','lf_housing','lf_geo','lf_energy','lf_deglobal'].forEach((fid, i) => {
    const dir = ['lf_geo','lf_energy','lf_deglobal'].includes(fid) ? 'negative' : 'positive'
    edges.push({ id: `le_ft_${i}`, source: fid, target: 'lt_001', edge_type: 'factor_target', relation_type: 'DRIVES', direction: dir, weight: rv(0.4, 0.9), strength: 'strong' })
  })

  // Agents + Signals
  const usedNames = new Set<string>()
  for (let i = 0; i < agentCount; i++) {
    let name = ''
    do { name = `${pick(AG_PREFIXES)}${pick(AG_SUFFIXES)}` } while (usedNames.has(name))
    usedNames.add(name)

    const agId = `lag_${i}`
    const stance = pick(STANCES)
    nodes.push({
      id: agId, name, node_type: 'agent',
      avatar_label: `A${i + 1}`,
      persona: { stance, expertise: pick(EXPERTISES), risk_appetite: pick(RISK_APPS), time_horizon: pick(TIME_HRZ) },
    })

    // 2-3 signals per agent
    const sigCount = 2 + (rand() > 0.5 ? 1 : 0)
    for (let s = 0; s < sigCount; s++) {
      const targetFactor = pick(LARGE_FACTORS)
      const templates = SIG_TEMPLATES[targetFactor.id] || ['数据点{v}']
      const tpl = pick(templates)
      const val = rv(0.5, 5.0)
      const sigName = tpl.replace('{v}', String(val))
      const sigId = `lsig_${i}_${s}`
      const evType = rand() > 0.4 ? 'hard_fact' : 'persona_inference'

      nodes.push({ id: sigId, name: sigName, node_type: 'signal', evidence_type: evType, source_description: `Agent ${name}`, relevance_score: rv(0.5, 0.99) })
      edges.push({ id: `le_as_${i}_${s}`, source: agId, target: sigId, edge_type: 'agent_signal', weight: rv(0.6, 0.99) })
      edges.push({ id: `le_sf_${i}_${s}`, source: sigId, target: targetFactor.id, edge_type: 'signal_factor', direction: targetFactor.dir === 'bearish' ? 'negative' : 'positive', weight: rv(0.4, 0.95) })
    }
  }

  return { nodes, edges }
}

// ── 批次拆分（用于渐进演示） ──────────────────────────────────────────────────
export interface GraphBatch {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * 将完整图谱拆分为渐进批次（演示顺序更合理）
 *
 * Phase 1 — Agent 批次: 每批 batchSize 个 agent + 其 signals + agent→signal edges
 * Phase 2 — Factor 批次: 汇聚因子逐步显现 + signal→factor / factor↔factor edges
 * Phase 3 — Target 批次: 目标节点 + factor→target edges
 *
 * 这样演示顺序为: agent+信号 → 汇聚因子 → 目标，符合因果推理的自然流向。
 */
export function splitIntoBatches(data: EnrichedGraphData, batchSize = 10): GraphBatch[] {
  const batches: GraphBatch[] = []
  const eid = (e: GraphEdge, field: 'source' | 'target') => typeof e[field] === 'string' ? e[field] as string : (e[field] as any).id as string

  // ── 分类节点 ──
  const agentNodes = data.nodes.filter(n => n.node_type === 'agent')
  const signalNodes = data.nodes.filter(n => n.node_type === 'signal')
  const factorNodes = data.nodes.filter(n => n.node_type === 'factor')
  const targetNodes = data.nodes.filter(n => n.node_type === 'target')

  // ── 分类边 ──
  const agentSignalEdges = data.edges.filter(e => e.edge_type === 'agent_signal')
  const signalFactorEdges = data.edges.filter(e => e.edge_type === 'signal_factor')
  const factorFactorEdges = data.edges.filter(e => e.edge_type === 'factor_factor')
  const factorTargetEdges = data.edges.filter(e => e.edge_type === 'factor_target')

  const signalSet = new Map(signalNodes.map(n => [n.id, n]))

  // Build agent → signals map
  const agentToSignals = new Map<string, string[]>()
  agentSignalEdges.forEach(e => {
    const src = eid(e, 'source'), tgt = eid(e, 'target')
    if (!agentToSignals.has(src)) agentToSignals.set(src, [])
    agentToSignals.get(src)!.push(tgt)
  })

  // ── Phase 1: Agent 批次 ──
  for (let i = 0; i < agentNodes.length; i += batchSize) {
    const batchAgents = agentNodes.slice(i, i + batchSize)
    const batchNodes: GraphNode[] = [...batchAgents]
    const batchEdges: GraphEdge[] = []

    batchAgents.forEach(ag => {
      const sigIds = agentToSignals.get(ag.id) || []
      sigIds.forEach(sid => {
        const sigNode = signalSet.get(sid)
        if (sigNode) batchNodes.push(sigNode)
      })
      // agent→signal edges
      agentSignalEdges.filter(e => eid(e, 'source') === ag.id)
        .forEach(e => batchEdges.push(e))
    })

    batches.push({ nodes: batchNodes, edges: batchEdges })
  }

  // ── Phase 2: Factor 批次（含 signal→factor 和 factor↔factor 边） ──
  const factorBatchSize = Math.max(3, Math.ceil(factorNodes.length / 3)) // 分 ~3 批显示因子
  for (let i = 0; i < factorNodes.length; i += factorBatchSize) {
    const batchFactors = factorNodes.slice(i, i + factorBatchSize)
    const batchFactorIds = new Set(batchFactors.map(n => n.id))
    const batchEdges: GraphEdge[] = []

    // signal→factor edges (signal 已在前面出现，factor 在本批出现)
    signalFactorEdges.filter(e => batchFactorIds.has(eid(e, 'target')))
      .forEach(e => batchEdges.push(e))

    // factor↔factor edges (两端都已出现的)
    // 收集到目前为止所有已出现的 factor id
    const allPriorFactorIds = new Set<string>()
    for (let j = 0; j <= i / factorBatchSize; j++) {
      const slice = factorNodes.slice(j * factorBatchSize, (j + 1) * factorBatchSize)
      slice.forEach(n => allPriorFactorIds.add(n.id))
    }
    factorFactorEdges.filter(e =>
      allPriorFactorIds.has(eid(e, 'source')) && allPriorFactorIds.has(eid(e, 'target'))
    ).forEach(e => {
      // 避免重复添加已在前批出现的边
      if (batchFactorIds.has(eid(e, 'source')) || batchFactorIds.has(eid(e, 'target'))) {
        batchEdges.push(e)
      }
    })

    batches.push({ nodes: batchFactors, edges: batchEdges })
  }

  // ── Phase 3: Target 批次 ──
  if (targetNodes.length > 0) {
    batches.push({ nodes: targetNodes, edges: factorTargetEdges })
  }

  return batches
}
