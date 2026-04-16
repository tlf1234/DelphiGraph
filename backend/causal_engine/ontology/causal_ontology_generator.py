"""
因果本体自动生成器 (CausalOntologyGenerator)

借鉴  OntologyGenerator 的 LLM 驱动本体生成流程。
核心差异：生成因果因子本体（经济因素/情绪/行为/政策/事件），
而非社交实体本体。

流程：
1. 输入预处理后的线索聚类 + 任务问题 + 实体索引
2. LLM 识别 5-8 个核心影响因子
3. LLM 推断因子间因果关系
4. 输出结构化本体
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..models.ontology import (
    PREDEFINED_RELATION_TYPES,
    CausalFactorType,
    CausalOntology,
    CausalRelationType,
)
from ..models.signal import EvidenceType, PreprocessResult

logger = logging.getLogger(__name__)


class CausalOntologyGenerator:
    """因果因子本体自动生成器"""

    SYSTEM_PROMPT = """你是因果逻辑图构建专家。你的唯一信息来源是用户提供的证据线索和聚类数据——严禁引入任何外部知识或对该任务的先验判断。

## 工作流程（必须按步骤执行）

**第一步：在 <reasoning> 标签内完成推理**
1. 梳理各聚类的核心主题，识别哪些是"原因类"信号（政策、事件、宏观数据），哪些是"结果类"信号（情绪反应、价格变动、市场行为）
2. 确定时序先后：领先因子（先发生的原因）→ 中间因子 → 滞后因子（结果）
3. 列出有明确证据支撑的因果关系，注明是硬核事实支撑还是画像推演支撑
4. 识别冲突或矛盾的信号

**第二步：输出 JSON**（在 reasoning 完成之后）

## 因子识别规则

✅ 必须：
- 识别 5-8 个核心影响因子，覆盖从"证据数据"到"预测目标"的完整因果路径
- 类别: macro_economic / sentiment / behavior / policy / event / other
- 必须包含一个"预测目标因子"作为终端节点（对应预测问题的直接答案）
- 区分领先因子（cause，时序在前）和滞后因子（effect，时序在后）
- **允许推断中间因果因子**：即使某因子未直接出现在证据文本中，只要能从证据数据合理推导出其存在（如"Fed加息 → 科技融资成本上升 → 目标"），就应将其纳入因子链
- 每个因子有明确含义和可观测性

❌ 禁止：
- 将预测目标本身（如"价格上涨"）列为驱动因子的 source
- 把结论性情绪（如"市场看涨情绪"）当作独立的 macro_economic 因子
- 创造与所有证据、聚类主题、实体索引完全无法关联的凭空因子
- 仅输出目标节点而不识别驱动因子链——即使证据与问题是间接关联，也必须推断中间路径并输出完整因子集

## 因果关系规则

✅ 必须：
- 只识别有证据支撑的关系
- 标明方向(A→B)和类型(DRIVES/INHIBITS/AMPLIFIES/TRIGGERS/CORRELATES_WITH/MITIGATES)
- 标明强度(strong/moderate/weak)和支撑证据数量
- 优先识别硬核事实支撑的强因果链
- reasoning 字段说明时序逻辑（为什么A在B之前发生）

❌ 禁止：
- 建立反向因果（把时序上的结果标为 source）
- evidence_count 超过实际提供的线索数量
- 循环依赖（A→B→A）

## 时序先导性参考
- 政策/监管事件 → 通常是领先因子
- 宏观经济数据发布 → 通常是领先因子
- 机构/大户行为 → 中间因子
- 散户情绪/舆论 → 通常是滞后因子
- 价格/市值变动 → 通常是最终结果（滞后因子）

## 输出格式

先输出 <reasoning>你的推理过程</reasoning>，再输出以下 JSON：

{
  "factor_types": [
    { "name": "因子名", "description": "...", "category": "...",
      "measurability": "quantitative/qualitative/mixed", "examples": ["..."],
      "source_clusters": ["聚类主题A", "聚类主题B"] }
  ],
  "causal_relations": [
    { "source_factor": "因子A", "target_factor": "因子B",
      "relation_type": "DRIVES", "strength": "strong",
      "evidence_count": 42, "reasoning": "A在时序上先于B，且有X条硬核事实支撑" }
  ],
  "analysis_target": "分析目标因子名"
}

## 硬性约束
- `analysis_target` 必须与用户 Prompt 中"分析目标名称（固定）"给出的字符串**完全一致**（字符精确匹配，禁止改写、翻译或添加任何修饰词），同时也必须与 `factor_types` 中某个因子的 `name` 完全一致
- `causal_relations` 中的 `source_factor` 和 `target_factor` 必须与 `factor_types` 中的 `name` 完全一致
- 每个因子的 `source_clusters` 必须填写至少一个来源聚类主题（与上方"线索聚类"中的主题名对应）
- 所有因子必须能从证据线索或其合理推断中找到支撑（允许中间因果路径推断，禁止完全凭空捏造）
- `factor_types` 不得为空，至少输出 5 个因子（含预测目标）
- **因果图连通性约束（最重要，违反此约束将导致整条因果链 impact=0、结论置信度归零）**：
  ① `causal_relations` 中**必须**存在至少一条边以 `analysis_target` 为 `target_factor`（直接边到达目标）
  ② 每个非目标因子必须能通过出边链路最终到达 `analysis_target`（允许经中间因子）
  ③ **输出前自检**：逐个检查每个非目标因子，追踪其出边链路直到 analysis_target 或确认断链；若断链，立即添加一条直接 DRIVES/INHIBITS 边到 analysis_target
  ④ 若某因子经检查实在无法合理关联到目标，从 factor_types 中删除该因子，而非保留孤岛节点
- **风险因子完整性约束**：若少数派语义簇的情感倾向为 `negative`，必须将其识别为独立的风险因子，通过 INHIBITS/MITIGATES/DAMPENS 关系连接到 `analysis_target` 或相关中间因子；严禁将负向信号合并进正向因子的 `source_clusters`——这会导致风险被掩盖、结论偏乐观
- **UAP v3 因子种子约束**：若用户 Prompt 中包含"Agent 标注的因果驱动力种子"表格，其中 role=因果原因 的实体必须优先作为因子名称的核心词；若已有完全匹配的因子，保留原名；若尚无对应因子，必须新建；禁止忽略种子表格中高频（独立Agent数≥2）的因果原因实体
- **二元/竞争性目标方向锚定约束**：当 analysis_target 是"A 还是 B""A 胜还是 B 胜""是否发生"等二元或对立性问题时，`causal_relations` 中每条以 analysis_target 为 target_factor 的边，**必须在 reasoning 字段中明确写明**："此边选择 DRIVES/INHIBITS，因为[源因子]在语义上对[analysis_target 中第一选项/正向结果]有[促进/抑制]作用。"  
  判断原则：若源因子的实现/增强使第一选项概率上升 → DRIVES；若使第一选项概率下降 → INHIBITS。  
  示例：target="民主党胜还是共和党胜"，源因子="消费者信心下滑"→ 消费者信心下滑对执政党不利，第一选项（民主党胜）概率下降 → 应选 INHIBITS；  
  源因子="经济数据改善"→ 对执政党有利 → DRIVES。  
  **禁止在未明确锚定参照系的情况下选择关系类型。**"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def generate(
        self,
        preprocess_result: PreprocessResult,
        task_query: str,
        additional_context: Optional[str] = None,
    ) -> CausalOntology:
        """生成因果本体"""
        user_prompt = self._build_user_prompt(
            preprocess_result, task_query, additional_context
        )

        try:
            result = await self.llm_client.chat_json(
                user_prompt,
                system_prompt=self.SYSTEM_PROMPT,
                temperature=0.3,
                max_tokens=6000,
            )
        except (ValueError, Exception) as e:
            logger.error("因果本体生成失败，使用最简 fallback 本体: %s", e)
            result = self._fallback_result(preprocess_result, task_query)

        ontology = self._parse_result(
            result, preprocess_result.task_id, task_query
        )
        # 因子数量不足（LLM 因证据不匹配只返回 1-2 个）→ 用聚类主题补充
        if len(ontology.factor_types) < 3:
            logger.warning(
                "本体因子数量不足（%d 个，< 3），使用聚类兜底补充",
                len(ontology.factor_types),
            )
            llm_target = ontology.analysis_target  # 保留 LLM 识别的目标名
            fallback = self._fallback_result(preprocess_result, task_query)
            if llm_target:
                for f in fallback["factor_types"]:
                    if f["name"] == "预测目标":
                        f["name"] = llm_target
                fallback["analysis_target"] = llm_target
                for rel in fallback.get("causal_relations", []):
                    if rel.get("target_factor") == "预测目标":
                        rel["target_factor"] = llm_target
            ontology = self._parse_result(
                fallback, preprocess_result.task_id, task_query
            )
        # 有因子但因果关系为空 → 合成兜底连通边，防止 Layer 4 节点游离
        if ontology.factor_types and not ontology.raw_causal_relations:
            target = ontology.analysis_target
            logger.warning(
                "因果关系为空，为 %d 个非目标因子合成 CORRELATES_WITH→目标 兜底边",
                sum(1 for ft in ontology.factor_types if ft.name != target),
            )
            for ft in ontology.factor_types:
                if ft.name != target:
                    ontology.raw_causal_relations.append({
                        "source_factor": ft.name,
                        "target_factor": target,
                        "relation_type": "CORRELATES_WITH",
                        "strength": "moderate",
                        "evidence_count": 1,
                        "reasoning": "兜底：LLM未输出显式因果关系，以相关性边确保图连通",
                    })
        ontology = self._validate(ontology)
        self._repair_connectivity(ontology)

        # ── 本体生成详情日志 ──────────────────────────────────────────
        factor_lines = "\n".join(
            f"    [{i+1}] {'★目标' if ft.name == ontology.analysis_target else '  因子'}"
            f"  {ft.name!r}  [{ft.category}]  可测性={ft.measurability}"
            for i, ft in enumerate(ontology.factor_types)
        )
        rel_lines = "\n".join(
            f"    {r.get('source_factor','?')} --{r.get('relation_type','?')}"
            f"({r.get('strength','?')},n={r.get('evidence_count',0)})--> "
            f"{r.get('target_factor','?')}"
            for r in ontology.raw_causal_relations
        )
        logger.info(
            "\n── 因果本体生成结果 ──────────────────────────────────────\n"
            "  分析目标 : %s\n"
            "  因子清单 (%d 个):\n%s\n"
            "  因果关系 (%d 条):\n%s\n"
            "─────────────────────────────────────────────────────────",
            ontology.analysis_target,
            len(ontology.factor_types),
            factor_lines or "    (无)",
            len(ontology.raw_causal_relations),
            rel_lines or "    (无)",
        )
        return ontology

    def _fallback_result(
        self, preprocess_result: PreprocessResult, task_query: str
    ) -> Dict[str, Any]:
        """LLM 解析失败时的最简 fallback，基于聚类数据构造最小可用本体"""
        target_name = "预测目标"
        factors = [
            {
                "name": target_name,
                "description": task_query,
                "category": "other",
                "measurability": "qualitative",
                "examples": [],
            }
        ]
        # 将每个语义簇转为 fallback 因子
        for cluster in preprocess_result.clusters[:6]:
            factors.append({
                "name": cluster.theme,
                "description": f"{cluster.theme}（{cluster.sentiment}信号，"
                               f"硬核{cluster.hard_fact_count}条）",
                "category": "other",
                "measurability": "qualitative",
                "examples": [],
            })
        causal_relations = [
            {
                "source_factor": f["name"],
                "target_factor": target_name,
                "relation_type": "DRIVES",
                "strength": "moderate",
                "evidence_count": 1,
                "reasoning": "fallback：LLM解析失败，按聚类主题直接映射",
            }
            for f in factors[1:]  # 跳过 target 本身
        ]
        return {
            "factor_types": factors,
            "causal_relations": causal_relations,
            "analysis_target": target_name,
        }

    def _build_user_prompt(
        self,
        preprocess_result: PreprocessResult,
        task_query: str,
        additional_context: Optional[str] = None,
    ) -> str:
        """构建用户 Prompt"""
        parts = [
            f"## 预测问题\n{task_query}",
            f"\n## 分析目标名称（固定，必须原样写入 JSON 的 analysis_target 字段）\n{task_query}",
        ]

        # 线索统计
        parts.append(
            f"\n## 线索统计\n"
            f"- 总线索: {preprocess_result.total_signals} "
            f"| 硬核事实: {preprocess_result.hard_fact_count} "
            f"| 画像推演: {preprocess_result.persona_count}"
        )

        # 实体索引
        if preprocess_result.entity_index:
            sorted_entities = sorted(
                preprocess_result.entity_index.values(),
                key=lambda x: x["frequency"],
                reverse=True,
            )[:20]
            entity_lines = [
                "\n## 实体索引（跨Agent汇总，按频次降序）",
                "| 实体 | 类型 | 角色 | 出现频次 | 独立Agent数 |",
                "|------|------|------|---------|------------|",
            ]
            for e in sorted_entities:
                entity_lines.append(
                    f"| {e['text']} | {e['type']} | {e['role']} "
                    f"| {e['frequency']} | {e.get('independent_agent_count', '?')} |"
                )
            entity_lines.append(
                "> 提示：高频实体是因子识别的强候选，role=cause 的实体可能是因果关系的起点"
            )
            parts.append("\n".join(entity_lines))

        # UAP v3: Agent 标注的因果驱动力种子（role=cause/indicator，优先作为因子命名依据）
        if preprocess_result.cause_entity_seeds:
            seed_parts = [
                "\n## Agent 标注的因果驱动力种子（UAP v3）",
                "> 以下实体由端侧 Agent 直接标注为因果原因(cause)或观测指标(indicator)，"
                "请优先以这些实体为核心命名对应因子，避免重新发明同义词",
                "| 实体 | 类型 | 角色 | 独立Agent数 | 频次 |",
                "|------|------|------|------------|------|",
            ]
            for seed in preprocess_result.cause_entity_seeds[:15]:
                role_label = "因果原因" if seed["role"] == "cause" else "观测指标"
                seed_parts.append(
                    f"| {seed['text']} | {seed.get('type', '')} | {role_label} "
                    f"| {seed['independent_agent_count']} | {seed['frequency']} |"
                )
            parts.append("\n".join(seed_parts))

        # 全局 Top 20 硬核事实（跨聚类最强证据，完整展示，作为因子推断的主锚点）
        all_sigs = [s for c in preprocess_result.clusters for s in c.signals]
        all_hard_facts = sorted(
            [s for s in all_sigs if s.evidence_type == EvidenceType.HARD_FACT],
            key=lambda s: s.quality_score * s.relevance_score,
            reverse=True,
        )[:20]
        if all_hard_facts:
            top_parts = [f"\n## 全局Top{len(all_hard_facts)}硬核事实（跨聚类最强证据）"]
            for i, s in enumerate(all_hard_facts, 1):
                line = (
                    f"{i}. [{'私有' if s.data_exclusivity == 'private' else s.data_exclusivity}]"
                    f"(Qi={s.quality_score:.2f}, 相关度={s.relevance_score:.2f}) "
                    f"{s.evidence_text[:400]}"
                )
                if s.relevance_reasoning:
                    line += f"\n   └─因果推理: {s.relevance_reasoning[:150]}"
                top_parts.append(line)
            parts.append("\n".join(top_parts))

        # 线索聚类（主流簇，少数派单独展示避免重复）
        # 按信号量降序展示，总信号量目标 ≤ 120 条
        minority_ids = {c.cluster_id for c in preprocess_result.minority_clusters}
        main_clusters = sorted(
            [c for c in preprocess_result.clusters if c.cluster_id not in minority_ids],
            key=lambda c: len(c.signals),
            reverse=True,
        )[:15]  # 上限 15 个主流簇
        n_clusters = max(len(main_clusters), 1)
        sigs_per_cluster = max(3, min(10, 120 // n_clusters))
        cluster_parts = ["\n## 线索聚类（主流簇，按信号量排序）"]
        for cluster in main_clusters:
            cluster_parts.append(
                f"\n### 主题: {cluster.theme} (情感倾向: {cluster.sentiment})"
            )
            if cluster.anchor_entities:
                cluster_parts.append(
                    f"- 锚点实体: {', '.join(cluster.anchor_entities)}"
                )
            cluster_parts.append(
                f"- 硬核事实 {cluster.hard_fact_count} 条, "
                f"画像推演 {cluster.persona_count} 条"
            )
            # 展示 Top N 高质量证据，每条截断 300 字
            sorted_signals = sorted(
                cluster.signals,
                key=lambda s: s.quality_score,
                reverse=True,
            )[:sigs_per_cluster]
            for s in sorted_signals:
                type_label = (
                    "硬核事实"
                    if s.evidence_type == EvidenceType.HARD_FACT
                    else "画像推演"
                )
                excl_label = {"private": "私有", "semi_private": "半私有"}.get(
                    s.data_exclusivity, "公开"
                )
                sig_line = (
                    f"  - [{type_label}][{excl_label}] (Qi={s.quality_score:.2f}, "
                    f"相关度={s.relevance_score:.2f}) "
                    f"{s.evidence_text[:250]}"
                )
                if s.relevance_reasoning:
                    sig_line += f"\n    └─因果推理: {s.relevance_reasoning[:100]}"
                cluster_parts.append(sig_line)
        parts.append("\n".join(cluster_parts))

        # 簇间逻辑关系（Step 5.5 显式提取结果）
        if preprocess_result.cluster_relations:
            rel_parts = [
                f"\n## 簇间逻辑关系（已显式提取，{len(preprocess_result.cluster_relations)} 条）",
                "> 提示：以下关系经独立分析得出，建议优先将 causes 类型的关系映射为因果图边，"
                "contradicts 类型提示存在对抗性因子",
            ]
            # causes 优先展示
            sorted_rels = sorted(
                preprocess_result.cluster_relations,
                key=lambda r: (
                    0 if r.relation_type == "causes" else
                    1 if r.relation_type == "contradicts" else
                    2 if r.relation_type == "conditional" else 3,
                    -r.confidence,
                ),
            )
            type_symbols = {
                "causes": "→",
                "supports": "≈",
                "contradicts": "⊗",
                "conditional": "⇒",
            }
            for rel in sorted_rels:
                sym = type_symbols.get(rel.relation_type, "?")
                direction_note = (
                    f"({rel.direction})" if rel.direction != "A->B" else ""
                )
                rel_parts.append(
                    f"- [{rel.relation_type}] 「{rel.source_theme}」{sym}「{rel.target_theme}」"
                    f" {direction_note} (置信度={rel.confidence:.2f}) — {rel.explanation}"
                )
            parts.append("\n".join(rel_parts))

        # 少数派
        if preprocess_result.minority_clusters:
            minority_parts = [
                f"\n## 少数派语义簇 ({len(preprocess_result.minority_clusters)} 个)",
                "> ⚠️ 风险因子规则：情感倾向为 negative 的簇必须生成独立风险因子（用 INHIBITS/MITIGATES/DAMPENS 连接目标），"
                "禁止将负向信号并入正向因子——否则风险被掩盖、结论失真",
            ]
            for mc in preprocess_result.minority_clusters:
                minority_parts.append(
                    f"\n### 主题: {mc.theme} (情感: {mc.sentiment})"
                )
                if mc.anchor_entities:
                    minority_parts.append(
                        f"- 锚点实体: {', '.join(mc.anchor_entities)}"
                    )
                for s in sorted(
                    mc.signals, key=lambda x: x.quality_score, reverse=True
                )[:5]:
                    type_label = (
                        "硬核事实"
                        if s.evidence_type == EvidenceType.HARD_FACT
                        else "画像推演"
                    )
                    excl_label = {"private": "私有", "semi_private": "半私有"}.get(
                        s.data_exclusivity, "公开"
                    )
                    sig_line = (
                        f"  - [{type_label}][{excl_label}] (Qi={s.quality_score:.2f}) "
                        f"{s.evidence_text[:200]}"
                    )
                    if s.relevance_reasoning:
                        sig_line += f"\n    └─因果推理: {s.relevance_reasoning[:80]}"
                    minority_parts.append(sig_line)
            parts.append("\n".join(minority_parts))

        # UAP v3.0: 画像维度摘要（帮助因子识别发现人群视角差异）
        persona_summary = preprocess_result.persona_summary
        if persona_summary and persona_summary.get("dimensions"):
            coverage = persona_summary.get("coverage_rate", 0)
            if coverage >= 0.1:
                persona_parts = [
                    f"\n## 人群画像摘要（覆盖率 {coverage:.0%}）"
                ]
                dim_labels = {
                    "occupation": "职业", "age_range": "年龄段",
                    "region": "地区", "income_level": "收入水平",
                }
                for dim, dist in persona_summary["dimensions"].items():
                    if dim in dim_labels and dist:
                        sorted_items = sorted(
                            dist.items(), key=lambda x: x[1], reverse=True
                        )[:5]
                        items_str = ", ".join(
                            f"{k}({v})" for k, v in sorted_items
                        )
                        persona_parts.append(
                            f"- {dim_labels[dim]}: {items_str}"
                        )
                # 簇级别差异
                for cluster in preprocess_result.clusters:
                    if cluster.persona_distribution:
                        occ = cluster.persona_distribution.get("occupation", {})
                        if occ:
                            top = sorted(occ.items(), key=lambda x: x[1], reverse=True)[:2]
                            occ_str = ", ".join(f"{k}({v})" for k, v in top)
                            persona_parts.append(
                                f"- 簇「{cluster.theme}」({cluster.sentiment}): 职业={occ_str}"
                            )
                persona_parts.append(
                    "> 提示：不同人群的观点分化可作为独立因子节点，"
                    "如'金融从业者看涨 vs 科技从业者看跌'本身是因果信号"
                )
                parts.append("\n".join(persona_parts))

        parts.append(
            "\n注意：情感倾向由平台LLM基于汇聚数据判断，"
            "端侧Agent只提供原始数据不做预测\n"
            "实体索引中的 role 标注来自Agent端传感器，仅供参考，因子识别需综合判断"
        )

        if additional_context:
            parts.append(f"\n## 补充信息\n{additional_context}")

        return "\n".join(parts)

    def _parse_result(
        self, result: Dict[str, Any], task_id: str, task_query: str
    ) -> CausalOntology:
        """解析 LLM 输出为结构化本体"""
        factor_types = [
            CausalFactorType.from_dict(f)
            for f in result.get("factor_types", [])
        ]

        # 始终包含预定义关系类型
        relation_types = [
            CausalRelationType(
                name=name,
                description=info["description"],
                direction=info["direction"],
            )
            for name, info in PREDEFINED_RELATION_TYPES.items()
        ]

        return CausalOntology(
            task_id=task_id,
            task_query=task_query,
            factor_types=factor_types,
            relation_types=relation_types,
            raw_causal_relations=result.get("causal_relations", []),
            analysis_target=result.get("analysis_target", ""),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _repair_connectivity(ontology: CausalOntology) -> None:
        """检查 raw_causal_relations 连通性，为无法到达 analysis_target 的叶子因子补合成边。

        与 CausalGraphBuilder._repair_orphan_connectivity 形成双重保险：
        本方法在 Phase 2（本体层）修复，构建器方法在 Phase 3（图层）修复。
        """
        target = ontology.analysis_target
        if not target or not ontology.factor_types:
            return

        factor_names = {ft.name for ft in ontology.factor_types if ft.name != target}
        if not factor_names:
            return

        # 出边邻接表
        adj: Dict[str, List[str]] = {}
        for r in ontology.raw_causal_relations:
            src = r.get("source_factor", "")
            tgt = r.get("target_factor", "")
            if src and tgt:
                adj.setdefault(src, []).append(tgt)

        def _can_reach(start: str) -> bool:
            visited: set = set()
            queue = [start]
            while queue:
                cur = queue.pop()
                if cur == target:
                    return True
                if cur in visited:
                    continue
                visited.add(cur)
                queue.extend(adj.get(cur, []))
            return False

        orphan_names = {n for n in factor_names if not _can_reach(n)}
        if not orphan_names:
            return

        # 叶子孤岛：出边全部指向其他孤岛（或无出边）
        leaf_orphans = [
            name for name in orphan_names
            if all(nb in orphan_names for nb in adj.get(name, []))
        ]

        # 从因子对象中查 evidence_direction 已无意义（此时图尚未构建），
        # 改用 category 粗判：event/policy 类型默认 DRIVES，其余也 DRIVES
        repaired = []
        for name in leaf_orphans:
            ontology.raw_causal_relations.append({
                "source_factor": name,
                "target_factor": target,
                "relation_type": "DRIVES",
                "strength": "moderate",
                "evidence_count": 1,
                "reasoning": f"[本体连通修复] {name} 为孤岛叶子节点，自动添加 DRIVES 边确保图连通",
            })
            adj.setdefault(name, []).append(target)
            repaired.append(name)

        if repaired:
            logger.warning(
                "本体连通修复: 为 %d 个孤岛叶子因子补合成边 → %s",
                len(repaired), ", ".join(f"'{n}'" for n in repaired),
            )

    @staticmethod
    def _validate(ontology: CausalOntology) -> CausalOntology:
        """验证本体完整性"""
        errors = ontology.validate()
        if errors:
            logger.warning("本体验证问题: %s", errors)

        # 因子数量截取：按「有出边 → 有入边 → 孤立」重要性排序后再截取，保住因果链完整性
        if len(ontology.factor_types) > 12:
            logger.warning(
                "因子数量 %d 超过上限 12，按重要性排序后截取",
                len(ontology.factor_types),
            )
            rel_sources = {r.get("source_factor") for r in ontology.raw_causal_relations}
            rel_targets = {r.get("target_factor") for r in ontology.raw_causal_relations}
            def _factor_priority(ft: CausalFactorType) -> int:
                if ft.name == ontology.analysis_target:
                    return 0   # 预测目标最高优先级
                if ft.name in rel_sources:
                    return 1   # 因果链起点（有出边）
                if ft.name in rel_targets:
                    return 2   # 因果链途经（有入边）
                return 3       # 孤立因子最低优先级
            ontology.factor_types = sorted(ontology.factor_types, key=_factor_priority)[:12]

        # 确保预测目标因子存在
        factor_names = {f.name for f in ontology.factor_types}
        if ontology.analysis_target and ontology.analysis_target not in factor_names:
            logger.warning(
                "预测目标因子 '%s' 不在因子列表中，尝试模糊匹配",
                ontology.analysis_target,
            )
            # 模糊匹配：子串 + 公共字符比例
            target_lower = ontology.analysis_target.lower()
            best_match: Optional[str] = None
            best_score = 0.0
            for name in factor_names:
                name_lower = name.lower()
                if target_lower in name_lower or name_lower in target_lower:
                    score = len(set(target_lower) & set(name_lower)) / max(
                        len(set(target_lower) | set(name_lower)), 1
                    )
                    if score > best_score:
                        best_score = score
                        best_match = name
            if best_match:
                ontology.analysis_target = best_match
                logger.info("模糊匹配到因子: %s", best_match)
            else:
                # 兜底：将 analysis_target 作为新因子注入，确保目标节点存在
                logger.warning(
                    "模糊匹配失败，自动注入预测目标因子: %s",
                    ontology.analysis_target,
                )
                ontology.factor_types.append(
                    CausalFactorType(
                        name=ontology.analysis_target,
                        description=f"预测目标: {ontology.analysis_target}",
                        category="event",
                        measurability="qualitative",
                    )
                )

        return ontology
