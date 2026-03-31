# DelphiGraph 因果逻辑图引擎 — Part 2: 本体生成、图谱构建、推演引擎

> 接续 [Part 1](./CAUSAL-GRAPH-ENGINE-IMPLEMENTATION.md)

---

## 4. 模块二：因果本体自动生成



### 4.2 因果本体数据结构

```python
# backend/causal_engine/models/ontology.py

@dataclass
class CausalFactorType:
    """因果因子类型"""
    name: str                         # 如 "裁员潮冲击"
    description: str
    category: str                     # macro_economic / sentiment / behavior / policy / event / other
    measurability: str                # quantitative / qualitative / mixed
    examples: List[str] = field(default_factory=list)

@dataclass
class CausalRelationType:
    """因果关系类型"""
    name: str                         # DRIVES / INHIBITS / AMPLIFIES / TRIGGERS / CORRELATES_WITH / MITIGATES
    description: str
    direction: str                    # positive / negative / neutral
    typical_strength: str             # strong / moderate / weak

@dataclass
class CausalOntology:
    """因果本体定义"""
    task_id: str
    market_query: str
    factor_types: List[CausalFactorType]
    relation_types: List[CausalRelationType]
    # LLM 同时输出的原始因果关系（供图谱构建使用）
    raw_causal_relations: List[Dict] = field(default_factory=list)
    prediction_target: str = ""       # 预测目标因子名称
    generated_at: str = ""
```

**预定义关系类型**（始终包含，LLM 可在此基础上扩展）：

| 关系 | 语义 | 方向 |
|------|------|------|
| `DRIVES` | A增加→B增加 | positive |
| `INHIBITS` | A增加→B减少 | negative |
| `AMPLIFIES` | A增强B的变化幅度 | positive |
| `TRIGGERS` | A发生→触发B出现 | positive |
| `CORRELATES_WITH` | A和B相关但因果方向不明确 | neutral |
| `MITIGATES` | A的存在降低B的影响 | negative |

### 4.3 因果本体生成器

```python
# backend/causal_engine/ontology/causal_ontology_generator.py

class CausalOntologyGenerator:
    """
    因果因子本体自动生成器

    流程：
    1. 输入预处理后的线索聚类 + 市场问题
    2. LLM 识别 5-8 个核心影响因子
    3. LLM 推断因子间因果关系
    4. 输出结构化本体
    """

    SYSTEM_PROMPT = """你是因果逻辑图构建专家。分析证据线索，识别核心影响因子和因果关系。

## 因子识别规则
1. 必须识别 5-8 个核心影响因子
2. 类别: macro_economic / sentiment / behavior / policy / event / other
3. 必须包含一个 "预测目标因子" 作为因果图终端节点
4. 每个因子需有明确含义和可观测性

## 因果关系规则
1. 只识别有证据支撑的关系，不凭空假设
2. 标明方向(A→B)和类型(DRIVES/INHIBITS/AMPLIFIES/TRIGGERS/CORRELATES_WITH/MITIGATES)
3. 标明强度(strong/moderate/weak)和支撑证据数量
4. 优先识别硬核事实支撑的强因果链

## 输出 JSON
{
  "factor_types": [
    { "name": "因子名", "description": "...", "category": "...",
      "measurability": "quantitative/qualitative/mixed", "examples": ["..."] }
  ],
  "causal_relations": [
    { "source_factor": "因子A", "target_factor": "因子B",
      "relation_type": "DRIVES", "strength": "strong",
      "evidence_count": 42, "reasoning": "推断依据" }
  ],
  "prediction_target": "预测目标因子名"
}"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def generate(self, preprocess_result, market_query, additional_context=None) -> CausalOntology:
        user_prompt = self._build_user_prompt(preprocess_result, market_query, additional_context)
        result = await self.llm_client.chat_json(
            user_prompt, system_prompt=self.SYSTEM_PROMPT, temperature=0.3, max_tokens=4000
        )
        ontology = self._parse_result(result, preprocess_result.task_id, market_query)
        ontology = self._validate(ontology)
        return ontology
```

**用户 Prompt 构建逻辑**（`_build_user_prompt`）：

```
## 预测问题
{market_query}

## 线索统计
- 总线索: {total} | 硬核事实: {hard} | 画像推演: {persona}

## 实体索引（跨Agent汇总，按频次降序）
| 实体 | 类型 | 角色 | 出现频次 | 独立Agent数 |
|------|------|------|---------|------------|
| 裁员 | event | cause | 47 | 31 |
| 特斯拉 | brand | target | 89 | 62 |
| 消费降级 | trend | context | 23 | 18 |
...
> 提示：高频实体是因子识别的强候选，role=cause 的实体可能是因果关系的起点

## 线索聚类
### 主题: {cluster.theme} (情感倾向: {cluster.sentiment})
- 锚点实体: {cluster.anchor_entities}
- 硬核事实 N 条, 画像推演 M 条
  - [硬核事实] (Qi=0.85, 相关度=0.95) 证据摘要...
  - [画像推演] (Qi=0.40, 相关度=0.60) 证据摘要...

## 少数派语义簇 (K 个)
### 主题: {minority_cluster.theme} (情感: {sentiment})
- 锚点实体: {cluster.anchor_entities}
  - [硬核事实] (Qi=0.90, 相关度=0.92) 证据摘要...

注意：情感倾向由平台LLM基于汇聚数据判断，端侧Agent只提供原始数据不做预测
实体索引中的 role 标注来自Agent端传感器，仅供参考，因子识别需综合判断
```

**验证规则**（`_validate`）：
- 因子数量必须 3-12 个（不足则报错，超出则截取）
- 必须存在预测目标因子
- 确保内置6种关系类型都可用

---

## 5. 模块三：因果逻辑图构建引擎

### 5.1 设计理念

> - 有向加权图（非平面记录图）  
> - 每条边附带**证据溯源**（可下钻到原始线索，端侧已完成脱敏）

### 5.2 因果图数据结构

```python
# backend/causal_engine/models/causal_graph.py

@dataclass
class CausalNode:
    """因果因子节点"""
    node_id: str                          # 自动生成 UUID
    name: str                             # 因子名称
    description: str
    category: str                         # macro_economic / sentiment / ...

    # 证据统计
    hard_fact_count: int = 0
    persona_count: int = 0
    total_evidence_count: int = 0

    # 评分
    confidence: float = 0.0               # 因子置信度（证据质量加权）
    impact_score: float = 0.0             # 对预测目标的影响强度

    # 特殊标记
    is_prediction_target: bool = False
    is_minority_driven: bool = False      # 由少数派信号驱动

    # 证据溯源
    evidence_ids: List[str] = field(default_factory=list)


@dataclass
class CausalEdge:
    """因果关系边"""
    edge_id: str
    source_node_id: str                   # 因节点
    target_node_id: str                   # 果节点
    relation_type: str                    # DRIVES / INHIBITS / ...

    # 权重
    weight: float = 0.0                   # 0-1
    strength: str = "moderate"
    direction: str = "positive"           # positive / negative / neutral

    # 证据溯源
    evidence_count: int = 0
    hard_fact_ratio: float = 0.0          # 硬核事实占比
    reasoning: str = ""
    evidence_ids: List[str] = field(default_factory=list)


@dataclass
class CausalGraph:
    """完整的因果逻辑图"""
    graph_id: str
    task_id: str
    market_query: str

    nodes: List[CausalNode]
    edges: List[CausalEdge]

    # 预测结论
    prediction_target_node_id: str = ""
    prediction_direction: str = ""        # bullish / bearish / neutral
    prediction_confidence: float = 0.0
    confidence_interval: Dict = field(default_factory=dict)  # {"low","mid","high"}

    # 分析结果
    critical_paths: List[List[str]] = field(default_factory=list)
    minority_warning: Optional[str] = None
    minority_node_ids: List[str] = field(default_factory=list)

    # 元数据
    version: int = 1
    total_signals_used: int = 0
    hard_fact_count: int = 0
    persona_count: int = 0
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict:
        """序列化为前端可用的 JSON"""
        return {
            "graph_id": self.graph_id,
            "task_id": self.task_id,
            "market_query": self.market_query,
            "nodes": [{ "id": n.node_id, "name": n.name, "description": n.description,
                        "category": n.category, "hard_fact_count": n.hard_fact_count,
                        "persona_count": n.persona_count, "confidence": n.confidence,
                        "impact_score": n.impact_score, "is_target": n.is_prediction_target,
                        "is_minority": n.is_minority_driven } for n in self.nodes],
            "edges": [{ "id": e.edge_id, "source": e.source_node_id, "target": e.target_node_id,
                        "relation": e.relation_type, "weight": e.weight, "strength": e.strength,
                        "direction": e.direction, "evidence_count": e.evidence_count,
                        "hard_fact_ratio": e.hard_fact_ratio, "reasoning": e.reasoning
                      } for e in self.edges],
            "prediction": { "target_node_id": self.prediction_target_node_id,
                            "direction": self.prediction_direction,
                            "confidence": self.prediction_confidence,
                            "confidence_interval": self.confidence_interval },
            "critical_paths": self.critical_paths,
            "minority": { "warning": self.minority_warning, "node_ids": self.minority_node_ids },
            "meta": { "version": self.version, "total_signals": self.total_signals_used,
                      "hard_facts": self.hard_fact_count, "personas": self.persona_count,
                      "created_at": self.created_at, "updated_at": self.updated_at }
        }
```

### 5.3 图谱构建器

```python
# backend/causal_engine/builder/causal_graph_builder.py

class CausalGraphBuilder:
    """
    因果逻辑图构建引擎

    - create_graph → _build_nodes
    - set_ontology → 使用 CausalOntology 定义
    - add_text_batch → _bind_evidence（批量绑定证据）
    - wait_for_processing → progress_callback

    核心差异: 自建图结构 + 有向加权 + 证据溯源
    """

    def __init__(self, llm_client=None, db_client=None):
        self.llm_client = llm_client
        self.db_client = db_client

    async def build(self, ontology, preprocess_result, progress_callback=None) -> CausalGraph:
        graph = CausalGraph(...)
        total_steps = 5

        # Step 1: 构建因子节点（来自本体定义的 factor_types）
        if progress_callback: await progress_callback(1, total_steps, "构建因果因子节点...")
        graph.nodes = self._build_nodes(ontology, preprocess_result)

        # Step 2: 构建因果边（来自本体的 raw_causal_relations）
        if progress_callback: await progress_callback(2, total_steps, "构建因果关系边...")
        graph.edges = self._build_edges(ontology, graph.nodes)

        # Step 3: 绑定证据溯源（聚类→节点映射）
        if progress_callback: await progress_callback(3, total_steps, "绑定证据溯源...")
        self._bind_evidence(graph, preprocess_result)

        # Step 4: 计算节点影响力评分（路径权重传播）
        if progress_callback: await progress_callback(4, total_steps, "计算影响力评分...")
        self._compute_impact_scores(graph)

        # Step 5: 标注少数派节点
        if progress_callback: await progress_callback(5, total_steps, "标注少数派信号...")
        self._mark_minority_nodes(graph, preprocess_result)

        # 持久化
        await self._save_to_db(graph)
        return graph
```

**Step 1: 节点构建**

```python
def _build_nodes(self, ontology, preprocess_result):
    nodes = []
    for ft in ontology.factor_types:
        node = CausalNode(
            name=ft.name, description=ft.description, category=ft.category,
            is_prediction_target=(ft.name == ontology.prediction_target)
        )
        nodes.append(node)
    return nodes
```

**Step 2: 边构建**

```python
def _build_edges(self, ontology, nodes):
    node_name_map = {n.name: n.node_id for n in nodes}
    edges = []
    for rel in ontology.raw_causal_relations:
        source_id = node_name_map.get(rel["source_factor"])
        target_id = node_name_map.get(rel["target_factor"])
        if not source_id or not target_id:
            continue
        weight = self._compute_edge_weight(rel["evidence_count"], rel["strength"])
        edges.append(CausalEdge(
            source_node_id=source_id, target_node_id=target_id,
            relation_type=rel["relation_type"], weight=weight,
            strength=rel["strength"], evidence_count=rel["evidence_count"],
            reasoning=rel.get("reasoning", ""),
            direction="positive" if rel["relation_type"] in ["DRIVES","AMPLIFIES","TRIGGERS"]
                      else "negative" if rel["relation_type"] in ["INHIBITS","MITIGATES"]
                      else "neutral"
        ))
    return edges

@staticmethod
def _compute_edge_weight(evidence_count, strength):
    multiplier = {"strong": 1.0, "moderate": 0.6, "weak": 0.3}
    base = min(evidence_count / 100.0, 1.0)  # 100条时饱和
    return base * multiplier.get(strength, 0.5)
```

**Step 3: 证据绑定** — 将预处理聚类中的线索关联到最匹配的因子节点：

```python
def _bind_evidence(self, graph, preprocess_result):
    for cluster in preprocess_result.clusters:
        best_node = self._find_best_matching_node(cluster.theme, graph.nodes)
        if best_node:
            for sig in cluster.signals:
                best_node.evidence_ids.append(sig.signal_id)
                if sig.evidence_type == EvidenceType.HARD_FACT:
                    best_node.hard_fact_count += 1
                else:
                    best_node.persona_count += 1
                best_node.total_evidence_count += 1
            # 节点置信度 = 证据质量加权平均（基于 Qi 和证据类型权重，不涉及 Agent 置信度）
            weighted = sum(s.weight * s.quality_score for s in cluster.signals)
            total_w = sum(s.weight for s in cluster.signals) or 1
            best_node.confidence = weighted / total_w
```

> 注意：`_find_best_matching_node` 初期用关键词重叠，后续可升级为 embedding 余弦匹配。

**Step 4: 影响力评分** — 简化 PageRank 变体：从源节点向预测目标传播路径权重：

```python
def _compute_impact_scores(self, graph):
    target_id = next((n.node_id for n in graph.nodes if n.is_prediction_target), None)
    adj = {e.source_node_id: [] for e in graph.edges}
    for e in graph.edges:
        adj[e.source_node_id].append((e.target_node_id, e.weight))
    for node in graph.nodes:
        if node.is_prediction_target:
            node.impact_score = 1.0
        else:
            node.impact_score = self._find_max_path_weight(node.node_id, target_id, adj)
```

**Step 5: 少数派标注** — 与预处理结果交叉匹配，标注少数派驱动的节点并生成警告文案。

---

## 6. 模块四：因果推演引擎

### 6.1 定位

这是 DelphiGraph **独有的核心创新模块**。基于因果逻辑图执行推演，生成最终预测结论。

### 6.2 推演流程

```python
# backend/causal_engine/inference/causal_inference_engine.py

class CausalInferenceEngine:
    """
    因果推演引擎 — 论文 §5.4 的工程实现

    五大核心能力：
    1. 关键路径计算（最强因果链）
    2. 概率传播（证据→预测的置信度传导）
    3. 冲突消解（多视角推理）
    4. 敏感性分析（哪个因子影响最大）
    5. 最终结论 + 置信区间
    """

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def infer(self, graph, preprocess_result) -> CausalGraph:
        # 1. 关键因果路径（修改Dijkstra-最大路径权重，Top 3路径）
        graph.critical_paths = self._find_critical_paths(graph)

        # 2. 概率传播（拓扑排序 → 按边方向+权重传播置信度）
        self._propagate_confidence(graph)

        # 3. 冲突检测+消解（同一节点接收正/负向入边 → LLM多视角推理）
        conflicts = self._detect_conflicts(graph)
        if conflicts:
            await self._resolve_conflicts(graph, conflicts)

        # 4. 敏感性分析（逐个模拟移除因子，衡量对目标的影响）
        sensitivity = self._sensitivity_analysis(graph)

        # 5. LLM综合推演 → 预测方向+置信度+置信区间
        conclusion = await self._generate_conclusion(graph, preprocess_result, sensitivity)
        graph.prediction_direction = conclusion["direction"]
        graph.prediction_confidence = conclusion["confidence"]
        graph.confidence_interval = conclusion["confidence_interval"]

        return graph
```

### 6.3 关键路径计算

```python
def _find_critical_paths(self, graph) -> List[List[str]]:
    """从源节点（入度=0）到预测目标节点的最大权重路径"""
    target_id = next((n.node_id for n in graph.nodes if n.is_prediction_target), None)
    # 构建邻接表
    adj = {}
    for e in graph.edges:
        adj.setdefault(e.source_node_id, []).append((e.target_node_id, e.weight))
    # 找源节点（入度=0）
    all_targets = {e.target_node_id for e in graph.edges}
    source_nodes = {e.source_node_id for e in graph.edges} - all_targets
    # DFS 找所有路径，按累积权重排序，取 Top 3
    all_paths = []
    for src in source_nodes:
        paths = self._dfs_all_paths(src, target_id, adj, max_depth=6)
        all_paths.extend(paths)
    all_paths.sort(key=lambda p: p[1], reverse=True)
    return [p[0] for p in all_paths[:3]]
```

### 6.4 概率传播

```python
def _propagate_confidence(self, graph):
    """拓扑排序 → 从源节点向目标传播置信度"""
    in_degree = {n.node_id: 0 for n in graph.nodes}
    adj = {}
    for e in graph.edges:
        adj.setdefault(e.source_node_id, []).append((e.target_node_id, e.weight, e.direction))
        in_degree[e.target_node_id] += 1
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    node_map = {n.node_id: n for n in graph.nodes}
    while queue:
        nid = queue.pop(0)
        current = node_map.get(nid)
        for neighbor_id, weight, direction in adj.get(nid, []):
            neighbor = node_map.get(neighbor_id)
            influence = current.confidence * weight * (-1 if direction == "negative" else 1)
            neighbor.confidence = (neighbor.confidence + abs(influence)) / 2
            in_degree[neighbor_id] -= 1
            if in_degree[neighbor_id] == 0:
                queue.append(neighbor_id)
```

### 6.5 冲突消解（论文 §5.4 步骤4）

```python
def _detect_conflicts(self, graph):
    """检测同一节点接收正向+负向入边的冲突"""
    node_incoming = {}
    for e in graph.edges:
        node_incoming.setdefault(e.target_node_id, []).append(e)
    conflicts = []
    for node_id, edges in node_incoming.items():
        pos = [e for e in edges if e.direction == "positive"]
        neg = [e for e in edges if e.direction == "negative"]
        if pos and neg:
            conflicts.append({
                "node_id": node_id,
                "positive_count": len(pos), "negative_count": len(neg),
                "positive_weight": sum(e.weight for e in pos),
                "negative_weight": sum(e.weight for e in neg)
            })
    return conflicts

async def _resolve_conflicts(self, graph, conflicts):
    """LLM 多视角推理消解冲突，输出方向判断+置信度惩罚"""
    prompt = f"""以下因果图节点存在方向冲突：
{self._format_conflicts(conflicts)}
请分析每个冲突，输出 JSON:
{{ "resolutions": [{{ "node_id": "...", "resolved_direction": "positive/negative",
   "confidence_penalty": 0.1, "reasoning": "..." }}] }}"""
    result = await self.llm_client.chat_json(prompt)
    for r in result.get("resolutions", []):
        node = next((n for n in graph.nodes if n.node_id == r["node_id"]), None)
        if node:
            node.confidence = max(0, node.confidence - r.get("confidence_penalty", 0.1))
```

### 6.6 敏感性分析

```python
def _sensitivity_analysis(self, graph) -> Dict[str, float]:
    """逐因子评估移除后对目标节点的影响"""
    sensitivity = {}
    for node in graph.nodes:
        if node.is_prediction_target:
            continue
        related_edges = [e for e in graph.edges
                         if e.source_node_id == node.node_id or e.target_node_id == node.node_id]
        total_edge_weight = sum(e.weight for e in related_edges)
        sensitivity[node.name] = total_edge_weight * node.confidence
    return sensitivity
```

### 6.7 最终结论生成

```python
async def _generate_conclusion(self, graph, preprocess_result, sensitivity) -> Dict:
    prompt = f"""你是宏观大脑。基于因果逻辑图分析生成预测结论。

## 预测问题
{graph.market_query}

## 因果因子（按影响力排序）
{self._format_nodes_ranked(graph)}

## 关键因果路径
{self._format_paths(graph)}

## 敏感性分析
{self._format_sensitivity(sensitivity)}

## 线索统计
总: {preprocess_result.total_signals} | 硬核事实: {preprocess_result.hard_fact_count} | 画像: {preprocess_result.persona_count}
少数派语义簇: {len(preprocess_result.minority_clusters)} 个
注：方向预测由你（宏观大脑）基于因果图分析得出，端侧Agent不提供方向判断

## 输出 JSON
{{ "direction": "bullish/bearish/neutral",
   "confidence": 0.75,
   "confidence_interval": {{ "low": 0.60, "mid": 0.75, "high": 0.85 }},
   "key_drivers": ["因子1", "因子2"],
   "risk_factors": ["风险因子"],
   "minority_assessment": "少数派评估",
   "one_line_conclusion": "一句话结论" }}"""
    return await self.llm_client.chat_json(prompt, temperature=0.2)
```

### 6.8 设计决策总结

| 决策 | 选择 | 理由 |
|------|------|------|
| 路径算法 | DFS + 累积权重排序 | 因果图规模小（5-12节点），DFS已足够 |
| 概率传播 | 拓扑排序+加权平均 | 简单高效，避免循环依赖 |
| 冲突消解 | LLM多视角推理 | 因果冲突需要语义理解，非纯数值可解 |
| 敏感性 | 边权重×节点置信度 | 轻量近似，后续可升级为蒙特卡洛模拟 |
| 最终结论 | LLM综合推演 | 整合定量分析+语义理解，输出人类可读结论 |

---

> 接续：[Part 3 - 未来报纸 + 前端可视化 + DB/API/路线图](./CAUSAL-GRAPH-ENGINE-PART3.md)
