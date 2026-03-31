/**
 * POST /api/test/prepare
 * [TEMP TEST ONLY] Creates 20 simulated agent profiles for UAP pipeline testing.
 * Uses Supabase admin API to create auth users + profiles.
 * Idempotent: returns existing agents if they already exist.
 */

// ══════════════════════════════════════════════════════════════
// API 路由：/api/test/prepare
// ══════════════════════════════════════════════════════════════
// 功能：准备 UAP 模拟测试环境
// 用途：
//   1. 创建或复用 100 个模拟 Agent 账号
//   2. 清除指定 market 的历史数据（predictions + causal_analyses）
//   3. 重置 market 状态为初始状态
// 调用时机：模拟测试开始前（Step 1）
// 请求方法：POST
// 请求体：{ task_id: string }
// 响应：{ agents: Array<{id, username}>, reused: boolean }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SIM_AGENT_COUNT = 100
const SIM_AGENT_PREFIX = 'SimAgent'
const SIM_EMAIL_DOMAIN = 'sim.delphi.internal'

// ══════════════════════════════════════════════════════════════
// Agent 名字池（100 个预设名字）
// ══════════════════════════════════════════════════════════════
// 说明：循环使用这些名字作为 username
// 用途：让 Agent 看起来更真实，而不是 agent-1, agent-2...
const AGENT_NAMES = [
  'MacroHawk-7B', 'BondSage-13B', 'GeoRisk-AI', 'TechAlpha-v2', 'QuantFlow-LLM',
  'SentimentPro', 'PolicyBot-3', 'DeGlobal-AI', 'CryptoLens', 'SupplyChain-AI',
  'ValueOracle', 'NarrativeBot', 'OilFutures-AI', 'GreenAlpha', 'MonetaryMind',
  'EMScanner-v2', 'AlgoTrade-AI', 'RealAsset-Bot', 'FiscalSage', 'ContrAgent-X',
  'DebtCycle-AI', 'YieldCurve-Pro', 'RiskParity-v3', 'MomentumBot-X', 'CrisisRadar-AI',
  'InflationWatch', 'DeltaHedge-AI', 'CreditRisk-Pro', 'VolSurface-AI', 'RegimeShift-X',
  'CommodityFlow', 'TailRisk-Guard', 'AssetAlloc-AI', 'CrossAsset-Pro', 'MicroStruct-AI',
  'OrderFlow-Bot', 'DarkPool-Lens', 'ArbSeeker-v2', 'LiquidityMap', 'StressTest-AI',
  'NarrativeNet', 'BehaviorBias-X', 'CrowdSentiment', 'ContrarianEdge', 'AdaptiveMacro',
  'PolicyTrace-AI', 'GeoPulse-v3', 'EnergyTrans-AI', 'ClimateRisk-X', 'SocialCapital',
  'DataDriven-Pro', 'AltData-Scout', 'SatelliteEcon', 'WebTraffic-AI', 'CreditCard-X',
  'TruckToll-Bot', 'PowerGrid-AI', 'PollutionIndex', 'FlightPath-Bot', 'ShipTrack-AI',
  'RetailFlow-X', 'JobPost-Scout', 'PatentFlow-AI', 'MergersRadar', 'InsiderFlow',
  'DividendYield-X', 'FactorZoo-AI', 'SmartBeta-Pro', 'QualityFactor', 'ValueMomentum',
  'ProfitMargin-X', 'CashFlow-Bot', 'CapEx-Tracker', 'WageGrowth-AI', 'HousingIndex',
  'VehicleSales-X', 'Container-Bot', 'PMIComposite', 'LeadIndicator-AI', 'SentimentDelta',
  'CorrMatrix-X', 'VolRegime-Bot', 'TailCorr-AI', 'SkewSurface-X', 'RealYield-Bot',
  'BreakEven-AI', 'CreditSpread-X', 'SwapRate-Bot', 'FXFlow-AI', 'CommCurve-X',
  'MetalRatio-Bot', 'AgriCycle-AI', 'PopTrend-Bot', 'LaborMob-AI', 'UrbanGrowth-X',
  'TechDiffuse-Bot', 'NetworkEffect-AI', 'PlatformEcon-X', 'RegCapture-Bot', 'PolicyUncert-AI',
]

// ══════════════════════════════════════════════════════════════
// Agent 模板池（20 个预设模板）
// ══════════════════════════════════════════════════════════════
// 说明：循环使用这些模板作为 Agent 的属性
// 用途：让 Agent 看起来更真实，而不是随机生成的属性
const AGENT_TEMPLATES = [
  { occupation: 'finance', gender: 'male', age_range: '35-45', interests: ['宏观经济', '债券'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'rational', information_sources: ['彭博', '路透社'], stance: 'hawkish', expertise: 'macro_economics', risk_appetite: 'conservative' },
  { occupation: 'technology', gender: 'female', age_range: '28-35', interests: ['AI', '科技股'], region: 'east_asia', education: 'phd', income_level: 'high', investment_experience: '5-10y', consumption_style: 'innovative', information_sources: ['财新', '科技媒体'], stance: 'dovish', expertise: 'technology', risk_appetite: 'aggressive' },
  { occupation: 'government', gender: 'male', age_range: '45-55', interests: ['地缘政治', '能源'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '10y+', consumption_style: 'rational', information_sources: ['FT', 'Economist'], stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative' },
  { occupation: 'academic', gender: 'female', age_range: '38-48', interests: ['行为经济学', '市场'], region: 'north_america', education: 'phd', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'analytical', information_sources: ['学术期刊', 'NBER'], stance: 'neutral', expertise: 'behavioral', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '30-40', interests: ['固收', '利率'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'rational', information_sources: ['CME', '美联储公告'], stance: 'dovish', expertise: 'fixed_income', risk_appetite: 'moderate' },
  { occupation: 'entrepreneur', gender: 'male', age_range: '32-42', interests: ['创投', '量化'], region: 'east_asia', education: 'bachelor', income_level: 'high', investment_experience: '5-10y', consumption_style: 'aggressive', information_sources: ['社交媒体', '量化信号'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'female', age_range: '40-50', interests: ['货币政策', '汇率'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'analytical', information_sources: ['ECB', 'IMF'], stance: 'dovish', expertise: 'macro_economics', risk_appetite: 'conservative' },
  { occupation: 'military', gender: 'male', age_range: '45-55', interests: ['地缘', '防务'], region: 'north_america', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'strategic', information_sources: ['防务分析', '智库报告'], stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'moderate' },
  { occupation: 'technology', gender: 'male', age_range: '25-35', interests: ['区块链', 'Web3'], region: 'east_asia', education: 'bachelor', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'innovative', information_sources: ['CoinDesk', '链上数据'], stance: 'neutral', expertise: 'technology', risk_appetite: 'aggressive' },
  { occupation: 'consultant', gender: 'female', age_range: '35-45', interests: ['供应链', '全球贸易'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'systematic', information_sources: ['WTO', '工业数据'], stance: 'neutral', expertise: 'supply_chain', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '50-60', interests: ['价值投资', '分红'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '20y+', consumption_style: 'value', information_sources: ['巴菲特', '伯克希尔'], stance: 'dovish', expertise: 'value_investing', risk_appetite: 'conservative' },
  { occupation: 'journalist', gender: 'female', age_range: '30-40', interests: ['宏观叙事', '政策解读'], region: 'east_asia', education: 'bachelor', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'narrative', information_sources: ['财联社', '证券时报'], stance: 'neutral', expertise: 'macro_economics', risk_appetite: 'moderate' },
  { occupation: 'energy', gender: 'male', age_range: '40-50', interests: ['原油', 'OPEC'], region: 'middle_east', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'commodity', information_sources: ['OPEC报告', 'EIA数据'], stance: 'hawkish', expertise: 'commodities', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'female', age_range: '28-38', interests: ['ESG', '绿色金融'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'sustainable', information_sources: ['环保报告', 'ESG评级'], stance: 'dovish', expertise: 'esg', risk_appetite: 'conservative' },
  { occupation: 'academic', gender: 'male', age_range: '55-65', interests: ['货币理论', '历史'], region: 'north_america', education: 'phd', income_level: 'middle', investment_experience: '20y+', consumption_style: 'theoretical', information_sources: ['学术期刊', 'Fed论文'], stance: 'neutral', expertise: 'monetary_policy', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '33-43', interests: ['新兴市场', '汇率'], region: 'latin_america', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'emerging', information_sources: ['世行', 'IMF新兴市场'], stance: 'hawkish', expertise: 'emerging_markets', risk_appetite: 'aggressive' },
  { occupation: 'technology', gender: 'female', age_range: '26-36', interests: ['AI金融', '算法交易'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '3-5y', consumption_style: 'quantitative', information_sources: ['arXiv', '算法研究'], stance: 'neutral', expertise: 'ai_finance', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '42-52', interests: ['房地产', '利率敏感'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'asset_heavy', information_sources: ['房地产数据', '银行报告'], stance: 'dovish', expertise: 'real_estate', risk_appetite: 'moderate' },
  { occupation: 'government', gender: 'female', age_range: '48-58', interests: ['财政政策', '债务'], region: 'europe', education: 'phd', income_level: 'middle', investment_experience: '10y+', consumption_style: 'fiscal', information_sources: ['欧央行', '财政部'], stance: 'dovish', expertise: 'fiscal_policy', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '36-46', interests: ['量化宽松', '资产泡沫'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'contrarian', information_sources: ['Ray Dalio', '桥水研究'], stance: 'hawkish', expertise: 'macro_economics', risk_appetite: 'aggressive' },
  // Batch 2: 21-40
  { occupation: 'finance', gender: 'male', age_range: '38-48', interests: ['信用市场', '高收益债'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'rational', information_sources: ['穆迪', '标普'], stance: 'hawkish', expertise: 'fixed_income', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'female', age_range: '32-42', interests: ['外汇', '衍生品'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'systematic', information_sources: ['彭博外汇', 'BIS报告'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '29-39', interests: ['成长股', '科技股'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'aggressive', information_sources: ['高盛研报', '摩根士丹利'], stance: 'bullish', expertise: 'quantitative', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'female', age_range: '26-36', interests: ['量化策略', '因子投资'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '3-5y', consumption_style: 'quantitative', information_sources: ['Journal of Finance', 'SSRN'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '35-45', interests: ['对冲基金', '风险平价'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'systematic', information_sources: ['桥水', '文艺复兴'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '27-37', interests: ['高频交易', '市场微观结构'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '3-5y', consumption_style: 'quantitative', information_sources: ['交易所数据', '订单流'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'aggressive' },
  { occupation: 'technology', gender: 'male', age_range: '30-40', interests: ['半导体', '科技供应链'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'innovative', information_sources: ['IC Insights', 'SEMI'], stance: 'hawkish', expertise: 'technology', risk_appetite: 'moderate' },
  { occupation: 'technology', gender: 'female', age_range: '24-34', interests: ['云计算', 'SaaS'], region: 'north_america', education: 'master', income_level: 'middle', investment_experience: '1-3y', consumption_style: 'innovative', information_sources: ['TechCrunch', 'Andreessen Horowitz'], stance: 'bullish', expertise: 'technology', risk_appetite: 'aggressive' },
  { occupation: 'technology', gender: 'male', age_range: '28-38', interests: ['机器学习', '自然语言处理'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '1-3y', consumption_style: 'quantitative', information_sources: ['OpenAI博客', 'Google Research'], stance: 'neutral', expertise: 'ai_finance', risk_appetite: 'moderate' },
  { occupation: 'government', gender: 'male', age_range: '50-60', interests: ['央行政策', '汇率管理'], region: 'east_asia', education: 'phd', income_level: 'middle', investment_experience: '20y+', consumption_style: 'theoretical', information_sources: ['央行公告', 'BIS'], stance: 'neutral', expertise: 'monetary_policy', risk_appetite: 'conservative' },
  { occupation: 'government', gender: 'female', age_range: '40-50', interests: ['国际贸易', '制裁政策'], region: 'north_america', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'rational', information_sources: ['USTR', 'WTO'], stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative' },
  { occupation: 'government', gender: 'male', age_range: '55-65', interests: ['监管政策', '系统性风险'], region: 'north_america', education: 'phd', income_level: 'middle', investment_experience: '20y+', consumption_style: 'systematic', information_sources: ['Fed报告', 'BIS年报'], stance: 'hawkish', expertise: 'monetary_policy', risk_appetite: 'conservative' },
  { occupation: 'government', gender: 'male', age_range: '42-52', interests: ['半导体政策', '产业补贴'], region: 'east_asia', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'strategic', information_sources: ['METI', '工信部'], stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative' },
  { occupation: 'government', gender: 'male', age_range: '38-48', interests: ['数字货币', 'CBDC'], region: 'east_asia', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'systematic', information_sources: ['BIS创新中心', 'PBOC数研所'], stance: 'neutral', expertise: 'monetary_policy', risk_appetite: 'conservative' },
  // Batch 3: 41-60
  { occupation: 'academic', gender: 'female', age_range: '35-45', interests: ['市场微观结构', '流动性'], region: 'europe', education: 'phd', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'analytical', information_sources: ['Journal of Finance', 'RFS'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'moderate' },
  { occupation: 'academic', gender: 'male', age_range: '42-52', interests: ['国际金融', '资本流动'], region: 'europe', education: 'phd', income_level: 'middle', investment_experience: '10y+', consumption_style: 'theoretical', information_sources: ['NBER', 'CEPR'], stance: 'neutral', expertise: 'macro_economics', risk_appetite: 'conservative' },
  { occupation: 'academic', gender: 'female', age_range: '30-40', interests: ['气候经济学', '转型风险'], region: 'europe', education: 'phd', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'sustainable', information_sources: ['Nature Climate', 'IPCC'], stance: 'dovish', expertise: 'esg', risk_appetite: 'conservative' },
  { occupation: 'academic', gender: 'male', age_range: '48-58', interests: ['经济史', '金融危机'], region: 'europe', education: 'phd', income_level: 'middle', investment_experience: '10y+', consumption_style: 'theoretical', information_sources: ['Cambridge UP', 'VoxEU'], stance: 'neutral', expertise: 'macro_economics', risk_appetite: 'conservative' },
  { occupation: 'academic', gender: 'female', age_range: '36-46', interests: ['性别经济学', '工资差距'], region: 'north_america', education: 'phd', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'analytical', information_sources: ['AEA期刊', 'ILO'], stance: 'dovish', expertise: 'behavioral', risk_appetite: 'moderate' },
  { occupation: 'academic', gender: 'male', age_range: '38-48', interests: ['博弈论', '拍卖理论'], region: 'north_america', education: 'phd', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'theoretical', information_sources: ['AER', 'Games and Economic Behavior'], stance: 'neutral', expertise: 'behavioral', risk_appetite: 'moderate' },
  { occupation: 'energy', gender: 'male', age_range: '38-48', interests: ['天然气', 'LNG'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'commodity', information_sources: ['IEA', '天然气市场'], stance: 'hawkish', expertise: 'commodities', risk_appetite: 'moderate' },
  { occupation: 'energy', gender: 'female', age_range: '32-42', interests: ['可再生能源', '碳交易'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'sustainable', information_sources: ['Bloomberg绿能', 'IRENA'], stance: 'dovish', expertise: 'esg', risk_appetite: 'moderate' },
  { occupation: 'energy', gender: 'male', age_range: '45-55', interests: ['金属', '矿业'], region: 'latin_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'commodity', information_sources: ['金属通报', 'LME'], stance: 'hawkish', expertise: 'commodities', risk_appetite: 'moderate' },
  { occupation: 'energy', gender: 'female', age_range: '35-45', interests: ['氢能', '储能'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'sustainable', information_sources: ['Hydrogen Council', 'NREL'], stance: 'dovish', expertise: 'esg', risk_appetite: 'moderate' },
  // Batch 4: 61-80
  { occupation: 'finance', gender: 'male', age_range: '44-54', interests: ['私募股权', '杠杆收购'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'aggressive', information_sources: ['PE Hub', '并购数据库'], stance: 'bullish', expertise: 'value_investing', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'female', age_range: '33-43', interests: ['财富管理', '家族办公室'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'value', information_sources: ['Campden', 'Family Capital'], stance: 'dovish', expertise: 'value_investing', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '28-38', interests: ['可转债', '结构性产品'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '3-5y', consumption_style: 'systematic', information_sources: ['Wind资讯', '中信证券'], stance: 'neutral', expertise: 'fixed_income', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '41-51', interests: ['流动性管理', '货币市场'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'rational', information_sources: ['NY Fed', 'SIFMA'], stance: 'hawkish', expertise: 'monetary_policy', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '31-41', interests: ['期货期权', '波动率'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'quantitative', information_sources: ['CBOE', 'Options Clearing'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'female', age_range: '36-46', interests: ['责任投资', '影响力金融'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'sustainable', information_sources: ['PRI', 'GSIA'], stance: 'dovish', expertise: 'esg', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '46-56', interests: ['保险投资', '长期负债匹配'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '20y+', consumption_style: 'value', information_sources: ['Insurance ERM', 'Solvency II'], stance: 'dovish', expertise: 'fixed_income', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '39-49', interests: ['并购套利', '特殊情况'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'contrarian', information_sources: ['Mergermarket', 'Deal flow'], stance: 'neutral', expertise: 'value_investing', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'female', age_range: '29-39', interests: ['宏观对冲', 'CTA策略'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '3-5y', consumption_style: 'systematic', information_sources: ['Man Group研究', 'AQR论文'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'male', age_range: '52-62', interests: ['退休金管理', '长期回报'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '20y+', consumption_style: 'value', information_sources: ['Pension & Investments', 'PBGC'], stance: 'dovish', expertise: 'value_investing', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'female', age_range: '34-44', interests: ['亚洲债市', '信用评级'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'rational', information_sources: ['惠誉亚太', '联合资信'], stance: 'hawkish', expertise: 'fixed_income', risk_appetite: 'conservative' },
  // Batch 5: 81-100
  { occupation: 'military', gender: 'male', age_range: '50-60', interests: ['台海局势', '印太战略'], region: 'east_asia', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'strategic', information_sources: ['RAND', '战略与国际研究中心'], stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative' },
  { occupation: 'military', gender: 'female', age_range: '40-50', interests: ['网络安全', '关键基础设施'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'strategic', information_sources: ['NATO报告', 'Cybersecurity Ventures'], stance: 'hawkish', expertise: 'geopolitics', risk_appetite: 'conservative' },
  { occupation: 'journalist', gender: 'male', age_range: '35-45', interests: ['科技报道', 'AI政策'], region: 'north_america', education: 'bachelor', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'narrative', information_sources: ['NYT', 'WSJ'], stance: 'neutral', expertise: 'technology', risk_appetite: 'moderate' },
  { occupation: 'journalist', gender: 'female', age_range: '27-37', interests: ['数字货币', '加密监管'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'narrative', information_sources: ['Coindesk', 'BIS季报'], stance: 'neutral', expertise: 'technology', risk_appetite: 'moderate' },
  { occupation: 'journalist', gender: 'male', age_range: '40-50', interests: ['财经叙事', '预测市场'], region: 'north_america', education: 'master', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'narrative', information_sources: ['五三八', '预测界'], stance: 'neutral', expertise: 'behavioral', risk_appetite: 'moderate' },
  { occupation: 'consultant', gender: 'male', age_range: '38-48', interests: ['数字转型', '企业战略'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'systematic', information_sources: ['麦肯锡', 'BCG报告'], stance: 'neutral', expertise: 'technology', risk_appetite: 'moderate' },
  { occupation: 'consultant', gender: 'female', age_range: '42-52', interests: ['ESG评级', '可持续报告'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'sustainable', information_sources: ['MSCI ESG', 'SASB'], stance: 'dovish', expertise: 'esg', risk_appetite: 'conservative' },
  { occupation: 'consultant', gender: 'male', age_range: '44-54', interests: ['能源转型', '碳定价'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'sustainable', information_sources: ['BNEF', '碳简报'], stance: 'dovish', expertise: 'esg', risk_appetite: 'moderate' },
  { occupation: 'real_estate', gender: 'male', age_range: '42-52', interests: ['商业地产', 'REITs'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'asset_heavy', information_sources: ['CoStar', '房地产周刊'], stance: 'dovish', expertise: 'real_estate', risk_appetite: 'moderate' },
  { occupation: 'real_estate', gender: 'female', age_range: '36-46', interests: ['住宅市场', '利率传导'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'asset_heavy', information_sources: ['链家数据', '克而瑞'], stance: 'dovish', expertise: 'real_estate', risk_appetite: 'conservative' },
  { occupation: 'healthcare', gender: 'female', age_range: '38-48', interests: ['医药股', '生物科技'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '5-10y', consumption_style: 'innovative', information_sources: ['NEJM', 'BioPharma'], stance: 'bullish', expertise: 'technology', risk_appetite: 'moderate' },
  { occupation: 'healthcare', gender: 'male', age_range: '45-55', interests: ['医疗AI', '数据隐私'], region: 'europe', education: 'phd', income_level: 'middle', investment_experience: '5-10y', consumption_style: 'analytical', information_sources: ['Lancet', 'Health Affairs'], stance: 'neutral', expertise: 'ai_finance', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '32-42', interests: ['印度股市', '新兴市场'], region: 'south_asia', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'emerging', information_sources: ['经济时报', 'BSE数据'], stance: 'bullish', expertise: 'emerging_markets', risk_appetite: 'aggressive' },
  { occupation: 'entrepreneur', gender: 'female', age_range: '28-38', interests: ['金融科技', '支付'], region: 'south_asia', education: 'master', income_level: 'middle', investment_experience: '3-5y', consumption_style: 'innovative', information_sources: ['FinTech India', 'RBI通报'], stance: 'bullish', expertise: 'technology', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'male', age_range: '40-50', interests: ['巴西市场', '大宗商品'], region: 'latin_america', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'commodity', information_sources: ['Valor Econômico', 'Bovespa'], stance: 'hawkish', expertise: 'emerging_markets', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'male', age_range: '38-48', interests: ['主权财富', '石油美元'], region: 'middle_east', education: 'master', income_level: 'high', investment_experience: '10y+', consumption_style: 'asset_heavy', information_sources: ['Zawya', 'Gulf News'], stance: 'hawkish', expertise: 'commodities', risk_appetite: 'moderate' },
  { occupation: 'entrepreneur', gender: 'male', age_range: '30-40', interests: ['数字经济', '金融科技'], region: 'middle_east', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'innovative', information_sources: ['Wamda', 'Magnitt'], stance: 'bullish', expertise: 'technology', risk_appetite: 'aggressive' },
  { occupation: 'finance', gender: 'female', age_range: '35-45', interests: ['澳元', '大宗商品出口'], region: 'oceania', education: 'master', income_level: 'high', investment_experience: '5-10y', consumption_style: 'commodity', information_sources: ['RBA', 'ASX数据'], stance: 'neutral', expertise: 'macro_economics', risk_appetite: 'moderate' },
  { occupation: 'finance', gender: 'male', age_range: '47-57', interests: ['负利率', '日本化'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '20y+', consumption_style: 'contrarian', information_sources: ['日银季报', '大和研究'], stance: 'dovish', expertise: 'monetary_policy', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'male', age_range: '55-65', interests: ['周期理论', '长波'], region: 'europe', education: 'phd', income_level: 'high', investment_experience: '20y+', consumption_style: 'contrarian', information_sources: ['经济周期研究所', 'BCA Research'], stance: 'hawkish', expertise: 'macro_economics', risk_appetite: 'conservative' },
  { occupation: 'finance', gender: 'female', age_range: '38-48', interests: ['另类数据', '卫星图像'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '5-10y', consumption_style: 'quantitative', information_sources: ['Eagle Alpha', 'Quandl'], stance: 'neutral', expertise: 'quantitative', risk_appetite: 'moderate' },
]

// ══════════════════════════════════════════════════════════════
// API Key Hash 生成函数
// ══════════════════════════════════════════════════════════════
// 说明：生成 Agent 的 API Key Hash
// 用途：确保每个 Agent 的 API Key Hash 唯一
function generateApiKeyHash(agentIndex: number): string {
  return `sim_agent_key_${String(agentIndex).padStart(3, '0')}_${Date.now().toString(36)}`
}

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log(`[test/prepare] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`[test/prepare] ▶ POST called at ${timestamp}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('[test/prepare] 🔧 Environment check:')
  console.log('[test/prepare]   SUPABASE_URL:', supabaseUrl ? supabaseUrl.slice(0, 40) + '...' : '❌ MISSING')
  console.log('[test/prepare]   SERVICE_KEY:', serviceKey ? '✅ present (' + serviceKey.slice(0, 8) + '...)' : '❌ MISSING')

  if (!supabaseUrl || !serviceKey) {
    console.error('[test/prepare] ❌ Missing required environment variables')
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 })
  }

  const adminSupabase = createClient(supabaseUrl, serviceKey)

  // ══════════════════════════════════════════════════════════════
  // Step 1: 解析请求体
  // ══════════════════════════════════════════════════════════════
  // 说明：读取请求体中的 task_id
  // 用途：清除指定 market 的历史数据
  let task_id: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    task_id = body?.task_id || null
    console.log('[test/prepare] 📥 Request body:')
    console.log('[test/prepare]   task_id:', task_id || '(not provided)')
  } catch { 
    console.log('[test/prepare] ⚠️ No request body provided')
  }

  try {
    // ══════════════════════════════════════════════════════════════
    // Step 2: 清除历史预测数据
    // ══════════════════════════════════════════════════════════════
    // 说明：删除该 market 的所有预测记录
    // 表：predictions
    // 条件：task_id = 指定的 market ID
    if (task_id) {
      console.log('[test/prepare] 🗑 Cleaning historical data...')
      console.log('[test/prepare]   Target market:', task_id)
      
      const { error: delPredErr } = await adminSupabase
        .from('predictions')
        .delete()
        .eq('task_id', task_id)
      if (delPredErr) {
        console.error('[test/prepare] ❌ Failed to delete predictions')
        console.error('[test/prepare]   Error:', delPredErr.message)
      } else {
        console.log('[test/prepare] ✅ Old predictions deleted')
      }

      const { error: delAnalysisErr } = await adminSupabase
        .from('causal_analyses')
        .delete()
        .eq('task_id', task_id)
      if (delAnalysisErr) {
        console.error('[test/prepare] ❌ Failed to delete analyses')
        console.error('[test/prepare]   Error:', delAnalysisErr.message)
      } else {
        console.log('[test/prepare] ✅ Old analyses deleted')
      }

      // ══════════════════════════════════════════════════════════════
      // Step 3: 重置 market 状态
      // ══════════════════════════════════════════════════════════════
      // 说明：重置 market 的分析状态为初始状态
      // 表：markets
      // 条件：id = 指定的 market ID
      const { error: updateErr } = await adminSupabase
        .from('markets')
        .update({ causal_analysis_status: 'none', last_analysis_at: null })
        .eq('id', task_id)
      if (updateErr) {
        console.error('[test/prepare] ❌ Failed to reset market status')
        console.error('[test/prepare]   Error:', updateErr.message)
      } else {
        console.log('[test/prepare] ✅ Market status reset to "none"')
      }
    } else {
      console.log('[test/prepare] ⏭ Skipping data cleanup (no task_id provided)')
    }

    // ══════════════════════════════════════════════════════════════
    // Step 4: 检查已有模拟 Agent
    // ══════════════════════════════════════════════════════════════
    // 说明：查询数据库中已存在的模拟 Agent
    // 标识：email 以 @sim.delphi.internal 结尾
    // 目标：复用已有 Agent，避免重复创建
    console.log('[test/prepare] 🔍 Checking for existing sim agents...')
    console.log('[test/prepare]   Detection method: email domain (@sim.delphi.internal)')
    console.log('[test/prepare]   Target count:', SIM_AGENT_COUNT)
    
    const { data: { users: allAuthUsers } } = await adminSupabase.auth.admin.listUsers({ perPage: 200 })
    const simAuthUsers = (allAuthUsers || []).filter((u: { email?: string }) => u.email?.endsWith(`@${SIM_EMAIL_DOMAIN}`))
    const simUserIds = simAuthUsers.map((u: { id: string }) => u.id)
    const simEmails = new Set(simAuthUsers.map((u: { email?: string }) => u.email))
    console.log('[test/prepare] ✓ Auth users scanned:', allAuthUsers?.length || 0)
    console.log('[test/prepare] ✓ Sim auth users found:', simAuthUsers.length)

    let existing: Array<{ id: string; username: string; api_key_hash: string; persona_region?: string | null }> = []
    if (simUserIds.length > 0) {
      const { data: existingData, error: existingErr } = await adminSupabase
        .from('profiles')
        .select('id, username, api_key_hash, persona_region')
        .in('id', simUserIds)
      if (existingErr) {
        console.error('[test/prepare] ❌ Error querying profiles:', existingErr.message)
      } else {
        console.log('[test/prepare] ✓ Profiles queried successfully')
      }
      existing = existingData || []
    }
    console.log('[test/prepare] ✓ Existing sim agent profiles:', existing.length)

    // ══════════════════════════════════════════════════════════════
    // Step 4.5: 补填画像字段（无论 agent 数量，先补填旧 agent 的 persona 数据）
    // ══════════════════════════════════════════════════════════════
    const needsBackfill = existing.filter(a => !a.persona_region)
    if (needsBackfill.length > 0) {
      console.log(`[test/prepare] 🔄 Backfilling persona for ${needsBackfill.length} agents...`)
      for (const agent of needsBackfill) {
        const authUser = simAuthUsers.find((u: { id: string }) => u.id === agent.id)
        const match = authUser?.email?.match(/sim-agent-0*(\d+)@/)
        const idx = match ? parseInt(match[1]) - 1 : 0
        const tpl = AGENT_TEMPLATES[idx % AGENT_TEMPLATES.length]
        console.log(`[test/prepare] 📝 Backfill agent: ${agent.username} | email: ${authUser?.email} | idx: ${idx}`)
        console.log(`[test/prepare]    tpl: region=${tpl.region} gender=${tpl.gender} age_range=${tpl.age_range} occupation=${tpl.occupation}`)
        const { error: bfErr } = await adminSupabase.from('profiles').update({
          persona_region:     tpl.region      ?? null,
          persona_gender:     tpl.gender      ?? null,
          persona_age_range:  tpl.age_range   ?? null,
          persona_occupation: tpl.occupation  ?? null,
          persona_interests:  tpl.interests   ?? null,
        }).eq('id', agent.id)
        if (bfErr) {
          console.error(`[test/prepare] ❌ Backfill failed for ${agent.username}: ${bfErr.message} | code: ${bfErr.code}`)
        } else {
          console.log(`[test/prepare] ✅ Backfill OK: ${agent.username}`)
        }
      }
      console.log('[test/prepare] ✅ Persona backfill complete')
    } else {
      console.log('[test/prepare] ✓ All existing agents already have persona data')
    }

    if (existing && existing.length >= SIM_AGENT_COUNT) {
      console.log('[test/prepare] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('[test/prepare] ✅ Reusing existing agents (sufficient count)')
      console.log('[test/prepare]   Existing:', existing.length)
      console.log('[test/prepare]   Required:', SIM_AGENT_COUNT)
      console.log('[test/prepare]   Sample usernames:', existing.slice(0, 3).map(a => a.username).join(', '))
      return NextResponse.json({
        success: true,
        agents: existing.map(a => ({ id: a.id, username: a.username, api_key_hash: a.api_key_hash })),
        reused: true,
        message: `Reusing ${existing.length} existing sim agents`,
      })
    }

    // ══════════════════════════════════════════════════════════════
    // Step 5: 创建新 Agent
    // ══════════════════════════════════════════════════════════════
    // 说明：创建新 Agent 并插入数据库
    // 表：auth.users、profiles
    // 条件：email 以 @sim.delphi.internal 结尾
    const newAgents: Array<{ id: string; username: string; api_key_hash: string }> = [
      ...(existing || []).map(a => ({ id: a.id, username: a.username, api_key_hash: a.api_key_hash }))
    ]

    const needed = SIM_AGENT_COUNT - newAgents.length

    for (let i = 0; i < AGENT_TEMPLATES.length && newAgents.length < SIM_AGENT_COUNT; i++) {
      const agentName = AGENT_NAMES[i] || `${SIM_AGENT_PREFIX}_${String(i + 1).padStart(3, '0')}`
      const username = agentName
      const email = `sim-agent-${String(i + 1).padStart(3, '0')}@${SIM_EMAIL_DOMAIN}`

      if (simEmails.has(email)) continue

      const apiKeyHash = generateApiKeyHash(i + 1)

      // ══════════════════════════════════════════════════════════════
      // Step 6: 创建 auth 用户
      // ══════════════════════════════════════════════════════════════
      // 说明：创建 auth 用户并插入 auth.users 表
      // 表：auth.users
      // 条件：email 以 @sim.delphi.internal 结尾
      console.log(`[test/prepare]   Creating auth user: ${email}`)
      const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
        email,
        password: `SimAgent_${randomUUID().replace(/-/g, '')}!`,
        email_confirm: true,
        user_metadata: { username, is_sim_agent: true },
      })

      if (authErr || !authUser?.user) {
        console.error(`[test/prepare]   ❌ Auth user creation failed for ${username}:`, authErr?.message)
        continue
      }
      console.log(`[test/prepare]   ✅ Auth user created: ${authUser.user.id}`)

      const template = AGENT_TEMPLATES[i % AGENT_TEMPLATES.length]

      // ══════════════════════════════════════════════════════════════
      // Step 7: 创建 profile
      // ══════════════════════════════════════════════════════════════
      // 说明：创建 profile 并插入 profiles 表
      // 表：profiles
      // 条件：id = auth 用户 ID
      const { error: profileErr } = await adminSupabase
        .from('profiles')
        .insert({
          id: authUser.user.id,
          username,
          api_key_hash: apiKeyHash,
          reputation_score: 100 + Math.floor(Math.random() * 400),
          reputation_level: ['apprentice', 'journeyman', 'expert'][Math.floor(Math.random() * 3)],
          status: 'active',
          total_predictions: 0,
          daily_prediction_count: 0,
          niche_tags: [template.expertise, template.occupation],
          persona_region: template.region ?? null,
          persona_gender: template.gender ?? null,
          persona_age_range: template.age_range ?? null,
          persona_occupation: template.occupation ?? null,
          persona_interests: template.interests ?? null,
        })

      if (profileErr) {
        console.error(`[test/prepare]   ❌ Profile creation failed for ${username}:`, profileErr.message, profileErr.details)
        await adminSupabase.auth.admin.deleteUser(authUser.user.id)
        continue
      }
      console.log(`[test/prepare]   ✅ Profile created for ${username}`)

      newAgents.push({ id: authUser.user.id, username, api_key_hash: apiKeyHash })
    }

    console.log(`[test/prepare] ✅ Done. Total agents ready: ${newAgents.length}`)
    return NextResponse.json({
      success: true,
      agents: newAgents,
      created: needed,
      message: `Prepared ${newAgents.length} sim agents`,
    })
  } catch (error) {
    console.error('[test/prepare] ❌ Unexpected error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
