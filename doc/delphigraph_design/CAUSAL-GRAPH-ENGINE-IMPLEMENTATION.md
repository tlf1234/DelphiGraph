# DelphiGraph 因果逻辑图引擎 — 完整实现文档

> **版本**: v1.0 | **日期**: 2026-03-19  
> **参考**: DephiGraphePaper.md（理论）、MiroFish（工程借鉴）、DelphiGraph开发文档.md（现有架构）

---

## 目录

1. [项目定位与核心目标](#1-项目定位与核心目标)
2. [整体架构设计](#2-整体架构设计)
3. [模块一：线索采集与预处理](#3-模块一线索采集与预处理)
4. [模块二：因果本体自动生成](#4-模块二因果本体自动生成)
5. [模块三：因果逻辑图构建引擎](#5-模块三因果逻辑图构建引擎)
6. [模块四：因果推演引擎](#6-模块四因果推演引擎)
7. [模块五：未来报纸生成引擎](#7-模块五未来报纸生成引擎)
8. [模块六：因果逻辑图可视化（前端）](#8-模块六因果逻辑图可视化)
9. [数据库 Schema 扩展](#9-数据库-schema-扩展)
10. [目录结构与技术选型](#10-目录结构与技术选型)
11. [API 接口设计](#11-api-接口设计)
12. [实施路线图](#12-实施路线图)
13. [附录：MiroFish 借鉴清单](#13-附录mirofish-借鉴清单)

---

## 1. 项目定位与核心目标

### 1.1 我们要做什么

构建**广度因果逻辑预测引擎**——当一个预测任务（Market）收到大量 Agent 线索后，系统自动执行：

```
海量Agent线索 → 预处理/质量过滤 → 因果因子识别 → 因果逻辑图构建
→ 因果推演/冲突消解 → 预测结论+置信区间 → 因果图可视化 + 未来报纸
```

### 1.2 核心交付物

| 交付物 | 说明 | 论文章节 |
|--------|------|---------|
| **因果逻辑图** | 有向加权图 G=(V,E)，V=影响因子，E=因果关系 | §5.4 |
| **未来报纸** | 基于因果图的叙事报告 | §9.2.3 |
| **置信区间** | 预测概率区间和证据分布 | §9.2.3 |
| **证据溯源** | 每条因果链可下钻到原始证据（端侧已脱敏） | §9.2.3 |
| **少数派警告** | 异见信号独立展示 | §6.2 |

### 1.3 与现有系统的关系

已有：Agent注册/API Key、预测市场(markets)、线索提交(predictions+rationale)、信誉系统、基础模拟器(simulations)。

**本文档实现缺失的核心环节**：将 rationale 转化为结构化因果逻辑图 → 因果推演 → 高质量报告。

---

## 2. 整体架构设计

### 2.1 数据流水线全景

```
┌──────────────┐   ┌───────────────┐   ┌──────────────────────┐
│ Agent线索池   │──▶│ 预处理管线     │──▶│ 因果本体自动生成      │
│ predictions   │   │ - 分类/去重   │   │ CausalOntologyGen    │
│ .rationale    │   │ - 语义聚类   │   │ - LLM识别影响因子     │
│ .signals[]    │   │ - 质量评分Qi  │   │ - LLM推断因果关系     │
└──────────────┘   └───────────────┘   └──────────┬───────────┘
                                                   ▼
┌──────────────────────────────────────────────────────────────┐
│              因果逻辑图构建 (CausalGraphBuilder)              │
│  节点构建(因子V) + 边构建(因果E) + 证据绑定(边→原始线索)      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              因果推演引擎 (CausalInferenceEngine)              │
│  关键路径 + 概率传播 + 冲突消解 + 敏感性分析 + 少数派标注      │
└──────────────────────────┬───────────────────────────────────┘
                  ┌────────┴────────┐
                  ▼                 ▼
┌──────────────────────┐  ┌────────────────────────┐
│ 因果图可视化(前端)    │  │ 未来报纸生成            │
│ D3.js有向力导图      │  │ ReACT模式报告Agent      │
│ 边权重/方向/置信度   │  │ 分段生成+图谱查询工具   │
└──────────────────────┘  └────────────────────────┘
```

### 2.2 触发机制

```typescript
const TRIGGER_CONDITIONS = {
  MIN_SIGNALS: 50,           // 最少50条线索
  MIN_HARD_FACTS: 5,         // 最少5条硬核事实
  AUTO_REFRESH_INTERVAL: 30, // 每30分钟增量更新
  MARKET_STATUS: 'open'
}
```

### 2.3 分层职责

| 层 | 技术 | 职责 |
|----|------|------|
| 触发层 | Supabase Edge Function | 检测线索数量，触发引擎 |
| 引擎层 | Python 服务 | 核心因果分析（预处理→本体→图谱→推演→报告） |
| 存储层 | PostgreSQL | 因果图持久化 |
| 呈现层 | Next.js | 图谱可视化 + 未来报纸展示 |

---

## 3. 模块一：线索采集与预处理

### 3.1 端侧 Agent 角色定义（核心原则）

> **端侧 Agent 是传感器（Sensor），不是预测者（Predictor）。**

端侧 Agent 的唯一职责：
1. **数据采集**：根据任务内容，从本地环境中提取与任务相关的真实数据（硬核事实）
2. **画像推演**：当本地无直接相关数据时，基于用户画像推演出与任务相关的数据（画像推演）
3. **数据脱敏**：端侧内置隐私插件，在数据提交前完成脱敏处理，平台侧无需再做脱敏
4. **沉默权**：如果既无相关数据也无法合理推演，Agent 应行使沉默权（abstain）

端侧 Agent **不做任何预测判断**（不输出 bullish/bearish/neutral），因为：
- Agent 仅拥有单一、局部的视角，无法做出有意义的方向预测
- 预测方向只有在平台宏观大脑汇聚海量端侧数据后，拥有上帝视角时才有意义
- 要求 Agent 预测会引入噪声，与传感器-大脑架构相矛盾

### 3.2 数据源

线索来自 `predictions` 表，遵循 UAP v3.0 协议：

```json
{
  "task_id": "tk_2026_0315_tesla",
  "agent_id": "agent_8f3a1b",
  "status": "submitted",
  "signals": [
    {
      "signal_id": "sig_01",
      "evidence_type": "hard_fact",
      "source_description": "用户本地聊天记录",
      "evidence": "用户在与家人聊天中明确表示：'现在裁员这么凶，谁还敢贷款买车？特斯拉再便宜也不买。'",
      "relevance_score": 0.95,
      "entity_tags": [
        { "text": "裁员", "type": "event", "role": "cause" },
        { "text": "特斯拉", "type": "brand", "role": "target" },
        { "text": "不买", "type": "sentiment", "role": "negative_intent" }
      ]
    },
    {
      "signal_id": "sig_02",
      "evidence_type": "persona_inference",
      "source_description": "基于用户近30天消费行为画像推演",
      "evidence": "无直接提及特斯拉，但用户近30天搜索记录显示高频关注'消费降级''省钱技巧''二手交易'，基于消费画像推演购车意愿极低。",
      "relevance_score": 0.60,
      "entity_tags": [
        { "text": "消费降级", "type": "trend", "role": "context" },
        { "text": "二手交易", "type": "behavior", "role": "indicator" }
      ]
    }
  ],
  "telemetry": {
    "inference_time_ms": 3840,
    "local_db_size_kb": 18720,
    "model_name": "llama3:8b-instruct"
  },
  "privacy_cleared": true
}
```

> **注意**：与旧设计不同，Agent 提交中**没有** `local_inference`（方向预测）和 `confidence`（置信度）字段。Agent 只提供原始数据/推演数据，所有预测判断由平台宏观大脑完成。

**传感器增强字段说明**（回答"数据是什么/多相关"，而非"数据意味着什么"）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `relevance_score` | float 0-1 | 可选 | Agent 对"该条数据与任务的相关程度"的自评。类似 MiroFish `ZepToolsService.panorama_search` 中的关键词相关性排序，但在端侧由本地 LLM 语义评估完成，比简单关键词匹配更准确。未提供时平台默认赋 0.5。 |
| `entity_tags` | array | 可选 | Agent 从证据中提取的关键实体标注。每个实体包含 `text`（实体文本）、`type`（实体类型）、`role`（在因果链中的角色）。 |

**entity_tags 标注规范**：

| 字段 | 可选值示例 | 说明 |
|------|-----------|------|
| `type` | `brand`, `person`, `event`, `trend`, `behavior`, `sentiment`, `metric`, `location` | 实体类型，Agent 端 LLM 识别 |
| `role` | `target`（预测目标相关）, `cause`（潜在原因）, `indicator`（行为指标）, `context`（背景）, `negative_intent` / `positive_intent`（意图表达） | 实体在因果链中的角色 |

> **传感器边界**：`relevance_score` 和 `entity_tags` 都属于对数据本身的结构化描述，是传感器的"标签贴纸"功能，不涉及任何预测方向判断。

### 3.3 核心数据结构

```python
# backend/causal_engine/models/signal.py

class EvidenceType(Enum):
    HARD_FACT = "hard_fact"               # 端侧采集到的真实数据
    PERSONA_INFERENCE = "persona_inference" # 端侧基于用户画像推演的数据

# 注意：InferenceDirection 只在平台宏观大脑层面使用，
# 由因果推演引擎输出，不来自端侧 Agent
class InferenceDirection(Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"

@dataclass
class EntityTag:
    """Agent端提取的关键实体标注（传感器增强，非预测）"""
    text: str                             # 实体文本，如"裁员""特斯拉"
    type: str                             # brand/person/event/trend/behavior/sentiment/metric/location
    role: str                             # target/cause/indicator/context/negative_intent/positive_intent

@dataclass
class ProcessedSignal:
    """预处理后的结构化线索"""
    signal_id: str
    task_id: str
    agent_id: str
    evidence_type: EvidenceType           # 数据来源类型
    evidence_text: str                    # 证据文本（端侧插件已完成脱敏，平台无需再处理）
    source_description: str = ""          # 数据来源描述
    relevance_score: float = 0.5          # Agent自评相关度(0-1)，未提供默认0.5
    entity_tags: List[EntityTag] = field(default_factory=list)  # Agent提取的关键实体
    weight: float = 0.0                   # hard_fact=1.0, persona=0.1
    quality_score: float = 0.0            # 边际贡献评分 Qi
    sentiment_tag: Optional[str] = None   # 平台LLM标注的情感倾向（非Agent预测）
    cluster_id: Optional[str] = None
    agent_reputation: float = 100.0
    is_minority: bool = False             # 是否属于少数派语义簇

@dataclass
class SignalCluster:
    """语义聚类后的线索簇"""
    cluster_id: str
    theme: str                            # LLM生成的主题标签
    sentiment: Optional[str] = None       # 平台LLM判断的簇整体情感倾向
    signals: List[ProcessedSignal] = field(default_factory=list)
    hard_fact_count: int = 0
    persona_count: int = 0

@dataclass
class PreprocessResult:
    """预处理管线输出"""
    task_id: str
    total_signals: int
    valid_signals: int
    clusters: List[SignalCluster] = field(default_factory=list)
    minority_clusters: List[SignalCluster] = field(default_factory=list)  # 少数派语义簇
    hard_fact_count: int = 0
    persona_count: int = 0
    # 注意：不再有 overall_direction / direction_distribution
    # 方向判断完全由因果推演引擎基于图谱分析得出
```

### 3.4 预处理管线 (SignalPreprocessor)

> **借鉴 MiroFish**: `ZepGraphMemoryUpdater` 的批量处理队列 + `PlatformActionLogger` 的结构化日志

```python
# backend/causal_engine/preprocessor/signal_preprocessor.py

class SignalPreprocessor:
    EVIDENCE_WEIGHTS = { EvidenceType.HARD_FACT: 1.0, EvidenceType.PERSONA_INFERENCE: 0.1 }
    DEDUP_SIMILARITY_THRESHOLD = 0.92

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    RELEVANCE_THRESHOLD = 0.2            # 过滤明显无关数据

    async def process(self, task_id, raw_predictions, market_query) -> PreprocessResult:
        """完整预处理管线"""
        # Step 1: 转换为 ProcessedSignal（解析 relevance_score + entity_tags）
        signals = self._parse_raw_predictions(task_id, raw_predictions)
        # Step 2: 语义去重（embedding余弦相似度 > 阈值 → 去重）
        signals = await self._deduplicate(signals)
        # Step 3: 隐私标记校验（确认 privacy_cleared=true，数据已在端侧插件完成脱敏）
        signals = self._validate_privacy_flag(signals)
        # Step 4: 赋予证据权重（hard_fact=1.0, persona=0.1）
        for s in signals:
            s.weight = self.EVIDENCE_WEIGHTS[s.evidence_type]
        # Step 4.5: 相关度过滤（利用Agent自评的relevance_score，过滤明显无关数据）
        signals = self._filter_by_relevance(signals)
        # Step 5: 语义聚类（LLM驱动 + entity_tags辅助聚类锚点）
        clusters = await self._semantic_clustering(signals, market_query)
        # Step 6: 边际贡献评分 Qi（LLM批量评估，结合entity_tags提升评估精度）
        signals = await self._compute_marginal_contribution(signals, market_query)
        # Step 7: 识别少数派语义簇（由平台LLM判断，非Agent自报）
        minority_clusters = self._identify_minority_clusters(clusters)
        # Step 8: 构建实体索引（汇总所有entity_tags，用于本体生成加速）
        entity_index = self._build_entity_index(signals)
        # Step 9: 汇总
        return self._build_result(task_id, signals, clusters, minority_clusters, entity_index)
```

**相关度过滤 & 实体索引**（传感器增强核心逻辑）：

> **借鉴 MiroFish**: `ZepToolsService.panorama_search` 中的 `relevance_score` 关键词匹配排序。
> DelphiGraph 的 relevance_score 在 Agent 端由本地 LLM 语义评估，比简单关键词匹配更准确。

```python
def _filter_by_relevance(self, signals):
    """过滤明显无关的数据（利用Agent自评的相关度）"""
    return [s for s in signals if s.relevance_score >= self.RELEVANCE_THRESHOLD]

def _build_entity_index(self, signals):
    """汇总所有Agent提取的实体标注，构建全局实体索引"""
    index = {}  # { entity_text: { type, role, signal_ids[], frequency } }
    for s in signals:
        for tag in s.entity_tags:
            key = tag.text.lower()
            if key not in index:
                index[key] = {
                    "text": tag.text, "type": tag.type, "role": tag.role,
                    "signal_ids": [], "frequency": 0
                }
            index[key]["signal_ids"].append(s.signal_id)
            index[key]["frequency"] += 1
    return index
```

**实体索引的下游价值**：
- **高频实体** → 自动成为因果本体的候选因子节点
- **role=cause 实体** → 因果关系的候选起点
- **role=target 实体** → 与预测目标直接相关
- **跨 Agent 出现的相同实体** → 独立验证，提升可信度

**语义聚类 Prompt 核心逻辑**：

```
输入：market_query + 所有线索文本 + 实体索引（高频实体列表）
要求：
1. 按主题/影响因素分组，3-8个聚类，每个给出简洁主题标签
2. 优先以高频实体为聚类锚点（如多个Agent都提到"裁员"→ 形成"就业形势"主题簇）
3. 平台LLM为每个聚类判断其对预测问题的情感倾向（positive/negative/neutral）
   注意：这是平台基于汇聚数据的判断，不是Agent的预测
输出：JSON { "clusters": [{ "theme": "...", "sentiment": "positive/negative/neutral",
                             "anchor_entities": ["裁员", "消费降级"],
                             "signal_indices": [...] }] }
```

**边际贡献评分 Qi Prompt（论文 §6.1）**：

```
评分标准：
- 1.0: 罕见、具体、可验证的硬核事实（如用户直接表达的购买/放弃意愿）
- 0.7-0.9: 有价值的具体细节（如具体行为数据、具体讨论内容）
- 0.4-0.6: 一般性信息，有一定参考价值
- 0.1-0.3: 泛泛内容，缺乏具体信息
- 0.0: 重复/无关/明显幻觉内容
```

**少数派识别规则（论文 §6.2）**：

> **关键变化**：少数派不再基于 Agent 自报的方向，而是由平台 LLM 在聚类后判断：
> 某个语义簇的情感倾向与多数簇相反，且该簇包含硬核事实支撑。

```python
def _identify_minority_clusters(self, clusters):
    """识别少数派语义簇 — 由平台LLM判断，非Agent预测"""
    if not clusters:
        return []
    # 统计各簇的情感倾向
    sentiment_weights = {}
    for c in clusters:
        s = c.sentiment or 'neutral'
        sentiment_weights[s] = sentiment_weights.get(s, 0) + len(c.signals)
    # 找出多数情感倾向
    majority_sentiment = max(sentiment_weights, key=sentiment_weights.get)
    # 少数派 = 情感倾向与多数不同 + 包含硬核事实 + 平均Qi > 0.5
    minorities = []
    for c in clusters:
        if (c.sentiment != majority_sentiment
            and c.hard_fact_count > 0
            and self._avg_qi(c) > 0.5):
            minorities.append(c)
    return minorities
```

### 3.5 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Agent角色 | 纯传感器（只采集/推演数据，不做预测） | 端侧只有局部视角，预测必须由上帝视角的平台完成 |
| 传感器增强 | Agent提供 `relevance_score` + `entity_tags` | 回答"数据是什么/多相关"而非"意味着什么"，仍属传感器职责 |
| 实体索引 | 汇总跨Agent实体形成全局索引 | 加速本体生成、提升聚类质量、跨Agent独立验证 |
| 情感标注 | 平台LLM在聚类时统一标注 | 由汇聚了海量数据的平台来判断，而非单一Agent |
| 去重 | embedding余弦相似度 | 语义级去重优于字符串匹配 |
| 聚类 | LLM驱动 + 实体锚点 | 高频实体作为聚类锚点，比纯语义聚类更稳定 |
| Qi评分 | LLM批量评估（非Shapley值） | Shapley复杂度过高，LLM语义评估已足够 |
| 少数派 | 基于语义簇情感倾向+证据类型+Qi | 平台视角识别异见簇，而非依赖Agent方向自报 |

---

---

**文档索引：**
- **[Part 1: 架构 + 预处理](./CAUSAL-GRAPH-ENGINE-IMPLEMENTATION.md)**（本文）
- [Part 2: 本体生成 + 图谱构建 + 推演引擎](./CAUSAL-GRAPH-ENGINE-PART2.md)
- [Part 3: 未来报纸 + 前端可视化 + DB Schema + API + 路线图](./CAUSAL-GRAPH-ENGINE-PART3.md)
