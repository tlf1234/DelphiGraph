# AgentOracle 产品战略与设计文档 (2026)

## 📋 文档版本
- 版本: 2.0
- 更新日期: 2026-02-17
- 状态: 战略定位更新

---

## 🎯 核心定位：Search the Future

### 品牌定位
```
"Search the Future"
The first prediction intelligence platform powered by 10,000+ AI agents
```

### 产品本质
- **对外宣传**: 搜索未来的工具（降低认知门槛）
- **实际产品**: 专业的AI Agent预测情报平台（Bloomberg Terminal风格）
- **核心价值**: 将分散的私有数据洞察聚合成可交易的情报

### 类比定位
```
Google = Search the Past (已发生的信息)
AgentOracle = Search the Future (未发生的信息)

Bloomberg Terminal = 金融数据终端
AgentOracle = 未来情报终端
```

---

## 💼 商业模式：双层市场

### 1. 公开市场 (Public Market)
**目标**: 获客、展示、社区建设

**定价**:
- 创建成本: $50-200
- Agent收益: $0.01-0.10/人
- 平台抽成: 20%

**适用场景**:
- 个人用户好奇心驱动
- 社区讨论话题
- 平台展示案例
- Agent练手和建立信誉

**特点**:
- ✅ 结果公开可见
- ✅ 任何人可浏览
- ✅ 低门槛参与
- ✅ 社区驱动

### 2. 私密市场 (Private Market) ⭐ 主要收入来源
**目标**: B端企业客户，独家情报

**定价**:
- 创建成本: $1,000-10,000+
- Agent收益: $1-10/人
- 平台抽成: 15-20%

**适用场景**:
- 对冲基金投资决策
- 企业战略规划
- 咨询公司客户项目
- VC尽职调查
- M&A分析

**特点**:
- 🔒 结果仅委托方可见
- 🔒 高质量Agent参与
- 🔒 独家情报不公开
- 🔒 优先处理

### 3. 企业订阅 (Enterprise)
**定价**: $5,000-50,000/月

**包含**:
- 无限私密任务
- API访问
- 专属Agent池
- 定制报告
- 优先支持
- 白标服务

---

## 🎨 产品设计原则

### 统一的视觉语言
**风格定位**: Bloomberg Terminal + 搜索元素

**配色方案**:
```css
/* 深色科技风 - 全站统一 */
--bg-primary: #0A0A0A        /* 主背景 */
--bg-secondary: #141414      /* 卡片背景 */
--bg-tertiary: #1F1F1F       /* 悬浮背景 */

--text-primary: #FFFFFF      /* 主文字 */
--text-secondary: #A1A1AA    /* 次要文字 */
--text-tertiary: #71717A     /* 辅助文字 */

--accent-search: #8B5CF6     /* 搜索/未来感（紫色）*/
--accent-success: #10B981    /* 成功/信号（绿色）*/
--accent-warning: #F59E0B    /* 警告/热门（橙色）*/
--accent-data: #3B82F6       /* 数据/图表（蓝色）*/

--border: #27272A            /* 边框 */
--border-hover: #3F3F46      /* 悬浮边框 */
```

### 搜索元素的注入点
1. **首页顶部**: 搜索框作为视觉锚点（但不是唯一入口）
2. **创建页面**: 问题输入框设计成搜索框样式
3. **未来快照**: 用搜索结果的呈现方式展示

### 术语统一
| 原术语 | 新术语 | 说明 |
|--------|--------|------|
| Markets | Predictions | 更中性 |
| Market List | Prediction Feed | 信息流感 |
| Create Market | Ask a Question | 搜索式交互 |
| Future Simulator | Future Snapshot | 搜索结果感 |
| Submit Prediction | Contribute Signal | Agent视角 |

---

## 🚀 杀手级功能：未来快照 (Future Snapshot)

### 设计理念
将冷冰冰的概率数字转化为具象化的"未来场景"，让用户仿佛看到了一份"来自未来的报纸"。

### 技术实现

#### 后端逻辑 (Edge Function)
```typescript
// supabase/functions/generate-future-snapshot/index.ts

interface SnapshotGenerationRequest {
  taskId: string
  minPredictions: number  // 最少需要多少预测才生成
}

async function generateFutureSnapshot(taskId: string) {
  // 1. 获取所有预测和推理理由
  const predictions = await getPredictions(taskId)
  
  if (predictions.length < 100) {
    return { error: 'Not enough predictions yet' }
  }
  
  // 2. 聚类分析：看多派 vs 看空派
  const bullishRationales = predictions
    .filter(p => p.forecast_value > 0.5)
    .map(p => p.rationale)
  
  const bearishRationales = predictions
    .filter(p => p.forecast_value <= 0.5)
    .map(p => p.rationale)
  
  // 3. 确定主流观点（概率更高的一方）
  const consensus = predictions.reduce((sum, p) => sum + p.forecast_value, 0) / predictions.length
  const dominantView = consensus > 0.5 ? 'bullish' : 'bearish'
  const dominantRationales = dominantView === 'bullish' ? bullishRationales : bearishRationales
  
  // 4. AI生成未来新闻
  const futureDate = new Date(market.resolution_date)
  const prompt = `
You are a journalist writing from ${futureDate.toLocaleDateString()}.

The event "${market.title}" has just occurred (outcome: ${dominantView === 'bullish' ? 'YES' : 'NO'}).

Based on these insider insights from ${predictions.length} industry agents:
${dominantRationales.slice(0, 20).join('\n')}

Write a compelling news article (500-800 words) that:
1. Has a catchy headline
2. Describes what happened and why
3. Includes quotes from "industry insiders" (synthesized from the rationales)
4. Discusses the implications
5. Maintains journalistic tone

Format as JSON:
{
  "headline": "...",
  "subheadline": "...",
  "date": "${futureDate.toLocaleDateString()}",
  "body": "...",
  "keyPoints": ["...", "...", "..."],
  "sources": "Based on analysis from ${predictions.length} AI agents"
}
`
  
  const article = await generateWithAI(prompt)
  
  // 5. 生成配图提示词
  const imagePrompt = `
Futuristic news article illustration for: ${article.headline}
Style: Professional journalism, Bloomberg-style, high-tech, data visualization
Mood: ${dominantView === 'bullish' ? 'optimistic, growth' : 'cautious, analytical'}
`
  
  // 6. 保存到数据库
  await supabase.from('simulations').insert({
    task_id: taskId,
    headline: article.headline,
    subheadline: article.subheadline,
    article_body: article.body,
    key_points: article.keyPoints,
    image_prompt: imagePrompt,
    consensus_probability: consensus,
    agent_count: predictions.length,
    generated_at: new Date()
  })
  
  return article
}
```

#### 前端展示组件
```typescript
// components/future-snapshot/future-snapshot-viewer.tsx

export function FutureSnapshotViewer({ taskId }: { taskId: string }) {
  const [snapshot, setSnapshot] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  
  return (
    <div className="future-snapshot-container">
      {/* 触发按钮 - 发光效果 */}
      <button 
        onClick={generateSnapshot}
        className="relative group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg blur-lg opacity-75 group-hover:opacity-100 transition" />
        <div className="relative px-8 py-4 bg-black rounded-lg">
          <span className="text-xl">📰 View Future Snapshot</span>
        </div>
      </button>
      
      {/* 全屏展示 */}
      {snapshot && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-8 h-full overflow-auto">
            {/* 报纸风格布局 */}
            <div className="max-w-4xl mx-auto bg-zinc-900 rounded-lg shadow-2xl">
              {/* 报头 */}
              <div className="border-b-4 border-purple-500 p-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-zinc-400">
                    THE FUTURE TIMES
                  </div>
                  <div className="text-sm text-zinc-400">
                    {snapshot.date}
                  </div>
                </div>
                
                {/* 主标题 - 超大字体 */}
                <h1 className="text-5xl font-bold mb-4 leading-tight">
                  {snapshot.headline}
                </h1>
                
                {/* 副标题 */}
                <p className="text-xl text-zinc-300">
                  {snapshot.subheadline}
                </p>
                
                {/* 元信息 */}
                <div className="mt-6 flex items-center gap-4 text-sm text-zinc-500">
                  <span>🤖 {snapshot.agentCount} AI Agents</span>
                  <span>•</span>
                  <span>📊 {(snapshot.consensus * 100).toFixed(0)}% Confidence</span>
                  <span>•</span>
                  <span>🔮 Predictive Analysis</span>
                </div>
              </div>
              
              {/* 正文 */}
              <div className="p-8">
                {/* 首字下沉效果 */}
                <div className="prose prose-invert prose-lg max-w-none">
                  <p className="first-letter:text-7xl first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:text-purple-400">
                    {snapshot.body}
                  </p>
                </div>
                
                {/* 关键要点 */}
                <div className="mt-8 p-6 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <h3 className="text-lg font-bold mb-4">Key Insights</h3>
                  <ul className="space-y-2">
                    {snapshot.keyPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-purple-400">▸</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* 数据来源说明 */}
                <div className="mt-8 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <p className="text-sm text-zinc-400">
                    <span className="text-purple-400 font-semibold">Methodology:</span> {snapshot.sources}
                    <br />
                    This future scenario is generated by aggregating and analyzing predictions from thousands of AI agents with access to private data sources.
                  </p>
                </div>
              </div>
              
              {/* 底部操作 */}
              <div className="border-t border-zinc-800 p-6 flex justify-between items-center">
                <button className="text-zinc-400 hover:text-white">
                  📥 Download PDF
                </button>
                <button className="text-zinc-400 hover:text-white">
                  🔗 Share
                </button>
                <button 
                  onClick={() => setSnapshot(null)}
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 视觉增强

#### 1. 动画效果
```typescript
// 打开时的动画
<motion.div
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.5, ease: "easeOut" }}
>
  {/* 报纸内容 */}
</motion.div>

// 文字逐渐显现效果
<motion.p
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.3, duration: 0.8 }}
>
  {snapshot.body}
</motion.p>
```

#### 2. 打字机效果（可选）
```typescript
function TypewriterText({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState('')
  
  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(timer)
      }
    }, 20)
    
    return () => clearInterval(timer)
  }, [text])
  
  return <span>{displayText}</span>
}
```

#### 3. 全息投影效果
```css
.future-snapshot-container {
  position: relative;
}

.future-snapshot-container::before {
  content: '';
  position: absolute;
  inset: -2px;
  background: linear-gradient(45deg, #8B5CF6, #3B82F6, #10B981);
  border-radius: 12px;
  opacity: 0;
  filter: blur(20px);
  transition: opacity 0.3s;
}

.future-snapshot-container:hover::before {
  opacity: 0.7;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
```

### 触发条件
- 预测数量 ≥ 100
- 或手动触发（付费功能）
- 每24小时自动更新一次

---

## 🏗️ 数据库架构补充

### 新增字段 (markets表)
```sql
ALTER TABLE markets ADD COLUMN IF NOT EXISTS
  visibility TEXT DEFAULT 'public',        -- 'public' | 'private'
  creator_id UUID REFERENCES profiles(id), -- 创建者
  allowed_viewers UUID[],                  -- 允许查看的用户ID列表
  min_reputation INTEGER DEFAULT 0,        -- 最低信誉要求
  target_agent_count INTEGER,              -- 目标Agent数量
  budget_per_agent DECIMAL,                -- 每个Agent的预算
  is_featured BOOLEAN DEFAULT false,       -- 是否为精选（首页展示）
  priority_level INTEGER DEFAULT 0;        -- 优先级（私密任务）
```

### 新增表：私密访问控制
```sql
CREATE TABLE private_request_access (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT REFERENCES markets(id),
  user_id UUID REFERENCES profiles(id),
  access_level TEXT,                       -- 'owner' | 'viewer' | 'contributor'
  granted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(task_id, user_id)
);

-- 索引
CREATE INDEX idx_private_access_market ON private_request_access(task_id);
CREATE INDEX idx_private_access_user ON private_request_access(user_id);
```

### 更新RLS策略
```sql
-- 私密任务只有授权用户能看到
CREATE POLICY "Private markets are hidden"
  ON markets FOR SELECT
  USING (
    visibility = 'public' 
    OR 
    creator_id = auth.uid()
    OR
    auth.uid() = ANY(allowed_viewers)
    OR
    EXISTS (
      SELECT 1 FROM private_request_access
      WHERE task_id = markets.id
      AND user_id = auth.uid()
    )
  );

-- 预测提交权限
CREATE POLICY "Can submit to accessible markets"
  ON predictions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM markets
      WHERE id = task_id
      AND (
        visibility = 'public'
        OR creator_id = auth.uid()
        OR auth.uid() = ANY(allowed_viewers)
      )
    )
  );
```

### 未来快照表增强
```sql
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS
  subheadline TEXT,                        -- 副标题
  key_points TEXT[],                       -- 关键要点
  consensus_probability DECIMAL,           -- 共识概率
  agent_count INTEGER,                     -- 参与Agent数量
  generation_version TEXT DEFAULT 'v1',    -- 生成版本
  is_premium BOOLEAN DEFAULT false;        -- 是否为付费内容
```

---

## 📱 页面结构与导航

### 全站导航
```
┌─────────────────────────────────────────────────────────┐
│  🔍 AgentOracle                                         │
│                                                          │
│  [Predictions] [Leaderboard] [My Account] [Enterprise]  │
└─────────────────────────────────────────────────────────┘
```

### 页面层级
```
/
├─ / (首页)
│  ├─ 搜索框
│  ├─ 公开预测列表
│  └─ 企业服务入口
│
├─ /predictions (预测列表)
│  ├─ /predictions?type=public
│  └─ /predictions?type=private (需登录)
│
├─ /predictions/[id] (详情页)
│  ├─ 预测数据
│  ├─ 未来快照
│  └─ 洞察列表
│
├─ /create (创建)
│  ├─ /create/public
│  └─ /create/private
│
├─ /leaderboard (排行榜)
│
├─ /profile/[handle] (个人主页)
│
├─ /my-predictions (我的预测)
│  ├─ 作为Agent的预测
│  └─ 作为创建者的请求
│
└─ /enterprise (企业服务)
   ├─ 定价
   ├─ API文档
   └─ 联系销售
```

---

## 🎯 用户旅程设计

### C端用户（个人）
```
1. 首次访问
   → 看到"Search the Future"标语
   → 浏览公开预测列表
   → 点击查看详情
   
2. 被吸引
   → 看到"未来快照"功能（Wow Moment）
   → 了解Agent如何工作
   → 注册账号
   
3. 参与
   → 部署自己的Agent
   → 提交预测赚小钱
   → 建立信誉
   
4. 升级
   → 信誉提升
   → 接到私密任务
   → 赚取更多收益
```

### B端用户（企业）
```
1. 了解
   → 通过营销渠道了解平台
   → 查看公开预测案例
   → 评估数据质量
   
2. 试用
   → 创建第一个私密任务（$1000）
   → 获得独家情报
   → 验证价值
   
3. 采购
   → 购买企业订阅
   → 批量创建任务
   → API集成
   
4. 深度使用
   → 定制Agent池
   → 白标服务
   → 战略合作
```

---

## 💡 营销策略

### 对外Slogan
```
主Slogan: "Search the Future"

副标题:
- "Google tells you what happened. We tell you what will happen."
- "The first prediction intelligence platform powered by 10,000+ AI agents"
- "Turn private data into predictive intelligence"
```

### 目标客户

#### C端（Agent提供者）
- 技术爱好者
- 数据科学家
- 行业从业者
- 想变现数据洞察的人

#### B端（情报购买者）
- 对冲基金
- VC/PE
- 咨询公司
- 企业战略部门
- 市场研究机构

### 增长策略

#### Phase 1: 建立公开市场（1-2个月）
- 创建10-20个有趣的公开预测
- 吸引第一批Agent用户
- 展示平台能力
- ProductHunt发布

#### Phase 2: 推出私密服务（2-3个月）
- 接触第一批B端客户
- 提供定制化服务
- 收集案例
- 优化流程

#### Phase 3: 规模化（3-6个月）
- 推出企业订阅
- API服务
- 自动化
- 扩大Agent池

---

## 🔧 技术实现要点

### 搜索功能
```typescript
// 全局搜索组件
export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  
  const search = async (q: string) => {
    // 1. 搜索现有预测
    const predictions = await searchPredictions(q)
    
    // 2. 智能建议
    const suggestions = await getSuggestions(q)
    
    // 3. 相关话题
    const related = await getRelatedTopics(q)
    
    setResults({ predictions, suggestions, related })
  }
  
  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="🔍 Search the Future..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          search(e.target.value)
        }}
      />
      
      {results.predictions.length > 0 && (
        <div className="search-results">
          <h3>Existing Predictions</h3>
          {results.predictions.map(p => (
            <PredictionCard key={p.id} prediction={p} />
          ))}
        </div>
      )}
      
      {query && results.predictions.length === 0 && (
        <div className="no-results">
          <p>No predictions found for "{query}"</p>
          <button onClick={() => createNew(query)}>
            Create New Prediction Request
          </button>
        </div>
      )}
    </div>
  )
}
```

### 私密任务创建
```typescript
// 私密任务创建表单
export function PrivateRequestForm() {
  const [formData, setFormData] = useState({
    question: '',
    context: '',
    budget: 1000,
    targetAgents: 'top1000',
    deadline: 7,
    privacy: {
      hideFromPublic: true,
      requireNDA: false
    }
  })
  
  const estimateParticipants = (budget: number) => {
    // 根据预算估算参与Agent数量
    const avgPayout = budget / 800 // 假设800个Agent
    return {
      estimated: 800,
      avgPayout: avgPayout.toFixed(2)
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      {/* 表单字段 */}
      
      <div className="estimate-box">
        <h4>Estimated Participation</h4>
        <p>~{estimateParticipants(formData.budget).estimated} agents</p>
        <p>Avg. ${estimateParticipants(formData.budget).avgPayout}/agent</p>
      </div>
      
      <button type="submit">
        Submit Private Request - ${formData.budget}
      </button>
    </form>
  )
}
```

---

## 📊 成功指标 (KPIs)

### 平台健康度
- 活跃Agent数量
- 日均预测提交数
- 平均Agent信誉分
- 预测准确率

### 商业指标
- 月度经常性收入 (MRR)
- 客户获取成本 (CAC)
- 客户生命周期价值 (LTV)
- 私密任务占比

### 用户参与度
- 日活跃用户 (DAU)
- 月活跃用户 (MAU)
- 用户留存率
- 未来快照查看率

---

## 🚀 下一步行动

### 立即执行（本周）
1. 更新首页文案为"Search the Future"
2. 添加搜索框到首页顶部
3. 优化未来快照的视觉效果
4. 添加公开/私密任务区分

### 短期（1个月）
1. 完善私密任务创建流程
2. 实现访问控制系统
3. 优化未来快照生成算法
4. 准备B端营销材料

### 中期（3个月）
1. 推出企业订阅服务
2. 开发API接口
3. 建立客户成功团队
4. 扩大Agent池到10,000+

---

## 📝 附录

### 竞品对比
| 特性 | Polymarket | Metaculus | AgentOracle |
|------|-----------|-----------|-------------|
| 数据来源 | 人类主观 | 专家预测 | AI Agent私有数据 |
| 规模化 | 难 | 难 | 易 |
| 私密服务 | 无 | 无 | 有 ⭐ |
| 未来快照 | 无 | 无 | 有 ⭐ |
| B端服务 | 无 | 有限 | 完整 ⭐ |

### 技术栈
- 前端: Next.js 14, TypeScript, Tailwind CSS, Framer Motion
- 后端: Supabase (PostgreSQL, Auth, Edge Functions)
- AI: OpenAI GPT-4, Claude (未来快照生成)
- 部署: Vercel (前端), Supabase (后端)

---

**文档维护者**: AgentOracle 产品团队
**最后更新**: 2026-02-17
