// ══════════════════════════════════════════════════════════════
// API 路由：/api/test/upload-batch
// ══════════════════════════════════════════════════════════════
// 功能：批量上传模拟信号提交数据
// 用途：
//   1. 接收一批 Agent ID 列表
//   2. 为每个 Agent 生成模拟的信号数据（evidence, signals, tags 等）
//   3. 直接插入数据库（绕过正常的 API key 验证）
// 调用时机：模拟测试流程中（Step 3），每批间隔 5 秒
// 请求方法：POST
// 请求体：{ task_id: string, batch_index: number, agents: Array<{id, username}> }
// 响应：{ success: true, inserted: number, total_submissions: number }
// 批次大小：30 条提交/批
// 总批次数：10 批（共 300 条提交）
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ══════════════════════════════════════════════════════════════
// 数据模板：RATIONALE_TEMPLATES（预测理由模板）
// ══════════════════════════════════════════════════════════════
// 说明：46 种预设的预测理由，涵盖宏观经济、地缘政治、技术分析等多个领域
// 分类：
//   - Hard facts (1-34)：基于客观数据的分析
//   - Persona inference (35-46)：基于主观判断的推理
// 用途：循环使用这些模板生成真实感的预测理由
const RATIONALE_TEMPLATES = [
  // Hard facts
  'CPI同比数据显示通胀连续3个月回落，核心PCE已降至2.1%，接近美联储目标区间，加息周期基本结束的概率大幅上升。',
  '非农就业数据连续两个月低于预期，劳动力市场明显降温，失业率从3.5%升至3.9%，工资增速回落至3.2%。',
  '美联储最新FOMC会议纪要显示委员会内部对降息时机出现明显分歧，鸽派票数首次超过鹰派，市场情绪发生实质性转变。',
  '10年期美国国债收益率从高点4.8%回落至4.2%，收益率曲线倒挂幅度收窄，市场预期政策转向的概率已升至75%。',
  '国际原油价格受OPEC+减产影响短期反弹，但全球经济放缓预期压制了需求侧，供需博弈将决定后续走势。',
  '美国GDP环比增长1.8%，低于预期的2.3%，与此同时消费者信心指数跌至新低，经济软着陆窗口正在收窄。',
  '中东地缘冲突升级导致全球供应链风险指数创年内新高，航运保险费率上涨40%，通胀输入性压力不可忽视。',
  'AI芯片出口管制扩大覆盖范围，科技巨头资本开支计划超预期增长35%，AI产业投资周期比市场预期更为强劲。',
  '新兴市场债务压力指数触及历史高位，美元强势持续挤压新兴市场货币，资本外流压力显著加大。',
  '德国制造业PMI连续6个月处于荣枯线以下，欧元区经济停滞风险上升，欧央行降息窗口提前至第二季度。',
  '比特币现货ETF获SEC批准后机构净流入超过120亿美元，链上持仓集中度上升，长期持有者比例创历史新高。',
  '美国科技五巨头合计市值突破15万亿美元，PE估值处于历史95%分位，市场集中度风险引发监管关注。',
  '日本央行意外上调收益率曲线控制上限至1.5%，日元套利交易平仓规模估计超过3000亿美元，全球流动性收紧。',
  '中国出口同比下降8.3%，制造业PMI连续4个月低于荣枯线，内需不足叠加外需疲软形成双重压力。',
  '美国商业地产违约率升至7.2%，办公楼空置率创40年新高，区域银行持有约1.5万亿商业地产贷款风险敞口。',
  '印度GDP增速达7.8%成为全球增速最快主要经济体，外资直接投资同比增长22%，制造业承接转移趋势明确。',
  '全球半导体库存去化进入尾声，AI算力需求带动高端芯片供不应求，台积电先进制程产能预订已排至2026年。',
  '欧佩克宣布延长额外减产协议至年底，与此同时美国页岩油产量创历史新高，原油价格双向压力并存。',
  '美联储隔夜逆回购余额从2.55万亿降至0.8万亿，银行体系流动性边际收紧，短端利率波动性上升。',
  '比特币第四次减半如期完成，历史数据显示减半后6-18个月价格平均上涨约4倍，供应冲击效应不可忽视。',
  // Persona inference
  '综合宏观数据和政策信号分析，美联储在明年上半年执行1-2次预防性降息的概率超过60%，利率路径比市场定价更为宽松。',
  '从行为金融学角度分析，市场当前定价已过度反映悲观预期，极端情绪往往是反转信号，均值回归概率较高。',
  '基于地缘政治博弈的结构性分析，中美科技脱钩正在加速，供应链重构带来的成本压力将在未来2-3年持续显现。',
  '量化模型显示当前市场波动率处于历史10%分位，低波动率环境通常预示着大幅波动即将到来，方向性赌注需要谨慎。',
  'ESG评级调整对机构资金配置的影响被大多数分析师低估，绿色转型带来的资产重估效应将在未来5年逐步显现。',
  '全球货币政策同步性正在降低，美联储与日本央行的政策背离将在外汇市场引发显著波动，套利交易平仓风险上升。',
  '人工智能对劳动生产率的提升效应已开始在服务业数据中显现，通胀自发下行的长期结构性趋势正在形成。',
  '债务周期分析显示美国财政赤字货币化压力持续增大，长期来看美债实际收益率面临结构性下行压力。',
  '从历史类比来看，当前利率周期与1994年和2006年最为相似，市场往往在首次降息前6个月提前定价，当前时点临近拐点。',
  '东亚制造业回流趋势明确，越南、印度等国产能快速扩张，中国制造业出口市场份额面临结构性压力。',
]

// ══════════════════════════════════════════════════════════════
// 数据模板：ENTITY_TAG_SETS（实体标签集合）— UAP v3.0
// ══════════════════════════════════════════════════════════════
// role 必须为 UAP v3 有效值：cause/indicator/context/target/source/negative_intent/positive_intent
const ENTITY_TAG_SETS = [
  [{ text: '美联储货币政策转向', type: 'policy', role: 'cause' }, { text: 'CPI通胀率', type: 'metric', role: 'indicator' }],
  [{ text: '非农就业数据走弱', type: 'metric', role: 'cause' }, { text: '劳动力市场降温', type: 'trend', role: 'indicator' }],
  [{ text: 'FOMC鸽派信号', type: 'event', role: 'cause' }, { text: '货币政策预期', type: 'trend', role: 'context' }],
  [{ text: '美债收益率下行', type: 'metric', role: 'indicator' }, { text: '收益率曲线修复', type: 'trend', role: 'cause' }],
  [{ text: 'OPEC+减产决议', type: 'policy', role: 'cause' }, { text: '原油供需失衡', type: 'trend', role: 'indicator' }],
  [{ text: 'GDP增速不及预期', type: 'metric', role: 'negative_intent' }, { text: '消费者信心下滑', type: 'metric', role: 'indicator' }],
  [{ text: '地缘冲突升级', type: 'event', role: 'cause' }, { text: '供应链中断风险', type: 'trend', role: 'negative_intent' }],
  [{ text: 'AI资本开支超预期', type: 'metric', role: 'positive_intent' }, { text: 'AI芯片需求激增', type: 'trend', role: 'cause' }],
  [{ text: '美元强势', type: 'metric', role: 'cause' }, { text: '新兴市场资本外流', type: 'trend', role: 'indicator' }],
  [{ text: '欧元区PMI持续萎缩', type: 'metric', role: 'negative_intent' }, { text: '欧央行降息预期', type: 'trend', role: 'cause' }],
]

// ══════════════════════════════════════════════════════════════
// 数据模板：RELEVANCE_REASONING_TEMPLATES（因果推理模板）— UAP v3.0
// ══════════════════════════════════════════════════════════════
// 每条与对应 RATIONALE_TEMPLATES 配对，说明为何此证据与任务直接相关
const RELEVANCE_REASONING_TEMPLATES = [
  'CPI持续回落直接降低加息预期，是资产价格重新定价的先行指标，与任务高度相关。',
  '就业数据走弱是美联储政策转向的触发条件，对利率敏感资产有直接影响。',
  'FOMC内部鸽派票数超鹰派是政策转向的直接信号，影响短端利率定价。',
  '收益率曲线倒挂收窄意味着衰退预期降低，对风险资产是正面驱动。',
  'OPEC+减产直接影响原油供给，是通胀传导路径的关键节点。',
  'GDP低于预期且消费者信心下滑，表明经济软着陆窗口收窄，增加尾部风险。',
  '地缘冲突导致供应链中断，是影响能源和商品价格的外生冲击因素。',
  'AI资本开支超预期说明科技需求端强劲，支撑相关板块基本面。',
  '新兴市场资金外流加剧美元需求，对全球流动性形成紧缩压力。',
  '欧元区PMI持续萎缩迫使欧央行提前降息，带来全球流动性边际宽松。',
  '减半历史规律显示供应冲击效应明确，是价格周期的结构性驱动因素。',
  '半导体库存去化完成叠加AI需求，是板块盈利拐点的直接确认信号。',
  '日本央行政策调整影响全球套利资金流向，对美债需求有直接冲击。',
  '中国出口下降反映全球需求疲软，对大宗商品和新兴市场是负向信号。',
  '商业地产违约率上升威胁区域银行资产质量，是金融系统性风险的早期信号。',
  '印度制造业承接转移趋势明确，对全球供应链重构有长期结构性影响。',
  '先进制程产能预订排至2026年证明供需紧张非周期性，是板块定价重估的锚点。',
  '美国页岩油产量创新高抵消OPEC减产效果，供需博弈将压制价格天花板。',
  '逆回购余额下降至低位意味着银行体系超额流动性减少，是紧缩尾声的确认信号。',
  '机构净流入120亿美元直接证明需求端真实存在，是价格趋势的基本面支撑。',
  '历史降息周期类比提供概率校准框架，当前时间节点与政策转向高度相关。',
  '极端悲观情绪是均值回归的反向信号，与任务直接相关。',
  '科技脱钩加速重构供应链成本结构，影响科技类资产的长期估值中枢。',
  '低波动率是市场低估尾部风险的信号，提示需要修正仓位配置。',
  'ESG资产重估是机构配置变化的结构性来源，对相关资产价格有长期影响。',
  '货币政策背离预示汇率波动窗口开启，外汇敏感资产面临重新定价。',
  'AI提升服务业生产率是通胀长期下行的结构性因素，与利率路径直接相关。',
  '财政赤字扩大削弱美债信用，是实际利率面临长期下行压力的根本原因。',
  '首次降息前6个月市场提前定价的历史规律是当前仓位布局的量化依据。',
  '制造业回流使中国出口面临结构性压力，这是任务相关板块的长期负向因素。',
]

// ══════════════════════════════════════════════════════════════
// 数据模板：USER_PERSONA_TEMPLATES（用户画像模板）
// ══════════════════════════════════════════════════════════════
// 说明：10 种预设的用户画像，模拟不同背景的 Agent
// 字段：occupation, gender, age_range, interests, region, education, income_level,
//       investment_experience, consumption_style, information_sources
// 用途：让预测数据更加多样化和真实化
const USER_PERSONA_TEMPLATES = [
  { occupation: 'finance', gender: 'male', age_range: '35-45', interests: ['宏观经济', '债券'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '10y+', risk_appetite: 'moderate', consumption_style: 'rational', information_sources: ['彭博', '路透社'] },
  { occupation: 'technology', gender: 'female', age_range: '28-35', interests: ['AI', '科技股'], region: 'east_asia', education: 'phd', income_level: 'high', investment_experience: '5-10y', risk_appetite: 'high', consumption_style: 'innovative', information_sources: ['财新', '科技媒体'] },
  { occupation: 'government', gender: 'male', age_range: '45-55', interests: ['地缘政治', '能源'], region: 'europe', education: 'master', income_level: 'middle', investment_experience: '10y+', risk_appetite: 'low', consumption_style: 'rational', information_sources: ['FT', 'Economist'] },
  { occupation: 'academic', gender: 'female', age_range: '38-48', interests: ['行为经济学', '市场'], region: 'north_america', education: 'phd', income_level: 'middle', investment_experience: '5-10y', risk_appetite: 'moderate', consumption_style: 'analytical', information_sources: ['学术期刊', 'NBER'] },
  { occupation: 'finance', gender: 'male', age_range: '30-40', interests: ['固收', '利率'], region: 'north_america', education: 'master', income_level: 'high', investment_experience: '5-10y', risk_appetite: 'moderate', consumption_style: 'rational', information_sources: ['CME', '美联储公告'] },
  { occupation: 'entrepreneur', gender: 'male', age_range: '32-42', interests: ['创投', '量化'], region: 'east_asia', education: 'bachelor', income_level: 'high', investment_experience: '5-10y', risk_appetite: 'high', consumption_style: 'aggressive', information_sources: ['社交媒体', '量化信号'] },
  { occupation: 'finance', gender: 'female', age_range: '40-50', interests: ['货币政策', '汇率'], region: 'europe', education: 'master', income_level: 'high', investment_experience: '10y+', risk_appetite: 'low', consumption_style: 'analytical', information_sources: ['ECB', 'IMF'] },
  { occupation: 'energy', gender: 'male', age_range: '40-50', interests: ['原油', 'OPEC'], region: 'middle_east', education: 'master', income_level: 'high', investment_experience: '10y+', risk_appetite: 'moderate', consumption_style: 'commodity', information_sources: ['OPEC报告', 'EIA数据'] },
  { occupation: 'technology', gender: 'female', age_range: '26-36', interests: ['AI金融', '算法交易'], region: 'north_america', education: 'phd', income_level: 'high', investment_experience: '3-5y', risk_appetite: 'high', consumption_style: 'quantitative', information_sources: ['arXiv', '算法研究'] },
  { occupation: 'finance', gender: 'male', age_range: '42-52', interests: ['房地产', '利率敏感'], region: 'east_asia', education: 'master', income_level: 'high', investment_experience: '10y+', risk_appetite: 'low', consumption_style: 'asset_heavy', information_sources: ['房地产数据', '银行报告'] },
]

// ══════════════════════════════════════════════════════════════
// 数据模板：PROBABILITY_DISTRIBUTIONS（概率分布）
// ══════════════════════════════════════════════════════════════
// 说明：20 个预设的概率值，范围 0.38-0.78
// 特点：略偏多头（平均值 > 0.5），模拟真实市场情绪
// 用途：循环使用这些概率值生成预测
const PROBABILITY_DISTRIBUTIONS = [
  0.72, 0.68, 0.65, 0.61, 0.58, 0.55, 0.52, 0.48, 0.45, 0.42,
  0.78, 0.74, 0.70, 0.63, 0.60, 0.57, 0.53, 0.50, 0.47, 0.38,
]

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log(`[test/upload-batch] ▶ POST called at ${timestamp}`)
  try {
    // ══════════════════════════════════════════════════════════════
    // Step 1: 解析请求参数
    // ══════════════════════════════════════════════════════════════
    const body = await request.json()
    const { task_id, batch_index, agents, task_title } = body

    console.log('[test/upload-batch] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[test/upload-batch] 📥 Request params:')
    console.log('[test/upload-batch]   task_id:', task_id)
    console.log('[test/upload-batch]   batch_index:', batch_index)
    console.log('[test/upload-batch]   agents count:', agents?.length)
    console.log('[test/upload-batch]   task_title:', task_title || '(not provided)')

    // ══════════════════════════════════════════════════════════════
    // Step 2: 参数验证
    // ══════════════════════════════════════════════════════════════
    // 必需字段：task_id, agents
    if (!task_id || !agents || agents.length === 0) {
      console.error('[test/upload-batch] ❌ Validation failed: Missing required fields')
      console.error('[test/upload-batch]   task_id present:', !!task_id)
      console.error('[test/upload-batch]   agents present:', !!agents)
      console.error('[test/upload-batch]   agents.length:', agents?.length || 0)
      return NextResponse.json({ error: 'Missing task_id or agents' }, { status: 400 })
    }

    // ══════════════════════════════════════════════════════════════
    // Step 3: 初始化 Supabase 客户端
    // ══════════════════════════════════════════════════════════════
    // 说明：使用 service role key，绕过 RLS 限制
    // 原因：模拟测试需要批量插入数据，不受用户权限限制
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify task exists and is active
    console.log('[test/upload-batch] 🔍 Verifying task...')
    const { data: task, error: taskErr } = await supabase
      .from('prediction_tasks')
      .select('id, title, status')
      .eq('id', task_id)
      .single()

    if (!task) {
      console.error('[test/upload-batch] ❌ Task not found')
      console.error('[test/upload-batch]   Error:', taskErr?.message)
      console.error('[test/upload-batch]   task_id:', task_id)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    console.log('[test/upload-batch] ✓ Task found:')
    console.log('[test/upload-batch]   Title:', task.title)
    console.log('[test/upload-batch]   Status:', task.status)
    console.log('[test/upload-batch]   ID:', task.id)

    if (task.status !== 'active' && task.status !== 'pending') {
      console.error('[test/upload-batch] ❌ Task status validation failed')
      console.error('[test/upload-batch]   Current status:', task.status)
      console.error('[test/upload-batch]   Allowed statuses: active, pending')
      return NextResponse.json({ error: `Task status is ${task.status}, cannot simulate` }, { status: 400 })
    }
    console.log('[test/upload-batch] ✓ Task status valid for simulation')

    // Build batch submissions (30 per batch, randomly sampled agents for variable signal count)
    const batchSize = 30
    const startIdx = batch_index * batchSize
    // Random selection: each slot picks a random agent, allowing same agent to appear multiple times
    const actualBatch = Array.from({ length: batchSize }, () =>
      agents[Math.floor(Math.random() * agents.length)]
    )

    const now = new Date()
    const submissions = actualBatch.map((agent: { id: string; username: string }, idx: number) => {
      const globalIdx = startIdx + idx
      const rationaleIdx = Math.floor(Math.random() * RATIONALE_TEMPLATES.length)
      const entityIdx = Math.floor(Math.random() * ENTITY_TAG_SETS.length)
      const personaIdx = Math.floor(Math.random() * USER_PERSONA_TEMPLATES.length)
      const isHardFact = Math.random() > 0.33 // ~2/3 hard facts, 1/3 persona inference

      // Stagger submitted_at to satisfy uniqueness constraint
      const submittedAt = new Date(now.getTime() + idx * 1000 + batch_index * 100000)

      const signalId = `sig_${agent.id.replace(/-/g, '').slice(0, 8)}_${globalIdx}`
      const reasoningIdx = Math.floor(Math.random() * RELEVANCE_REASONING_TEMPLATES.length)
      // UAP v3: source_type mapped to valid enum values
      const hardSources = ['web_news', 'web_search', 'local_document']
      const personaSources = ['local_chat', 'local_email', 'behavior_pattern', 'user_profile']
      const sourceType = isHardFact
        ? hardSources[Math.floor(Math.random() * hardSources.length)]
        : personaSources[Math.floor(Math.random() * personaSources.length)]
      const dataExclusivity = isHardFact ? 'public' : (Math.random() < 0.33 ? 'private' : 'semi_private')
      // UAP v3: observed_at staggered within last 30 days
      const daysAgo = globalIdx % 30
      const observedAt = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000).toISOString()
      return {
        task_id,
        user_id: agent.id,
        status: 'submitted',
        signals: [{
          signal_id: signalId,
          evidence_type: isHardFact ? 'hard_fact' : 'persona_inference',
          evidence_text: RATIONALE_TEMPLATES[rationaleIdx],
          relevance_score: 0.5 + (globalIdx % 5) * 0.1,
          relevance_reasoning: RELEVANCE_REASONING_TEMPLATES[reasoningIdx],
          source_type: sourceType,
          data_exclusivity: dataExclusivity,
          observed_at: observedAt,
          entity_tags: ENTITY_TAG_SETS[entityIdx],
          source_urls: isHardFact ? [`https://data.source.sim/${entityIdx}`] : [],
        }],
        user_persona: USER_PERSONA_TEMPLATES[personaIdx],
        submitted_at: submittedAt.toISOString(),
      }
    })

    console.log('[test/upload-batch] 💾 Inserting signal submissions into database...')
    console.log('[test/upload-batch]   Submissions to insert:', submissions.length)

    // ══════════════════════════════════════════════════════════════
    // Step 8: 插入数据库
    // ══════════════════════════════════════════════════════════════
    // 表：signal_submissions
    // 操作：批量插入
    // 权限：使用 service role key，绕过 RLS 限制
    const { data: inserted, error: insertErr } = await supabase
      .from('signal_submissions')
      .insert(submissions)
      .select('id')

    if (insertErr) {
      console.error('[test/upload-batch] ❌ Database insert failed')
      console.error('[test/upload-batch]   Error message:', insertErr.message)
      console.error('[test/upload-batch]   Error details:', insertErr.details)
      console.error('[test/upload-batch]   Error hint:', insertErr.hint)
      console.error('[test/upload-batch]   Submissions count:', submissions.length)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
    console.log('[test/upload-batch] ✅ Insert successful')
    console.log('[test/upload-batch]   Rows inserted:', inserted?.length || 0)

    // ══════════════════════════════════════════════════════════════
    // 参与者阈值检查 → 触发因果推理（与 /api/agent/signals 行为一致）
    // ══════════════════════════════════════════════════════════════
    const { data: taskState } = await supabase
      .from('prediction_tasks')
      .select('current_participant_count, target_agent_count, causal_analysis_status')
      .eq('id', task_id)
      .single()

    if (
      taskState?.target_agent_count &&
      taskState.current_participant_count >= taskState.target_agent_count &&
      !['processing', 'pending'].includes(taskState.causal_analysis_status ?? '')
    ) {
      const backendApiUrl = process.env.BACKEND_API_URL
      if (backendApiUrl) {
        console.log('[test/upload-batch] 🚀 Participant threshold reached, triggering causal analysis...')
        fetch(`${backendApiUrl}/api/causal-analysis/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id }),
        }).catch(err => console.warn('[test/upload-batch] Failed to trigger causal analysis:', err))
      }
    }

    // ══════════════════════════════════════════════════════════════
    // Step 9: 统计总提交数
    // ══════════════════════════════════════════════════════════════
    // 说明：查询该 task 的总提交数，用于前端进度显示
    console.log('[test/upload-batch] 📊 Counting total submissions...')
    const { count: totalCount, error: countErr } = await supabase
      .from('signal_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', task_id)

    if (countErr) {
      console.error('[test/upload-batch] ⚠️ Count query failed:', countErr.message)
    } else {
      console.log('[test/upload-batch]   Total submissions for task:', totalCount)
    }

    console.log('[test/upload-batch] ✅ Batch upload complete')
    console.log('[test/upload-batch] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // ══════════════════════════════════════════════════════════════
    // Step 10: 返回结果
    // ══════════════════════════════════════════════════════════════
    // 返回：插入数量 + 市场总提交数
    return NextResponse.json({
      success: true,
      inserted: inserted?.length || 0,
      total_submissions: totalCount || 0,
      batch_index,
    })
  } catch (error) {
    console.error('[test/upload-batch] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('[test/upload-batch] ❌ UNEXPECTED ERROR')
    console.error('[test/upload-batch]   Error type:', error?.constructor?.name)
    console.error('[test/upload-batch]   Error message:', error)
    console.error('[test/upload-batch]   Stack:', error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
