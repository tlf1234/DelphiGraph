# DelphiGraph 因果逻辑图引擎 — Part 3: 未来报纸、前端可视化、DB/API/路线图

> 接续 [Part 2](./CAUSAL-GRAPH-ENGINE-PART2.md)

---

## 7. 模块五：未来报纸生成引擎

### 7.1 设计理念

> **借鉴 MiroFish**: `ReportAgent` 的 ReACT 模式（规划大纲→分段生成→工具调用→反思）+ `ZepToolsService` 的图谱检索工具（InsightForge/PanoramaSearch/QuickSearch）。  
> **核心差异**: 生成的不是仿真报告，而是**未来报纸**——基于因果逻辑图的叙事预测报告，必须包含置信区间、证据类型分布、少数派警告。

### 7.2 报告 Agent 架构

```python
# backend/causal_engine/newspaper/future_newspaper_agent.py

class FutureNewspaperAgent:
    """
    未来报纸生成 Agent（ReACT 模式）

    借鉴 MiroFish ReportAgent:
    - 大纲规划 → 逐段生成 → 完整组装
    - 生成过程中可调用工具查询图谱
    - ReportLogger 记录生成过程日志

    工具集:
    1. query_factor(factor_name) — 查询特定因子的证据详情
    2. get_critical_path() — 获取关键因果路径
    3. get_minority_signals() — 获取少数派异见信号
    4. get_evidence_stats() — 获取证据统计
    5. get_evidence_by_id(signal_id) — 查看特定证据原文（端侧已脱敏）
    """

    NEWSPAPER_SYSTEM_PROMPT = """你是一位顶级财经主编，正在撰写《未来报纸》深度分析报告。

## 写作规范
1. **标题**: 醒目、具体（华尔街日报风格）
2. **核心洞察**: 首段一句话结论，标注基于多少真实节点的证据聚合
3. **关键驱动因子**: 2-4段详述最重要的因果链，引用具体证据
4. **少数派警告**: 独立段落，异见信号及其潜在影响
5. **置信区间**: 结尾给出预测区间和概率分布
6. **证据声明**: 文末标注硬核事实/画像推演比例

## 语言风格
- 严谨但可读，用具体数字说话
- 引用证据时注明来源类型（硬核事实/画像推演）
- 不使用夸张修辞，保持中立
- 少数派警告用醒目标记"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client
```

### 7.3 生成流程

```python
    async def generate(self, graph: CausalGraph, market_description="") -> Dict:
        """
        生成未来报纸

        Returns:
            {
              "headline": "标题",
              "subtitle": "副标题",
              "body_sections": [{ "title": "...", "content": "...", "evidence_type": "..." }],
              "body_markdown": "完整正文（Markdown）",
              "key_insights": ["洞察1", ...],
              "minority_alert": { "has_alert": bool, "text": "..." },
              "confidence_statement": "置信声明",
              "evidence_declaration": { "total": N, "hard_facts": M, "persona": K, "ratio": "..." },
              "metadata": { "generated_at": "...", "graph_version": N, "model": "..." }
            }
        """
        # Phase 1: 规划大纲
        outline = await self._plan_outline(graph, market_description)

        # Phase 2: 逐段生成（每段可调用工具查询因果图）
        sections = []
        for section_plan in outline.get("sections", []):
            content = await self._generate_section(graph, section_plan)
            sections.append(content)

        # Phase 3: 生成少数派警告段
        minority_alert = await self._generate_minority_alert(graph)

        # Phase 4: 生成置信声明
        confidence_stmt = self._build_confidence_statement(graph)

        # Phase 5: 组装
        return self._assemble(outline, sections, minority_alert, confidence_stmt, graph)
```

### 7.4 大纲规划

```python
    async def _plan_outline(self, graph, market_description) -> Dict:
        prompt = f"""基于以下因果逻辑图，规划《未来报纸》大纲。

## 预测问题
{graph.market_query}

## 预测结论
方向: {graph.prediction_direction} | 置信度: {graph.prediction_confidence:.0%}
区间: {graph.confidence_interval}

## 因果因子（按影响力排序）
{self._format_nodes(graph)}

## 关键路径
{self._format_paths(graph)}

## 少数派警告
{graph.minority_warning or '无'}

输出 JSON:
{{ "headline": "新闻标题",
   "subtitle": "副标题",
   "sections": [
     {{ "title": "段标题", "focus_factors": ["因子A","因子B"],
        "evidence_emphasis": "hard_fact/mixed", "word_count": 200 }}
   ],
   "key_insights": ["洞察1", "洞察2", "洞察3"] }}"""

        return await self.llm_client.chat_json(prompt, temperature=0.4)
```

### 7.5 分段生成（带工具调用）

```python
    async def _generate_section(self, graph, section_plan) -> Dict:
        """生成单个段落，可查询因果图获取证据详情"""
        # 准备该段落涉及的因子详情
        factor_details = []
        for factor_name in section_plan.get("focus_factors", []):
            node = next((n for n in graph.nodes if n.name == factor_name), None)
            if node:
                related_edges = [e for e in graph.edges
                                 if e.source_node_id == node.node_id
                                 or e.target_node_id == node.node_id]
                factor_details.append({
                    "name": node.name,
                    "confidence": node.confidence,
                    "hard_facts": node.hard_fact_count,
                    "personas": node.persona_count,
                    "impact": node.impact_score,
                    "relations": [{"type": e.relation_type, "weight": e.weight,
                                   "reasoning": e.reasoning} for e in related_edges]
                })

        prompt = f"""撰写以下段落：

## 段落标题: {section_plan['title']}
## 字数要求: 约{section_plan.get('word_count', 200)}字
## 聚焦因子详情:
{self._format_json(factor_details)}

## 写作要求:
- 引用具体数字（证据数量、置信度）
- 标注证据类型（N条硬核事实/M条画像推演）
- 描述因果链条（A通过什么机制影响B）
- 不要重复大纲中已有的标题

输出 JSON: {{ "content": "段落正文（Markdown格式）" }}"""

        result = await self.llm_client.chat_json(prompt, temperature=0.5)
        return {
            "title": section_plan["title"],
            "content": result.get("content", ""),
            "focus_factors": section_plan.get("focus_factors", []),
            "evidence_emphasis": section_plan.get("evidence_emphasis", "mixed")
        }
```

### 7.6 少数派警告生成

```python
    async def _generate_minority_alert(self, graph) -> Dict:
        if not graph.minority_warning:
            return {"has_alert": False, "text": ""}

        minority_nodes = [n for n in graph.nodes if n.is_minority_driven]
        prompt = f"""为以下少数派信号撰写警告段落：

{graph.minority_warning}

少数派驱动的因子:
{chr(10).join(f'- {n.name}: 硬核事实{n.hard_fact_count}条, 置信度{n.confidence:.0%}' for n in minority_nodes)}

要求：
- 用"少数派先知警告"开头
- 说明若这些异见信号正确，结论将如何逆转
- 引用具体证据数量
- 语气严肃但不恐慌

输出 JSON: {{ "text": "警告段落文本" }}"""

        result = await self.llm_client.chat_json(prompt, temperature=0.3)
        return {"has_alert": True, "text": result.get("text", "")}
```

### 7.7 置信声明与证据声明

```python
    def _build_confidence_statement(self, graph) -> str:
        ci = graph.confidence_interval
        return (
            f"本预测基于 {graph.total_signals_used} 个真实节点的证据聚合。"
            f"预测置信度 {graph.prediction_confidence:.0%}，"
            f"置信区间 [{ci.get('low',0):.0%} - {ci.get('high',0):.0%}]。"
        )

    def _build_evidence_declaration(self, graph) -> Dict:
        total = graph.hard_fact_count + graph.persona_count
        return {
            "total": total,
            "hard_facts": graph.hard_fact_count,
            "persona": graph.persona_count,
            "ratio": f"{graph.hard_fact_count}:{graph.persona_count}",
            "text": (
                f"证据构成: {graph.hard_fact_count} 条硬核事实 (权重1.0) + "
                f"{graph.persona_count} 条画像推演 (权重0.1)"
            )
        }
```

---

## 8. 模块六：因果逻辑图可视化（前端）

### 8.1 设计理念

> **借鉴 MiroFish**: `GraphPanel.vue` 的 D3.js 力导向图、节点着色+图例、多边曲率、自环分组、详情面板、边标签开关。  
> **增强点**: 有向箭头、边权重粗细、因果方向视觉编码、置信度热力图、关键路径高亮、少数派节点标记。

### 8.2 组件结构

```
frontend/src/components/causal-graph/
├── CausalGraphPanel.tsx          # 主面板（图谱渲染 + 控制栏）
├── CausalGraphRenderer.tsx       # D3.js 渲染核心
├── CausalNodeDetail.tsx          # 节点详情面板
├── CausalEdgeDetail.tsx          # 边详情面板（含证据溯源）
├── CausalLegend.tsx              # 图例（因子类别 + 关系类型）
├── CriticalPathHighlight.tsx     # 关键路径高亮控制
├── MinorityAlertBanner.tsx       # 少数派警告横幅
└── EvidenceDrawer.tsx            # 证据溯源抽屉（下钻查看原始线索，端侧已脱敏）
```

### 8.3 核心渲染逻辑 (CausalGraphRenderer)

```typescript
// frontend/src/components/causal-graph/CausalGraphRenderer.tsx

interface CausalGraphData {
  nodes: CausalNodeData[]
  edges: CausalEdgeData[]
  prediction: {
    target_node_id: string
    direction: string
    confidence: number
    confidence_interval: { low: number; mid: number; high: number }
  }
  critical_paths: string[][]
  minority: { warning: string | null; node_ids: string[] }
}

interface CausalNodeData {
  id: string
  name: string
  description: string
  category: string    // macro_economic / sentiment / behavior / policy / event
  hard_fact_count: number
  persona_count: number
  confidence: number
  impact_score: number
  is_target: boolean
  is_minority: boolean
}

interface CausalEdgeData {
  id: string
  source: string
  target: string
  relation: string    // DRIVES / INHIBITS / ...
  weight: number
  strength: string
  direction: string   // positive / negative / neutral
  evidence_count: number
  hard_fact_ratio: number
  reasoning: string
}
```

### 8.4 视觉编码规则

| 视觉元素 | 编码含义 | 实现 |
|----------|---------|------|
| **节点颜色** | 因子类别 | macro_economic=#FF6B35, sentiment=#004E89, behavior=#7B2D8E, policy=#1A936F, event=#C5283D |
| **节点大小** | 证据数量 | `r = 8 + Math.sqrt(total_evidence) * 3` |
| **节点边框** | 少数派标记 | 少数派节点 → 红色虚线边框 `stroke-dasharray: 4,2` |
| **节点光晕** | 预测目标 | 目标节点 → 金色脉冲动画 |
| **边箭头** | 因果方向 | D3 `marker-end` 箭头 |
| **边粗细** | 因果强度 | `stroke-width = 1 + weight * 5` |
| **边颜色** | 正/负向 | positive=#27ae60(绿), negative=#e74c3c(红), neutral=#95a5a6(灰) |
| **边样式** | 强度等级 | strong=实线, moderate=长虚线, weak=点线 |
| **关键路径** | 高亮 | 用户点击 → 路径边变为金色加粗发光 |
| **置信度底色** | 节点可信度 | 节点透明度 = 0.3 + confidence * 0.7 |

### 8.5 D3.js 力导向图配置

```typescript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).id(d => d.id)
    .distance(d => 120 + (1 - d.weight) * 80)  // 强关系拉近
    .strength(d => 0.3 + d.weight * 0.5))
  .force('charge', d3.forceManyBody()
    .strength(d => d.is_target ? -400 : -200))  // 目标节点排斥力更大
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide()
    .radius(d => 8 + Math.sqrt(d.total_evidence) * 3 + 10))

// 箭头标记定义
svg.append('defs').selectAll('marker')
  .data(['positive', 'negative', 'neutral'])
  .join('marker')
    .attr('id', d => `arrow-${d}`)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20).attr('refY', 0)
    .attr('markerWidth', 8).attr('markerHeight', 8)
    .attr('orient', 'auto')
  .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', d => d === 'positive' ? '#27ae60' : d === 'negative' ? '#e74c3c' : '#95a5a6')
```

### 8.6 交互功能

| 交互 | 说明 |
|------|------|
| **点击节点** | 右侧弹出 `CausalNodeDetail`（因子详情+证据统计+关联关系） |
| **点击边** | 右侧弹出 `CausalEdgeDetail`（因果关系详情+推理说明+证据溯源） |
| **点击“查看证据”** | 底部弹出 `EvidenceDrawer`（展示关联的原始线索列表，端侧已脱敏） |
| **高亮关键路径** | 下拉选择路径1/2/3 → 对应边和节点高亮为金色 |
| **显示/隐藏边标签** | 开关控制（借鉴 MiroFish `showEdgeLabels`） |
| **少数派标记** | 开关控制少数派节点红色虚线+警告 icon 的显示 |
| **缩放/拖拽** | D3 zoom behavior |
| **全屏** | 最大化因果图面板 |

### 8.7 节点详情面板

```typescript
// CausalNodeDetail.tsx
interface Props {
  node: CausalNodeData
  relatedEdges: CausalEdgeData[]
  onViewEvidence: (evidenceIds: string[]) => void
}

// 展示内容:
// - 因子名称 + 类别标签
// - 置信度进度条
// - 影响力评分
// - 证据统计: N条硬核事实 + M条画像推演 (饼图)
// - 关联因果关系列表 (带箭头方向)
// - [查看原始证据] 按钮 → 触发 EvidenceDrawer
// - 如果是少数派: 红色警告标记
// - 如果是目标: 金色预测结论展示
```

### 8.8 证据溯源抽屉

```typescript
// EvidenceDrawer.tsx — 底部滑入抽屉
// 展示:
// - 关联线索列表（分两列: 硬核事实 | 画像推演）
// - 每条线索: 证据类型标签 + Qi评分 + 证据文本（端侧已脱敏） + Agent信誉等级
// - 筛选: 按证据类型 / 按Qi评分 / 按时间
// - 统计: 总数 / 硬核事实比例 / 平均Qi
```

---

## 9. 数据库 Schema 扩展

在现有 Supabase PostgreSQL 基础上新增以下表：

### 9.1 因果逻辑图表

```sql
-- 因果逻辑图主表
CREATE TABLE causal_graphs (
  graph_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,                          -- 关联 task_id
  task_id BIGINT REFERENCES markets(id),
  market_query TEXT NOT NULL,
  graph_data JSONB NOT NULL,                      -- 完整图结构（nodes, edges, prediction, ...）
  version INTEGER DEFAULT 1,

  -- 预测结论（冗余存储供快速查询）
  prediction_direction TEXT,                      -- bullish / bearish / neutral
  prediction_confidence DECIMAL,
  confidence_interval JSONB,                      -- {"low": 0.6, "mid": 0.75, "high": 0.85}

  -- 统计信息
  total_signals INTEGER DEFAULT 0,
  hard_fact_count INTEGER DEFAULT 0,
  persona_count INTEGER DEFAULT 0,
  node_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  has_minority_warning BOOLEAN DEFAULT FALSE,

  -- 时间
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 约束
  UNIQUE(task_id, version)
);

CREATE INDEX idx_causal_graphs_market ON causal_graphs(task_id);
CREATE INDEX idx_causal_graphs_task ON causal_graphs(task_id);
```

### 9.2 未来报纸表（扩展现有 simulations 表）

```sql
-- 未来报纸表（替代/扩展现有 simulations）
CREATE TABLE future_newspapers (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT REFERENCES markets(id),
  graph_id TEXT REFERENCES causal_graphs(graph_id),

  -- 报纸内容
  headline TEXT NOT NULL,
  subtitle TEXT,
  body_markdown TEXT NOT NULL,                    -- 完整正文（Markdown）
  body_sections JSONB,                            -- 分段结构化内容

  -- 分析结论
  key_insights JSONB,                             -- ["洞察1", "洞察2", ...]
  prediction_direction TEXT,
  prediction_confidence DECIMAL,
  confidence_interval JSONB,

  -- 少数派
  minority_alert JSONB,                           -- {"has_alert": bool, "text": "..."}

  -- 证据声明
  evidence_declaration JSONB,                     -- {"total": N, "hard_facts": M, ...}

  -- 元数据
  generation_model TEXT,                          -- 使用的LLM模型
  generation_time_ms INTEGER,                     -- 生成耗时
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- RLS：公开可读
  UNIQUE(task_id, graph_id)
);

CREATE INDEX idx_newspapers_market ON future_newspapers(task_id);
```

### 9.3 线索预处理缓存表

```sql
-- 预处理结果缓存（避免重复计算）
CREATE TABLE signal_preprocess_cache (
  task_id TEXT PRIMARY KEY,
  task_id BIGINT REFERENCES markets(id),
  preprocess_result JSONB NOT NULL,               -- 完整 PreprocessResult
  signal_count INTEGER,
  hard_fact_count INTEGER,
  persona_count INTEGER,
  cluster_count INTEGER,
  minority_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);
```

### 9.4 因果本体缓存表

```sql
-- 本体定义缓存
CREATE TABLE causal_ontology_cache (
  task_id TEXT PRIMARY KEY,
  task_id BIGINT REFERENCES markets(id),
  ontology_data JSONB NOT NULL,                   -- CausalOntology 序列化
  factor_count INTEGER,
  relation_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);
```

### 9.5 predictions 表扩展

```sql
-- 扩展现有 predictions 表以支持 UAP v3.0 信号格式
-- 注意：不包含 local_inference 字段，因为端侧Agent是传感器，不做方向预测
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS
  signals JSONB,                                  -- UAP v3.0 signals 数组，每条含:
                                                  --   evidence_type, evidence, source_description
                                                  --   relevance_score (可选, Agent自评相关度 0-1)
                                                  --   entity_tags (可选, Agent提取的关键实体标注数组)
  telemetry JSONB,                                -- 遥测信息（inference_time_ms, local_db_size_kb, model_name）
  privacy_cleared BOOLEAN DEFAULT TRUE;

-- signals JSONB 结构示例:
-- [{ "signal_id": "sig_01", "evidence_type": "hard_fact",
--    "source_description": "用户本地聊天记录",
--    "evidence": "...",
--    "relevance_score": 0.95,
--    "entity_tags": [{"text": "裁员", "type": "event", "role": "cause"}]
-- }]
```

### 9.6 RLS 策略

```sql
-- causal_graphs: 公开可读，仅系统可写
CREATE POLICY "Public read causal graphs"
  ON causal_graphs FOR SELECT USING (true);

CREATE POLICY "System write causal graphs"
  ON causal_graphs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- future_newspapers: 公开可读
CREATE POLICY "Public read newspapers"
  ON future_newspapers FOR SELECT USING (true);
```

---

## 10. 目录结构与技术选型

### 10.1 后端新增目录结构

```
backend/
├── delphi_graph_sdk/              # 现有 SDK（不变）
├── causal_engine/                 # 🆕 因果逻辑图引擎
│   ├── __init__.py
│   ├── config.py                  # 引擎配置（LLM API、阈值等）
│   ├── orchestrator.py            # 🔑 编排器（串联完整流水线）
│   │
│   ├── models/                    # 数据模型
│   │   ├── signal.py              # ProcessedSignal, SignalCluster, PreprocessResult
│   │   ├── ontology.py            # CausalOntology, CausalFactorType, CausalRelationType
│   │   └── causal_graph.py        # CausalGraph, CausalNode, CausalEdge
│   │
│   ├── preprocessor/              # 模块一：预处理
│   │   ├── signal_preprocessor.py # SignalPreprocessor
│   │   └── dedup.py               # 去重工具
│   │
│   ├── ontology/                  # 模块二：本体生成
│   │   └── causal_ontology_generator.py
│   │
│   ├── builder/                   # 模块三：图谱构建
│   │   └── causal_graph_builder.py
│   │
│   ├── inference/                 # 模块四：因果推演
│   │   └── causal_inference_engine.py
│   │
│   ├── newspaper/                 # 模块五：未来报纸
│   │   └── future_newspaper_agent.py
│   │
│   └── utils/                     # 工具
│       ├── llm_client.py          # LLM 调用封装（OpenAI / 本地模型）
│       ├── embeddings.py          # Embedding 计算
│       └── db_client.py           # Supabase 客户端封装
│
├── scripts/
│   └── run_causal_engine.py       # 命令行运行入口
│
└── requirements.txt               # 新增依赖
```

### 10.2 前端新增目录结构

```
frontend/src/
├── components/
│   └── causal-graph/              # 🆕 因果图组件
│       ├── CausalGraphPanel.tsx
│       ├── CausalGraphRenderer.tsx
│       ├── CausalNodeDetail.tsx
│       ├── CausalEdgeDetail.tsx
│       ├── CausalLegend.tsx
│       ├── CriticalPathHighlight.tsx
│       ├── MinorityAlertBanner.tsx
│       └── EvidenceDrawer.tsx
│
├── components/
│   └── future-newspaper/          # 🆕 未来报纸组件
│       ├── NewspaperView.tsx       # 报纸全屏展示
│       ├── HeadlineCard.tsx        # 标题卡片
│       ├── InsightCards.tsx        # 核心洞察卡片组
│       ├── MinorityAlert.tsx       # 少数派警告
│       ├── ConfidenceGauge.tsx     # 置信度仪表盘
│       └── EvidenceDeclaration.tsx # 证据声明
│
├── app/
│   └── market/[id]/
│       ├── causal-graph/          # 🆕 因果图页面
│       │   └── page.tsx
│       └── future/                # 🆕 未来报纸页面（增强现有）
│           └── page.tsx
│
├── lib/
│   └── api/
│       └── causal-engine.ts       # 🆕 因果引擎 API 客户端
│
└── types/
    └── causal-graph.ts            # 🆕 类型定义
```

### 10.3 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| **LLM** | OpenAI GPT-4o / GPT-4o-mini | 本体生成和推演需要强推理能力；mini用于批量Qi评分 |
| **Embedding** | OpenAI text-embedding-3-small | 去重和聚类的语义向量，性价比高 |
| **图谱存储** | PostgreSQL JSONB | 与现有 Supabase 一致，无需引入新依赖 |
| **图谱可视化** | D3.js v7 | MiroFish 已验证可行，力导向图+有向箭头 |
| **引擎运行时** | Python 3.11+ (asyncio) | 与现有 Python SDK 一致 |
| **引擎部署** | Supabase Edge Function 调用 / 独立服务 | 初期用 Edge Function 触发 Python 脚本；后期可独立部署 |
| **前端框架** | Next.js 14 + TypeScript + Tailwind | 与现有前端一致 |
| **UI组件** | shadcn/ui | 与现有一致，Dark Mode 极客风格 |

### 10.4 新增 Python 依赖

```
# backend/requirements.txt 新增
openai>=1.30.0          # LLM API
numpy>=1.24.0           # 向量计算
httpx>=0.27.0           # HTTP 客户端（现有）
supabase>=2.0.0         # Supabase Python 客户端
```

---

## 11. API 接口设计

### 11.1 触发因果分析

```
POST /api/causal-engine/analyze
Content-Type: application/json
Authorization: Bearer <service_role_key>

{
  "task_id": 123,
  "force_refresh": false    // true则忽略缓存重新分析
}

Response 200:
{
  "graph_id": "cg_abc123...",
  "status": "completed",
  "prediction": {
    "direction": "bearish",
    "confidence": 0.75,
    "confidence_interval": { "low": 0.60, "mid": 0.75, "high": 0.85 }
  },
  "newspaper_id": 42,
  "processing_time_ms": 15200
}
```

### 11.2 获取因果逻辑图

```
GET /api/causal-engine/graph/{task_id}

Response 200:
{
  "graph_id": "cg_abc123...",
  "nodes": [...],           // CausalNodeData[]
  "edges": [...],           // CausalEdgeData[]
  "prediction": {...},
  "critical_paths": [...],
  "minority": {...},
  "meta": {...}
}
```

### 11.3 获取未来报纸

```
GET /api/causal-engine/newspaper/{task_id}

Response 200:
{
  "headline": "...",
  "subtitle": "...",
  "body_markdown": "...",
  "body_sections": [...],
  "key_insights": [...],
  "minority_alert": {...},
  "confidence_statement": "...",
  "evidence_declaration": {...}
}
```

### 11.4 获取证据溯源

```
GET /api/causal-engine/evidence/{task_id}?node_id={node_id}&page=1&limit=20

Response 200:
{
  "total": 87,
  "signals": [
    {
      "signal_id": "sig_01",
      "evidence_type": "hard_fact",
      "evidence_text": "...",
      "quality_score": 0.85,
      "agent_reputation_level": "expert",
      "timestamp": "..."
    }
  ]
}
```

### 11.5 获取分析状态（长任务轮询）

```
GET /api/causal-engine/status/{task_id}

Response 200:
{
  "status": "processing",    // idle / processing / completed / error
  "current_step": 3,
  "total_steps": 7,
  "step_name": "构建因果关系边...",
  "started_at": "...",
  "estimated_remaining_ms": 8000
}
```

---

## 12. 实施路线图

### Phase 1: 核心引擎（2-3周）

| 周 | 任务 | 产出 |
|----|------|------|
| W1 | 数据模型定义 + DB Schema | `models/`, SQL迁移脚本 |
| W1 | LLM Client 封装 + 配置 | `utils/llm_client.py`, `config.py` |
| W1 | 预处理管线 | `preprocessor/signal_preprocessor.py` |
| W2 | 因果本体生成器 | `ontology/causal_ontology_generator.py` |
| W2 | 因果图构建器 | `builder/causal_graph_builder.py` |
| W2 | 因果推演引擎 | `inference/causal_inference_engine.py` |
| W3 | 编排器（串联完整流水线） | `orchestrator.py` |
| W3 | 单元测试 + 集成测试 | `tests/causal_engine/` |

### Phase 2: 未来报纸 + API（1-2周）

| 周 | 任务 | 产出 |
|----|------|------|
| W4 | 未来报纸 Agent | `newspaper/future_newspaper_agent.py` |
| W4 | API 路由（Next.js API Routes） | `/api/causal-engine/*` |
| W5 | Edge Function 触发逻辑 | `supabase/functions/trigger-causal-engine` |
| W5 | API 联调测试 | E2E 测试脚本 |

### Phase 3: 前端可视化（2周）

| 周 | 任务 | 产出 |
|----|------|------|
| W6 | D3.js 因果图渲染器 | `CausalGraphRenderer.tsx` |
| W6 | 节点/边详情面板 | `CausalNodeDetail.tsx`, `CausalEdgeDetail.tsx` |
| W7 | 关键路径高亮 + 少数派标记 | `CriticalPathHighlight.tsx`, `MinorityAlertBanner.tsx` |
| W7 | 证据溯源抽屉 | `EvidenceDrawer.tsx` |

### Phase 4: 未来报纸 UI + 整合（1周）

| 周 | 任务 | 产出 |
|----|------|------|
| W8 | 未来报纸全屏展示 | `NewspaperView.tsx` |
| W8 | 与现有 Market 详情页集成 | 路由+导航整合 |
| W8 | 端到端测试 + 性能优化 | 完整流程验证 |

### 总计: 约 7-8 周

---

## 13. 附录：MiroFish 借鉴清单

| # | MiroFish 模块 | 借鉴内容 | 我们的适配 |
|---|---------------|---------|-----------|
| 1 | `PlatformActionLogger` | 结构化日志格式（JSONL） | `ProcessedSignal` 数据结构 |
| 2 | `ZepGraphMemoryUpdater` | 批量处理队列 + 重试机制 | 预处理管线批量处理 + 错误重试 |
| 3 | `OntologyGenerator` | LLM驱动本体生成 + 严格输出约束 | `CausalOntologyGenerator` 因果因子本体 |
| 4 | `GraphBuilderService` | 图创建+本体设定+文本批量注入+进度回调 | `CausalGraphBuilder` 自建图+证据绑定 |
| 5 | `ZepEntityReader` | 实体过滤+关联边/节点读取 | 证据溯源查询 |
| 6 | `ZepToolsService` | 检索工具集（InsightForge/PanoramaSearch） | 未来报纸Agent工具集 |
| 7 | `ReportAgent` | ReACT模式报告生成（规划→分段→工具→组装） | `FutureNewspaperAgent` |
| 8 | `GraphPanel.vue` | D3.js力导向图+图例+详情面板+边标签 | `CausalGraphRenderer` + 因果方向编码 |
| 9 | `SimulationRunner` | 进程管理+状态跟踪+实时监控 | 引擎任务状态跟踪 + 进度API |
| 10 | `SimulationConfigGenerator` | LLM智能配置生成 | 引擎参数自动调优（后续） |

### 不借鉴的部分

| MiroFish 模块 | 理由 |
|---------------|------|
| OASIS 仿真引擎 | 时间演练仿真是论文定理1批判的对象 |
| 虚拟Agent人格生成 | 我们的Agent是真实传感器 |
| Zep Cloud 依赖 | 自建存储保证去中心化和数据主权 |
| 双平台并行模拟 | 不模拟社交平台 |

---

## 编排器参考实现

```python
# backend/causal_engine/orchestrator.py

class CausalEngineOrchestrator:
    """
    因果逻辑图引擎编排器 — 串联完整流水线

    入口函数，被 API / Edge Function 调用
    """

    def __init__(self, llm_client, db_client):
        self.preprocessor = SignalPreprocessor(llm_client)
        self.ontology_gen = CausalOntologyGenerator(llm_client)
        self.graph_builder = CausalGraphBuilder(llm_client, db_client)
        self.inference_engine = CausalInferenceEngine(llm_client)
        self.newspaper_agent = FutureNewspaperAgent(llm_client)
        self.db = db_client

    async def analyze(self, task_id: int, force_refresh=False) -> Dict:
        """完整分析流水线"""
        # 0. 获取市场信息和预测数据
        market = await self._get_market(task_id)
        predictions = await self._get_predictions(task_id)

        if len(predictions) < 50:
            return {"status": "insufficient_signals", "count": len(predictions)}

        # 1. 预处理（Agent只提供原始数据/推演数据，不含方向预测）
        preprocess_result = await self.preprocessor.process(
            task_id=str(task_id),
            raw_predictions=predictions,
            market_query=market["title"]
        )

        # 2. 因果本体生成
        ontology = await self.ontology_gen.generate(
            preprocess_result, market["title"], market.get("description")
        )

        # 3. 因果逻辑图构建
        graph = await self.graph_builder.build(ontology, preprocess_result)

        # 4. 因果推演
        graph = await self.inference_engine.infer(graph, preprocess_result)

        # 5. 未来报纸生成
        newspaper = await self.newspaper_agent.generate(
            graph, market.get("description", "")
        )

        # 6. 保存未来报纸
        await self._save_newspaper(task_id, graph.graph_id, newspaper)

        return {
            "status": "completed",
            "graph_id": graph.graph_id,
            "prediction": {
                "direction": graph.prediction_direction,
                "confidence": graph.prediction_confidence,
                "confidence_interval": graph.confidence_interval
            },
            "newspaper_headline": newspaper["headline"]
        }
```

---

**文档完成。三部分索引：**
- [Part 1: 架构 + 预处理](./CAUSAL-GRAPH-ENGINE-IMPLEMENTATION.md)
- [Part 2: 本体 + 图谱 + 推演](./CAUSAL-GRAPH-ENGINE-PART2.md)
- [Part 3: 报纸 + 可视化 + DB/API/路线图](./CAUSAL-GRAPH-ENGINE-PART3.md)（本文）
