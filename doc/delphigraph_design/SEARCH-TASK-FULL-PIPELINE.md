# DelphiGraph 搜索任务全流程文档

> 从用户创建搜索任务到因果图谱分析、未来报纸生成的完整端到端流程。

---

## 一、系统架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         用户（前端）                                  │
│  创建任务 → 查看详情 → 因果图谱 → 未来报纸 → Agent 线索列 表            │
└────────────┬─────────────────────────────────────────────────────────┘
             │  Next.js API Routes
             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Supabase (数据层)                                │
│  markets │ predictions │ causal_analyses │ simulations │ profiles     │
│           │             │                 │             │              │
│  Edge Functions:        │  实时订阅 (Realtime)          │              │
│  · submit-prediction    │  · predictions INSERT         │              │
│  · create-quest         │  · causal_analyses *          │              │
│  · generate-simulation  │                               │              │
└────────────┬────────────┴───────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Python FastAPI 服务 (port 8100)                     │
│  后台轮询 → CausalEngineOrchestrator.analyze()                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Preprocessor │→│OntologyGen   │→│GraphBuilder │→│ Inference  │  │
│  │ (信号预处理)  │  │(因果本体生成) │  │(图谱构建)   │  │(因果推演)  │  │
│  └─────────────┘  └──────────────┘  └────────────┘  └────────────┘  │
│                                                                      │
│  Agent SDK (client.py) ← 外部 Agent 提交线索                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、完整流程步骤

### 阶段 1: 用户创建搜索任务

**入口**: `frontend/src/app/(dashboard)/searchs/create/page.tsx`

1. 用户在前端填写搜索任务表单（标题、问题、描述、截止时间、奖金池）
2. 前端调用 `POST /api/searchs/create`
3. API Route 调用 Supabase Edge Function `database/create-quest`
4. Edge Function 将任务写入 `markets` 表，初始状态 `status = 'active'`

**数据库记录**:
```sql
INSERT INTO markets (title, question, description, status, closes_at, reward_pool, 
                     causal_analysis_status)
VALUES ('...', '...', '...', 'active', '...', 1000, 'pending');
```

**关键字段**:
- `causal_analysis_status`: 初始为 `'pending'`，标记因果引擎轮询状态
- `prediction_count_at_last_analysis`: 上次分析时的线索数量，用于增量判断

---

### 阶段 2: Agent 提交线索（结构化信号）

**入口**: `backend/delphi_graph_sdk/client.py` → `submit_prediction()` / `submit_signal()`

1. 外部 Agent 通过 SDK 轮询获取活跃市场列表 (`get_active_markets()`)
2. Agent 采集数据后，调用 `submit_prediction()` 或 `submit_signal()` 提交结构化线索
3. SDK 发送 HTTP 请求到 Supabase Edge Function `database/submit-prediction`

**提交数据格式** (UAP 协议扩展):
```python
{
    "task_id": "uuid",
    "probability": 0.72,           # Agent 对事件发生概率的评估
    "rationale": "分析依据文本",
    "evidence_type": "hard_fact",   # hard_fact | persona_inference
    "evidence_text": "原始证据文本（已脱敏）",
    "relevance_score": 0.85,        # Agent 自评相关度 (0-1)
    "entity_tags": [                # Agent 端提取的实体标注
        {"text": "特斯拉", "type": "brand", "role": "target"},
        {"text": "裁员", "type": "event", "role": "cause"}
    ],
    "privacy_cleared": true,        # 确认已脱敏
    "source_url": "https://..."     # 可选来源
}
```

**Edge Function 处理** (`supabase/functions/database/submit-prediction/index.ts`):
1. 验证 API Key → 查找用户
2. 检查用户状态（是否在 purgatory）
3. 检查市场状态（是否接受新预测）
4. 检查 NDA 要求
5. 检查每日提交限制
6. 写入 `predictions` 表（含结构化信号字段）

**数据库触发器**:
```sql
-- 每插入新 prediction，如果该市场积累了足够新线索，标记为待分析
CREATE TRIGGER trigger_new_prediction
  AFTER INSERT ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION check_analysis_needed();
```

---

### 阶段 3: 因果引擎自动分析

**入口**: `backend/causal_engine/api_service.py` → `polling_loop()`

FastAPI 服务启动后，后台轮询任务持续运行：

```
polling_loop() → 每 60 秒检查一次
  ├─ get_pending_markets()        # 查询 causal_analysis_status = 'pending' 的市场
  ├─ 检查线索数量是否 ≥ 5 (MIN_SIGNALS_FOR_ANALYSIS)
  └─ run_analysis_for_market()    # 触发分析
```

**手动触发**: 用户也可通过前端点击"触发分析"按钮：
```
前端 → POST /api/causal-analysis/[taskId] → FastAPI /api/causal-analysis/trigger
```

#### 3.1 信号预处理 (SignalPreprocessor)

**文件**: `backend/causal_engine/preprocessor/signal_preprocessor.py`

```
_format_predictions()          # 数据库行 → 因果引擎输入格式
  └─ preprocessor.preprocess()
       ├─ (1) _parse_raw_predictions()   # 解析原始数据为 ProcessedSignal
       ├─ (2) _validate_privacy()        # 隐私合规校验
       ├─ (3) _filter_by_relevance()     # 过滤低相关度线索 (< 0.3)
       ├─ (4) _build_entity_index()      # 构建全局实体索引
       ├─ (5) _semantic_clustering()     # LLM 语义聚类（按主题分簇）
       ├─ (6) _identify_minority()       # 识别少数派语义簇
       └─ (7) _compute_weights()         # 计算证据权重
                                          #   hard_fact: weight=1.0
                                          #   persona:   weight=0.1
```

**输出**: `PreprocessResult`
```python
{
    "task_id": "market_uuid",
    "total_signals": 25,
    "valid_signals": 22,
    "clusters": [SignalCluster, ...],          # 主流语义簇
    "minority_clusters": [SignalCluster, ...],  # 少数派簇
    "entity_index": {"特斯拉": [...], ...},     # 全局实体索引
    "hard_fact_count": 15,
    "persona_count": 7
}
```

#### 3.2 因果本体生成 (CausalOntologyGenerator)

**文件**: `backend/causal_engine/ontology/causal_ontology_generator.py`

1. 将聚类结果 + 实体索引组合为 Prompt
2. 调用千问 LLM 生成因果因子类型和因果关系
3. 验证本体完整性（至少 3 个因子、必须有预测目标等）

**输出**: `CausalOntology`
```python
{
    "task_id": "...",
    "market_query": "特斯拉股价明年会涨吗？",
    "prediction_target": "特斯拉股价走势",
    "factor_types": [
        {"name": "宏观经济环境", "category": "economic", "description": "..."},
        {"name": "技术创新进展", "category": "technological", "description": "..."},
        ...
    ],
    "raw_causal_relations": [
        {"source_factor": "宏观经济环境", "target_factor": "特斯拉股价走势",
         "relation_type": "DRIVES", "strength": "strong", "evidence_count": 8},
        ...
    ]
}
```

#### 3.3 因果图谱构建 (CausalGraphBuilder)

**文件**: `backend/causal_engine/builder/causal_graph_builder.py`

```
builder.build(ontology, preprocess_result)
  ├─ Step 1: _build_nodes()              # 从本体因子类型创建节点
  ├─ Step 2: _build_edges()              # 从因果关系创建有向加权边
  │           └─ _fuzzy_match_node()     #   模糊匹配节点名
  │           └─ _compute_edge_weight()  #   边权重 = f(证据数, 强度)
  ├─ Step 3: _bind_evidence()            # 将聚类线索关联到最匹配节点
  │           └─ _find_best_matching_node() # 关键词+实体重叠匹配
  ├─ Step 4: _compute_impact_scores()    # PageRank 变体：路径权重传播
  │           └─ _find_max_path_weight() #   DFS 找最大累积权重路径
  ├─ Step 4.5: _compute_node_directions() # 基于入边方向加权投票
  │             # pos_weight > neg_weight×1.2 → bullish
  │             # neg_weight > pos_weight×1.2 → bearish
  │             # else → neutral
  └─ Step 5: _mark_minority_nodes()      # 标注少数派驱动的节点
```

**输出**: `CausalGraph`
```python
{
    "graph_id": "cg_xxxx",
    "nodes": [
        {"id": "node_xxx", "name": "宏观经济环境", "category": "economic",
         "impact_score": 0.85, "confidence": 0.72, "evidence_direction": "bullish",
         "is_minority": false, "is_target": false,
         "hard_fact_count": 5, "persona_count": 2, "total_evidence_count": 7},
        ...
    ],
    "edges": [
        {"id": "edge_xxx", "source": "node_a", "target": "node_b",
         "source_name": "宏观经济环境", "target_name": "特斯拉股价走势",
         "relation": "DRIVES", "weight": 0.68, "direction": "positive",
         "strength": "strong", "evidence_count": 8},
        ...
    ],
    "prediction": {...},
    "critical_paths": [...],
    "minority": {"warning": "...", "node_ids": [...]}
}
```

#### 3.4 因果推演 (CausalInferenceEngine)

**文件**: `backend/causal_engine/inference/causal_inference_engine.py`

```
inference_engine.infer(graph, preprocess_result)
  ├─ Step 1: _find_critical_paths()     # DFS 找源→目标的 Top 3 最大权重路径
  ├─ Step 2: _propagate_confidence()    # 拓扑排序 + 按边方向权重传播置信度
  ├─ Step 3: _detect_conflicts()        # 检测同一节点正向+负向入边冲突
  │           └─ _resolve_conflicts()   #   LLM 多视角推理消解
  ├─ Step 4: _sensitivity_analysis()    # 逐因子评估移除后对目标的影响
  └─ Step 5: _generate_conclusion()     # LLM 综合推演 → 方向+置信度+区间
```

**LLM 生成的推演结论**:
```json
{
    "direction": "bullish",
    "confidence": 0.75,
    "confidence_interval": {"low": 0.60, "mid": 0.75, "high": 0.85},
    "key_drivers": ["技术创新进展", "市场情绪"],
    "risk_factors": ["政策监管风险"],
    "minority_assessment": "少数派关注的供应链问题值得重视",
    "one_line_conclusion": "综合因果分析，特斯拉股价看涨概率为75%"
}
```

#### 3.5 未来报纸生成

**文件**: `backend/causal_engine/api_service.py` → `_generate_newspaper()`

每次因果分析完成后（增量版或最终版），自动调用 LLM 生成"未来报纸"：
- 提取 Top 5 关键因子（按影响力排序）
- 提取核心因果链（前 6 条边）
- 生成 600-1000 字的新闻报道
- 署名"德尔菲未来通讯社"
- 含编者注说明基于因果推演

#### 3.6 结果持久化

**文件**: `backend/causal_engine/supabase_client.py` → `save_causal_analysis()`

```sql
-- 旧版本标记为非最新
UPDATE causal_analyses SET is_latest = false WHERE task_id = ? AND is_latest = true;

-- 插入新分析
INSERT INTO causal_analyses (
    task_id, status, signal_count, hard_fact_count, persona_count,
    graph_data,           -- JSONB: 完整因果图谱
    ontology_data,        -- JSONB: 因果本体
    conclusion,           -- JSONB: 推演结论
    preprocess_summary,   -- JSONB: 预处理摘要
    newspaper_content,    -- TEXT: 未来报纸
    is_final, is_latest, version, elapsed_seconds, triggered_by
) VALUES (...);

-- 更新市场状态
UPDATE markets SET causal_analysis_status = 'completed',
                   last_analysis_at = NOW(),
                   prediction_count_at_last_analysis = ?
WHERE id = ?;
```

---

### 阶段 4: 前端展示

#### 4.1 搜索详情页 (Server Component)

**文件**: `frontend/src/app/(dashboard)/searchs/[id]/page.tsx`

服务端渲染时并行获取四项数据：
```typescript
const market      = await supabase.from('markets').select('*').eq('id', taskId).single()
const predictions = await supabase.from('predictions').select('...').eq('task_id', taskId)
const analysis    = await supabase.from('causal_analyses').select('*').eq('task_id', taskId).eq('is_latest', true)
const simulation  = await supabase.from('simulations').select('*').eq('task_id', taskId).limit(1)
```

将数据传递给客户端组件 `<SearchDetailClient />`。

#### 4.2 客户端交互 (Client Component)

**文件**: `frontend/src/app/(dashboard)/searchs/[id]/search-detail-client.tsx`

**实时订阅**:
```typescript
supabase.channel(`market-${id}-detail`)
  .on('postgres_changes', { event: 'INSERT', table: 'predictions', filter: `task_id=eq.${id}` }, ...)
  .on('postgres_changes', { event: '*', table: 'causal_analyses', filter: `task_id=eq.${id}` }, ...)
  .subscribe()
```

**页面结构**:
```
┌─────────────────────────────────────────────────┐
│  ← 返回                                         │
├─────────────────────────────────────────────────┤
│  市场信息头部                                     │
│  [状态徽章] [分析状态徽章]                         │
│  标题 / 问题 / 描述                               │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │Agent 线索│ │共识概率   │ │截止时间   │         │
│  │  25 条   │ │  72.3%   │ │2026-04-15│         │
│  │硬5·推20  │ │ 偏向正面  │ │奖金¥1000 │         │
│  └──────────┘ └──────────┘ └──────────┘         │
├─────────────────────────────────────────────────┤
│  [因果图谱] [未来报纸] [Agent 线索]   [刷新][触发]│
├─────────────────────────────────────────────────┤
│                                                  │
│  Tab 1: 因果图谱                                  │
│  ┌─────────────────────────────────────────┐     │
│  │  D3.js 力导向图                          │     │
│  │  · 缩放/平移 · 拖拽节点                  │     │
│  │  · 点击显示详情面板                       │     │
│  │  · 少数派光晕 · 边标签开关                │     │
│  │  · 图例（因子类型 + 方向标识）            │     │
│  └─────────────────────────────────────────┘     │
│  v3 · 22 条线索 · 耗时 3.2s    增量分析 时间     │
│  推演结论: 方向/置信度/关键路径/敏感因子          │
│                                                  │
│  Tab 2: 未来报纸                                  │
│  ┌─────────────────────────────────────────┐     │
│  │  📰 德尔菲未来通讯  [增量版/最终版]        │     │
│  │  方向: 📈看涨  置信度: 75%  区间: 60-85% │     │
│  │  ⚠️ 少数派警告 / ⚡ 冲突分析              │     │
│  │  ── 正文（Markdown 渲染）──               │     │
│  │  编者注: ...                               │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  Tab 3: Agent 线索列表                            │
│  ┌─────────────────────────────────────────┐     │
│  │  #25 [硬事实] 相关度85%    72.3%  时间   │     │
│  │  线索文本...                              │     │
│  │  [特斯拉(target)] [裁员(cause)]          │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  🟢 实时更新已启用 · 新线索将自动刷新             │
└─────────────────────────────────────────────────┘
```

#### 4.3 因果图谱可视化

**文件**: `frontend/src/components/causal-graph/causal-graph-viewer.tsx`

基于 D3.js 力导向图：

| 特性 | 实现方式 |
|------|---------|
| 力仿真 | `d3.forceSimulation` + link/charge/center/collide/x/y 力 |
| 缩放平移 | `d3.zoom` → `scaleExtent([0.2, 4])` |
| 节点拖拽 | `d3.drag` → fx/fy 锚定 |
| 节点大小 | 按 `impact_score` 线性映射 (10-30px) |
| 节点颜色 | 按 `factor_type/category` 映射 8 种颜色 |
| 节点方向 | 内部图标 ↑(bullish) / ↓(bearish) / —(neutral) |
| 少数派标识 | 外圈虚线光晕（黄色脉冲） |
| 边样式 | 正向=实线绿色 / 负向=虚线红色 |
| 多边曲线 | 同源同目标的边自动计算曲率偏移 |
| 箭头标记 | SVG marker (正向绿/负向红) |
| 边标签 | 关系类型文本（可开关） |
| 详情面板 | 点击节点/边弹出右上角面板 |
| 实时指示 | `isUpdating` 时显示绿色脉冲标识 |

**数据归一化层**:
- `normalizeNodes()`: 兼容 `category`↔`factor_type`、`is_minority`↔`is_minority_driven`、`total_evidence_count`↔`evidence_count` 等字段差异
- `normalizeEdges()`: 从 nodeMap 补充 `source_name`/`target_name`

#### 4.4 未来报纸组件

**文件**: `frontend/src/components/causal-graph/future-newspaper.tsx`

- 报纸头部：标题、版本号、增量版/最终版徽章
- 结论摘要：预测方向（颜色编码）、置信度、置信区间
- 少数派警告：黄色警示条
- 冲突分析：红色警示条
- 正文渲染：Markdown 标题识别、编者注特殊样式、段落分隔
- 展开/收起切换

---

## 三、数据库表结构

### 核心表

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `markets` | 搜索任务 | id, title, question, status, causal_analysis_status |
| `predictions` | Agent 线索 | task_id, probability, rationale, evidence_type, relevance_score, entity_tags |
| `causal_analyses` | 因果分析结果 | task_id, graph_data(JSONB), conclusion(JSONB), newspaper_content, version, is_final, is_latest |
| `simulations` | 旧版模拟 | task_id, content, consensus_probability |
| `profiles` | 用户/Agent | id, api_key, status, reputation_score |

### 迁移文件

- `supabase/migrations/00_complete_database.sql` — 基础表结构
- `supabase/migrations/20260320_add_causal_analysis.sql` — 因果分析扩展（causal_analyses 表、predictions 新字段、触发器、RLS）

---

## 四、API 端点清单

### Next.js API Routes (前端代理)

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/causal-analysis/[taskId]` | 从 Supabase 获取最新分析 |
| POST | `/api/causal-analysis/[taskId]` | 转发到 FastAPI 触发分析 |

### FastAPI 端点 (Python 后端, port 8100)

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/causal-analysis/trigger` | 触发因果分析 |
| GET | `/api/causal-analysis/{task_id}` | 获取最新分析结果 |
| GET | `/api/causal-analysis/{task_id}/graph` | 获取图谱数据 |
| GET | `/api/causal-analysis/{task_id}/newspaper` | 获取未来报纸 |
| GET | `/api/causal-analysis/{task_id}/history` | 获取分析历史 |

### Supabase Edge Functions

| 函数 | 功能 |
|------|------|
| `database/submit-prediction` | Agent 提交线索 |
| `database/create-quest` | 创建搜索任务 |
| `ai/generate-simulation` | 旧版模拟生成 |
| `ai/ai-match-niche-tags` | AI 标签匹配 |

---

## 五、环境变量配置

### 前端 (`frontend/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
CAUSAL_ENGINE_URL=http://localhost:8100
```

### 后端 (`backend/.env`)
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
DASHSCOPE_API_KEY=xxx              # 或 QWEN_API_KEY
CAUSAL_ENGINE_PORT=8100
CAUSAL_ENGINE_RELOAD=true          # 开发模式热重载
```

---

## 六、文件清单

### 后端 (Python)

```
backend/
├── causal_engine/
│   ├── __init__.py
│   ├── api_service.py              # FastAPI 服务 + 后台轮询
│   ├── supabase_client.py          # Supabase 数据库交互
│   ├── orchestrator.py             # 分析流程编排器
│   ├── llm_client.py               # 千问 LLM 客户端
│   ├── models/
│   │   ├── signal.py               # ProcessedSignal, PreprocessResult
│   │   ├── ontology.py             # CausalOntology, FactorType
│   │   └── causal_graph.py         # CausalNode, CausalEdge, CausalGraph
│   ├── preprocessor/
│   │   └── signal_preprocessor.py  # 信号预处理管线
│   ├── ontology/
│   │   └── causal_ontology_generator.py  # 因果本体生成
│   ├── builder/
│   │   └── causal_graph_builder.py # 因果图谱构建
│   └── inference/
│       └── causal_inference_engine.py  # 因果推演引擎
├── delphi_graph_sdk/
│   └── client.py                   # Agent SDK
└── requirements.txt
```

### 前端 (Next.js + React)

```
frontend/src/
├── app/
│   ├── api/causal-analysis/[taskId]/
│   │   └── route.ts                # API 代理路由
│   └── (dashboard)/searchs/
│       ├── create/page.tsx         # 创建搜索任务
│       └── [id]/
│           ├── page.tsx            # 搜索详情页 (Server)
│           └── search-detail-client.tsx  # 搜索详情 (Client)
├── components/
│   └── causal-graph/
│       ├── causal-graph-viewer.tsx  # D3.js 因果图谱可视化
│       └── future-newspaper.tsx     # 未来报纸展示
└── lib/supabase/
    ├── client.ts                   # 浏览器端 Supabase
    └── server.ts                   # 服务端 Supabase
```

### 数据库迁移

```
supabase/migrations/
├── 00_complete_database.sql        # 基础表结构
└── 20260320_add_causal_analysis.sql # 因果分析扩展
```

### 测试

```
tests/causal_engine/
├── conftest.py                     # 路径配置
├── test_models.py                  # 数据模型测试 (23 tests)
├── test_preprocessor.py            # 预处理器测试 (13 tests)
├── test_graph_builder.py           # 图谱构建测试 (12 tests)
└── test_integration.py             # 集成测试 (7 tests, 需 API Key)
```

---

## 七、增量分析 vs 最终分析

| 维度 | 增量分析 | 最终分析 |
|------|---------|---------|
| 触发条件 | 线索 ≥ 5 条 | 线索 ≥ 50 条 或 市场已关闭 或手动指定 |
| 分析深度 | 完整流程 | 完整流程 |
| 未来报纸 | ✅ 生成（增量版） | ✅ 生成（最终版） |
| 版本管理 | version 递增, is_latest 更新 | is_final = true |
| 前端标识 | 黄色"增量分析"徽章 | 绿色"最终分析"徽章 |

---

## 八、测试状态

```
tests/causal_engine/test_models.py        ✅ 23 passed
tests/causal_engine/test_preprocessor.py  ✅ 13 passed
tests/causal_engine/test_graph_builder.py ✅ 12 passed
tests/causal_engine/test_integration.py   ⏭️  7 skipped (需 API Key)
                                          ─────────────
                                          48 passed, 7 skipped
```

---

## 九、本轮开发修复的问题

1. **双 Tabs 实例** — `search-detail-client.tsx` 中两个独立 `<Tabs>` 导致 Tab 切换不同步 → 合并为单一 `<Tabs>` 容器
2. **闭包陷阱** — `causal-graph-viewer.tsx` 中 D3 事件回调引用过期的 `selectedItem` → 使用 `useRef` 同步
3. **字段名不匹配** — 后端 `CausalNode.to_dict()` 使用 `category`/`is_minority`，前端期望 `factor_type`/`is_minority_driven` → 添加 `normalizeNodes()`/`normalizeEdges()` 归一化层
4. **缺少字段** — `CausalEdge.to_dict()` 不输出 `source_name`/`target_name` → 在 `CausalGraph.to_dict()` 中注入
5. **结论字段缺失** — orchestrator 的 conclusion 缺少 `critical_path_length`/`sensitivity_count` → 添加计算逻辑
6. **节点方向缺失** — `CausalNode` 无 `evidence_direction` 字段 → 添加字段 + `_compute_node_directions()` 方法
7. **测试路径冲突** — `tests/causal_engine/__init__.py` 与 `backend/causal_engine` 命名冲突 → 删除测试目录 `__init__.py`
8. **报纸仅限最终版** — `api_service.py` 仅在 `is_final` 时生成报纸 → 改为每次分析完成都生成
