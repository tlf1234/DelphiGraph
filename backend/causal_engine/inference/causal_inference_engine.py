"""
因果推演引擎 (CausalInferenceEngine)

DelphiGraph 独有的核心创新模块。
基于因果逻辑图执行推演，生成最终预测结论。

五大核心能力：
1. 关键路径计算（最强因果链）
2. 概率传播（证据→预测的置信度传导）
3. 冲突消解（多视角推理）
4. 敏感性分析（哪个因子影响最大）
5. 最终结论 + 置信区间
"""

import logging
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

from ..models.causal_graph import CausalGraph, CausalNode
from ..models.signal import PreprocessResult

logger = logging.getLogger(__name__)


class CausalInferenceEngine:
    """因果推演引擎 — 论文 §5.4 的工程实现"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def infer(
        self, graph: CausalGraph, preprocess_result: PreprocessResult
    ) -> CausalGraph:
        """完整推演流程"""
        _infer_start = time.time()

        # 1. 关键因果路径（Top 3 路径）
        _t = time.time()
        graph.critical_paths = self._find_critical_paths(graph)
        _t1 = round(time.time() - _t, 3)
        _path_lines = "\n".join(
            f"    路径{i+1}: {' → '.join(p)}"
            for i, p in enumerate(graph.critical_paths)
        ) or "    (未找到路径)"
        logger.info(
            "Step 1: 找到 %d 条关键路径 (%.3fs):\n%s",
            len(graph.critical_paths), _t1, _path_lines,
        )

        # 2. 冲突检测+消解（先于概率传播，确保节点解析方向在传播时可用）
        _t = time.time()
        conflicts = self._detect_conflicts(graph)
        conflict_resolutions: List[Dict] = []
        if conflicts:
            logger.info("Step 2: 检测到 %d 个冲突，启动消解", len(conflicts))
            conflict_resolutions = await self._resolve_conflicts(graph, conflicts)
        else:
            logger.info("Step 2: 无冲突")
        _t2 = round(time.time() - _t, 3)
        logger.info("Step 2: 冲突处理完成 (%.3fs, LLM调用=%s)", _t2, "是" if conflicts else "否")

        # 3. 概率传播（冲突消解后执行，传播时尊重节点解析方向）
        _t = time.time()
        self._propagate_confidence(graph)
        _t3 = round(time.time() - _t, 3)
        logger.info("Step 3: 概率传播完成 (%.3fs)", _t3)

        # 4. 敏感性分析
        _t = time.time()
        sensitivity = self._sensitivity_analysis(graph)
        _t4 = round(time.time() - _t, 3)
        logger.info("Step 4: 敏感性分析完成，%d 个因子 (%.3fs)", len(sensitivity), _t4)

        # 5. LLM 综合推演 → 分析方向+置信度+置信区间
        _t = time.time()
        conclusion = await self._generate_conclusion(
            graph, preprocess_result, sensitivity, conflict_resolutions
        )
        _t5 = round(time.time() - _t, 3)
        graph.analysis_direction = conclusion.get("direction", "neutral")
        graph.analysis_confidence = float(
            conclusion.get("confidence", 0.5)
        )
        graph.confidence_interval = conclusion.get(
            "confidence_interval", {"low": 0.3, "mid": 0.5, "high": 0.7}
        )
        # 将 sensitivity 和 conflict_resolutions 注入结论，供下游（报纸生成）使用
        # （_generate_conclusion 只返回 LLM JSON，这两项在其调用链外部计算）
        conclusion["_sensitivity_scores"] = sensitivity
        if conflict_resolutions:
            conclusion["_conflict_resolutions"] = conflict_resolutions
        graph.raw_conclusion = conclusion  # 保留完整LLM推理输出供下游使用
        _ci = graph.confidence_interval
        _kd = conclusion.get("key_drivers", [])
        _rf = conclusion.get("risk_factors", [])
        _one = conclusion.get("one_line_conclusion", "")
        _minority = conclusion.get("minority_assessment", "")
        _persona = conclusion.get("persona_insight", "")
        logger.info(
            "\n── 因果推演结论 ─────────────────────────────────────────\n"
            "  方向   : %s   置信度: %.0f%%  区间: %.0f%%–%.0f%%\n"
            "  一句话 : %s\n"
            "  驱动力 (%d 条):\n%s\n"
            "  风险因子 (%d 条):\n%s\n"
            "  少数派评估: %s\n"
            "  人群画像: %s\n"
            "  耗时: %.3fs\n"
            "─────────────────────────────────────────────────────────",
            graph.analysis_direction,
            graph.analysis_confidence * 100,
            _ci.get("low", 0) * 100, _ci.get("high", 0) * 100,
            _one or "(未输出)",
            len(_kd),
            "\n".join(f"    • {d}" for d in _kd) or "    (未提取)",
            len(_rf),
            "\n".join(f"    • {r}" for r in _rf) or "    (未提取)",
            _minority or "(无)",
            _persona or "(无)",
            _t5,
        )

        logger.info(
            "\n── Phase 4 推演子步骤耗时 ──\n"
            "  Step1 关键路径:  %.3fs\n"
            "  Step2 冲突消解:  %.3fs (LLM=%s)\n"
            "  Step3 概率传播:  %.3fs\n"
            "  Step4 敏感分析:  %.3fs\n"
            "  Step5 LLM推演:   %.3fs",
            _t1, _t2, "是" if conflicts else "否", _t3, _t4, _t5,
        )

        return graph

    # ── 1. 关键路径计算 ───────────────────────────────────────────

    def _find_critical_paths(
        self, graph: CausalGraph
    ) -> List[List[str]]:
        """从源节点（入度=0）到分析目标节点的最大权重路径"""
        target_node = graph.get_target_node()
        if not target_node:
            logger.warning("无分析目标节点，跳过关键路径计算")
            return []

        target_id = target_node.node_id

        # 构建邻接表
        adj: Dict[str, List[Tuple[str, float]]] = {}
        for e in graph.edges:
            adj.setdefault(e.source_node_id, []).append(
                (e.target_node_id, e.weight)
            )

        # 找源节点（入度=0）
        all_targets = {e.target_node_id for e in graph.edges}
        all_sources = {e.source_node_id for e in graph.edges}
        source_nodes = all_sources - all_targets

        # 如果没有纯源节点，用所有非目标节点
        if not source_nodes:
            source_nodes = {
                n.node_id
                for n in graph.nodes
                if not n.is_analysis_target
            }

        # DFS 找所有路径
        all_paths: List[Tuple[List[str], float]] = []
        for src in source_nodes:
            paths = self._dfs_all_paths(src, target_id, adj, max_depth=6)
            all_paths.extend(paths)

        # 按累积权重排序，取 Top 5（加法权重下中介路径权重与直接路径相当）
        all_paths.sort(key=lambda p: p[1], reverse=True)

        # 转换 node_id 为 node_name
        node_map = {n.node_id: n.name for n in graph.nodes}
        result = []
        for path_ids, weight in all_paths[:5]:
            path_names = [node_map.get(nid, nid) for nid in path_ids]
            result.append(path_names)

        return result

    @staticmethod
    def _dfs_all_paths(
        source: str,
        target: str,
        adj: Dict[str, List[Tuple[str, float]]],
        max_depth: int = 6,
    ) -> List[Tuple[List[str], float]]:
        """DFS 找所有从 source 到 target 的路径（加法累积权重）

        改为加法累积（而非乘法）：因果链中每条边的贡献独立叠加，
        避免多跳中介路径因权重连乘趋零而被错误排除在关键路径之外。
        """
        paths = []
        stack = [(source, [source], 0.0)]  # 加法从 0 开始

        while stack:
            current, path, cum_weight = stack.pop()
            if len(path) > max_depth:
                continue
            for neighbor, edge_weight in adj.get(current, []):
                new_weight = cum_weight + edge_weight  # 加法累积
                if neighbor == target:
                    paths.append((path + [neighbor], new_weight))
                elif neighbor not in path:
                    stack.append(
                        (neighbor, path + [neighbor], new_weight)
                    )

        return paths

    # ── 2. 概率传播 ──────────────────────────────────────────────

    @staticmethod
    def _propagate_confidence(graph: CausalGraph) -> None:
        """拓扑排序 → 从源节点向目标传播置信度

        修正逻辑：
        - 正向边（DRIVES/AMPLIFIES/TRIGGERS）：上游置信度提升下游，取平均后取 max
        - 负向边（INHIBITS/MITIGATES/负向 SUPPORTS）：上游置信度降低下游，
          influence * 0.5 的力度减去（避免单条负向边过度拉低整体置信度）
        - 原实现对所有方向都用 abs(influence) + max()，导致负向边反而抬高置信度
        """
        in_degree: Dict[str, int] = {n.node_id: 0 for n in graph.nodes}
        adj: Dict[str, List[Tuple[str, float, str]]] = {}

        for e in graph.edges:
            adj.setdefault(e.source_node_id, []).append(
                (e.target_node_id, e.weight, e.direction)
            )
            in_degree[e.target_node_id] = (
                in_degree.get(e.target_node_id, 0) + 1
            )

        queue = deque(
            nid for nid, deg in in_degree.items() if deg == 0
        )
        node_map = {n.node_id: n for n in graph.nodes}

        processed: set = set()
        while queue:
            nid = queue.popleft()
            processed.add(nid)
            current = node_map.get(nid)
            if not current:
                continue

            for neighbor_id, weight, direction in adj.get(nid, []):
                neighbor = node_map.get(neighbor_id)
                if not neighbor:
                    continue

                # 若源节点经冲突消解已确定为 bearish，其正向出边实际上对下游有抑制作用
                # 例：大模型训练资源约束(bearish) --DRIVES(+)--> GPT-5 → 实际应为负向传播
                effective_direction = direction
                if (
                    direction == "positive"
                    and getattr(current, "evidence_direction", None) == "bearish"
                ):
                    effective_direction = "negative"

                influence = current.confidence * weight
                if effective_direction == "negative":
                    # 负向因果边：上游因子的存在削弱下游节点的置信度
                    # 使用 0.5 系数避免单条负向边过度压制
                    neighbor.confidence = max(
                        0.0, neighbor.confidence - influence * 0.5
                    )
                else:
                    # 正向因果边：上游置信度通过加权平均提升下游
                    blended = (neighbor.confidence + influence) / 2
                    neighbor.confidence = max(neighbor.confidence, blended)

                in_degree[neighbor_id] -= 1
                if in_degree[neighbor_id] == 0:
                    queue.append(neighbor_id)

        # 有环检测：BFS结束后入度仍>0的节点表明图中存在环路，置信度未传播到这些节点
        skipped = [
            node_map[nid].name
            for nid, deg in in_degree.items()
            if deg > 0 and nid in node_map and nid not in processed
        ]
        if skipped:
            logger.warning(
                "置信度传播：%d 个节点未被处理（可能存在环路）: %s",
                len(skipped), skipped,
            )

    # ── 3. 冲突检测+消解 ─────────────────────────────────────────

    @staticmethod
    def _detect_conflicts(graph: CausalGraph) -> List[Dict]:
        """检测同一节点接收正向+负向入边的冲突"""
        node_incoming: Dict[str, List] = {}
        for e in graph.edges:
            node_incoming.setdefault(e.target_node_id, []).append(e)

        conflicts = []
        for node_id, edges in node_incoming.items():
            pos = [e for e in edges if e.direction == "positive"]
            neg = [e for e in edges if e.direction == "negative"]
            if pos and neg:
                conflicts.append(
                    {
                        "node_id": node_id,
                        "node_name": next(
                            (
                                n.name
                                for n in graph.nodes
                                if n.node_id == node_id
                            ),
                            node_id,
                        ),
                        "positive_count": len(pos),
                        "negative_count": len(neg),
                        "positive_weight": sum(e.weight for e in pos),
                        "negative_weight": sum(e.weight for e in neg),
                    }
                )
        return conflicts

    async def _resolve_conflicts(
        self, graph: CausalGraph, conflicts: List[Dict]
    ) -> List[Dict]:
        """LLM 多视角推理消解冲突，返回消解结果供结论生成使用"""
        node_map = {n.node_id: n for n in graph.nodes}

        # 构建富文本冲突描述（含因子类型、证据质量）
        conflict_lines = []
        for c in conflicts:
            node = node_map.get(c["node_id"])
            category = node.category if node else "unknown"
            hard = node.hard_fact_count if node else 0
            persona = node.persona_count if node else 0
            total = hard + persona
            hard_ratio = f"{hard/total:.0%}" if total > 0 else "未知"

            # 找出该节点的正向/负向入边的关系类型
            pos_edges = [
                e for e in graph.edges
                if e.target_node_id == c["node_id"] and e.direction == "positive"
            ]
            neg_edges = [
                e for e in graph.edges
                if e.target_node_id == c["node_id"] and e.direction == "negative"
            ]
            pos_types = list({e.relation_type for e in pos_edges})
            neg_types = list({e.relation_type for e in neg_edges})

            conflict_lines.append(
                f"- 节点 '{c['node_name']}' (类别={category}, "
                f"硬核事实占比={hard_ratio}, 硬核={hard}条/画像={persona}条)\n"
                f"  正向入边: {c['positive_count']}条, 权重和={c['positive_weight']:.2f}, 关系类型={pos_types}\n"
                f"  负向入边: {c['negative_count']}条, 权重和={c['negative_weight']:.2f}, 关系类型={neg_types}"
            )
        conflicts_text = "\n".join(conflict_lines)

        prompt = f"""以下因果图节点存在方向冲突（同时受正向和负向因果影响）。

## 预测问题（消解冲突时必须以此为导向）
{graph.task_query}

请依次分析每个冲突，推理时注意：
- 所有方向判断必须服务于上方预测问题，即"该因子的哪个方向更有利于预测目标成立"
- 硬核事实（数据、公告、政策文件）的权重高于画像推演（舆论、情绪）
- 时序上更近的事件通常权重更高
- 政策/监管类因子的负向影响往往比情绪类更稳固

{conflicts_text}

输出 JSON（reasoning 字段说明主导方向的核心依据）:
{{"resolutions": [
  {{"node_name": "节点名", "resolved_direction": "positive/negative",
   "confidence_penalty": 0.0到0.3, "reasoning": "核心依据一句话"}}
]}}"""

        try:
            result = await self.llm_client.chat_json(prompt)
            name_to_node = {n.name: n for n in graph.nodes}
            resolutions = result.get("resolutions", [])

            for r in resolutions:
                node_name = r.get("node_name", "")
                node = name_to_node.get(node_name)
                if node:
                    penalty = min(
                        0.3, max(0.0, float(r.get("confidence_penalty", 0.1)))
                    )
                    node.confidence = max(0, node.confidence - penalty)
                    # 同步更新方向，确保 nodes_text 与 conflict_section 不矛盾
                    resolved = r.get("resolved_direction", "")
                    if resolved == "positive":
                        node.evidence_direction = "bullish"
                    elif resolved == "negative":
                        node.evidence_direction = "bearish"
                    logger.info(
                        "冲突消解: '%s' → %s (penalty=%.2f): %s",
                        node.name,
                        resolved,
                        penalty,
                        r.get("reasoning", ""),
                    )
            return resolutions
        except Exception as e:
            logger.warning("冲突消解 LLM 调用失败: %s", e)
            # Fallback: 按入边权重多数决定方向并施加惩罚
            for c in conflicts:
                node = next(
                    (n for n in graph.nodes if n.node_id == c["node_id"]),
                    None,
                )
                if node:
                    node.confidence = max(0, node.confidence - 0.1)
                    # 按权重投票更新方向
                    if c["positive_weight"] > c["negative_weight"] * 1.2:
                        node.evidence_direction = "bullish"
                    elif c["negative_weight"] > c["positive_weight"] * 1.2:
                        node.evidence_direction = "bearish"
                    else:
                        node.evidence_direction = "neutral"
            return []

    # ── 4. 敏感性分析 ────────────────────────────────────────────

    @staticmethod
    def _sensitivity_analysis(graph: CausalGraph) -> Dict[str, float]:
        """综合敏感性评分 = 路径权重 × 置信度 × 证据密度 × 硬核事实质量权重

        原实现 (impact_score × confidence) 的问题：
        1. impact_score 使用乘法路径权重，中介节点被严重压制（如 0.05×0.05=0.0025）
        2. 未纳入证据密度（evidence_count 多的因子更可靠）
        3. 未区分硬核事实与画像推演的质量差异

        修正后：
        - impact_score 已由图构建器改用加法权重（中介路径恢复正常量级）
        - evidence_density = 该因子证据量占全局非目标因子总证据量的比例
        - quality_weight = 0.5 + hard_fact_ratio × 0.5  (范围 0.5~1.0)
        """
        total_evidence = sum(
            n.total_evidence_count
            for n in graph.nodes
            if not n.is_analysis_target
        ) or 1

        sensitivity = {}
        for node in graph.nodes:
            if node.is_analysis_target:
                continue
            total_ev = max(1, node.total_evidence_count)
            hard_ratio = node.hard_fact_count / total_ev
            evidence_density = node.total_evidence_count / total_evidence
            quality_weight = 0.5 + hard_ratio * 0.5  # 0.5（纯画像）~ 1.0（纯硬核）
            sensitivity[node.name] = round(
                node.impact_score * node.confidence * evidence_density * quality_weight,
                4,
            )
        return sensitivity

    # ── 5. 最终结论生成 ──────────────────────────────────────────

    async def _generate_conclusion(
        self,
        graph: CausalGraph,
        preprocess_result: PreprocessResult,
        sensitivity: Dict[str, float],
        conflict_resolutions: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """LLM 综合推演生成预测结论"""
        # 格式化因子信息（按影响力排序）
        sorted_nodes = sorted(
            graph.nodes, key=lambda n: n.impact_score, reverse=True
        )
        # 网加当前因子的私有数据占比（用于结论生成时加权）
        cluster_signal_map = {c.cluster_id: c.signals for c in preprocess_result.clusters}
        node_lines = []
        for n in sorted_nodes:
            excl_private = excl_semi = excl_total = 0
            for cid in n.source_cluster_ids:
                for s in cluster_signal_map.get(cid, []):
                    excl_total += 1
                    if s.data_exclusivity == "private":
                        excl_private += 1
                    elif s.data_exclusivity == "semi_private":
                        excl_semi += 1
            excl_note = ""
            if excl_total > 0 and (excl_private + excl_semi) > 0:
                excl_pct = (excl_private + excl_semi) / excl_total
                excl_note = f", 私有数据={excl_pct:.0%}"
            node_lines.append(
                f"- {n.name} (类别={n.category}, 方向={n.evidence_direction or 'neutral'}, "
                f"置信度={n.confidence:.2f}, 影响力={n.impact_score:.2f}, "
                f"硬核事实={n.hard_fact_count}, 画像推演={n.persona_count}{excl_note}"
                f"{', 少数派驱动' if n.is_minority_driven else ''}"
                f"{', 预测目标' if n.is_analysis_target else ''})"
            )
        nodes_text = "\n".join(node_lines)

        # 格式化关键路径
        paths_text = "\n".join(
            f"路径{i + 1}: {' → '.join(p)}"
            for i, p in enumerate(graph.critical_paths)
        ) or "无关键路径"

        # 格式化敏感性分析
        sorted_sensitivity = sorted(
            sensitivity.items(), key=lambda x: x[1], reverse=True
        )
        sensitivity_text = "\n".join(
            f"- {name}: 敏感度={score:.4f}"
            for name, score in sorted_sensitivity[:8]
        )

        # 少数派信息
        minority_info = ""
        if preprocess_result.minority_clusters:
            minority_themes = [
                mc.theme for mc in preprocess_result.minority_clusters
            ]
            minority_info = f"\n少数派语义簇: {', '.join(minority_themes)}"

        # UAP v3.0: 画像维度分析
        persona_analysis = self._format_persona_analysis(preprocess_result)

        # 格式化冲突消解结果
        conflict_section = ""
        if conflict_resolutions:
            lines = ["\n## 冲突消解结果（已在上一步骤完成）"]
            for r in conflict_resolutions:
                lines.append(
                    f"- {r.get('node_name','?')}: 主导方向={r.get('resolved_direction','?')}, "
                    f"置信度惩罚={r.get('confidence_penalty',0):.2f} | {r.get('reasoning','')}"
                )
            conflict_section = "\n".join(lines)

        # 硬核事实占比
        total_signals = preprocess_result.total_signals or 1
        hard_ratio = preprocess_result.hard_fact_count / total_signals

        prompt = f"""你是宏观大脑。你的任务是基于因果逻辑图数据生成预测结论。

⚠️ 核心约束：
- 你的结论必须完全基于下方提供的因果图数据，严禁引入对该任务的先验偏见或外部知识
- 硬核事实线索（占比 {hard_ratio:.0%}）权重高于画像推演线索
- 如果因果图数据本身存在矛盾，必须在 risk_factors 中明确说明
- **方向对齐约束（严格遵守）**：`key_drivers` 只能包含 `方向=bullish` 的因子；`risk_factors` 只能包含 `方向=bearish` 的因子；`方向` 字段已由因果图的边方向沿路径传播计算确定，表示该因子经因果链对分析目标的**净贡献方向**，不得根据外部语义常识反转或修改——例如某因子图中标记为 `方向=bearish`，即便你认为它在某种叙事下是利好，也**禁止**将其列入 `key_drivers`

## 预测问题
{graph.task_query}

## 因果因子（按影响力排序）
> 注意：`方向` 字段 = 该因子沿因果链传播至分析目标的净效果（bullish=正向推升目标/bearish=负向压制目标），由图的边方向运算得出，与因子名称本身的语义无关
{nodes_text}

## 关键因果路径
{paths_text}

## 敏感性分析（影响力最强的因子）
{sensitivity_text}

## 线索统计
总: {preprocess_result.total_signals} | 硬核事实: {preprocess_result.hard_fact_count} | 画像推演: {preprocess_result.persona_count}
少数派语义簇: {len(preprocess_result.minority_clusters)} 个{minority_info}{conflict_section}
{persona_analysis}
## 推理步骤（必须先完成，再输出JSON）

请在 <reasoning> 标签内按以下步骤推理：
1. 识别敏感度最高的 1-2 个关键因子，说明它们的驱动方向
2. 评估关键因果路径是否指向一致的方向
3. 硬核事实 vs 画像推演的信号是否一致？如有冲突如何权衡？
4. 少数派信号是否构成黑天鹅风险？
5. 综合以上，给出方向判断和置信度估计
6. 反事实推断：如果最关键因子不存在或逆转，结论如何变化？
7. 时间结构：哪些因子是领先指标（已发生/触发中），哪些是滞后指标？估计结论实现的时间窗口
8. 拐点识别：因果链在何条件下被不可逆锁定？打破该结论需要什么条件？
9. 二阶效应：该结论实现后会进一步引发哪些重要连锁反应？

## 输出 JSON
{{"direction": "bullish/bearish/neutral",
  "direction_label": "根据预测问题语境填写适配的方向短语，例如：若问题是事件发生概率则用'会发生'/'不会发生'；若是是非判断则用'成立'/'不成立'；若是商业/产品前景则用'看好'/'看淡'；若确实是价格/涨跌则用'看涨'/'看跌'。禁止对所有问题统一套用'看涨/看跌'",
  "confidence": "<根据证据强度与路径一致性自主评估，范围0.0~1.0的浮点数，禁止照抄示例>",
  "confidence_interval": {{"low": "<中心值-0.15>", "mid": "<与confidence相同>", "high": "<中心值+0.10>"}},
  "key_drivers": ["因子1", "因子2"],
  "risk_factors": ["风险因子"],
  "minority_assessment": "少数派评估",
  "persona_insight": "画像维度发现（如有）",
  "one_line_conclusion": "一句话结论",
  "counterfactual": "如果[最关键因子X]不存在或逆转，结论将变为[反向结论]，因为[机制说明]",
  "time_horizon": "预计在[N个月/季度/具体时间节点]内实现；领先指标=[已触发的因子]；触发条件=[尚需满足的条件]",
  "inflection_point": "当[某条件]达成时因果链不可逆锁定；若要反转结论，需要[打破条件]",
  "second_order_effects": ["该结论实现后将进一步导致：效应1", "效应2", "效应3"],
  "uncertainty_source": "epistemic（缺乏信息X）/ aleatory（事件本身具有内在不确定性Y）/ mixed"}}"""

        try:
            result = await self.llm_client.chat_json(
                prompt, temperature=0.2
            )
            # 校验必要字段
            if "direction" not in result:
                result["direction"] = "neutral"
            if "confidence" not in result:
                result["confidence"] = 0.5
            if "confidence_interval" not in result:
                result["confidence_interval"] = {
                    "low": max(0, result["confidence"] - 0.15),
                    "mid": result["confidence"],
                    "high": min(1.0, result["confidence"] + 0.1),
                }
            # 新字段兜底（LLM 可能不输出）
            result.setdefault("counterfactual", "")
            result.setdefault("time_horizon", "")
            result.setdefault("inflection_point", "")
            result.setdefault("second_order_effects", [])
            result.setdefault("uncertainty_source", "")
            return result
        except Exception as e:
            logger.error("结论生成 LLM 调用失败: %s", e)
            return {
                "direction": "neutral",
                "confidence": 0.5,
                "confidence_interval": {"low": 0.3, "mid": 0.5, "high": 0.7},
                "key_drivers": [],
                "risk_factors": [],
                "minority_assessment": "无法评估",
                "one_line_conclusion": "推演引擎异常，无法生成结论",
                "counterfactual": "",
                "time_horizon": "",
                "inflection_point": "",
                "second_order_effects": [],
                "uncertainty_source": "",
            }

    # ── 画像分析辅助 ──────────────────────────────────────────────

    @staticmethod
    def _format_persona_analysis(preprocess_result: PreprocessResult) -> str:
        """UAP v3.0: 将画像统计格式化为 LLM 可读的分析上下文"""
        persona_summary = preprocess_result.persona_summary
        if not persona_summary or not persona_summary.get("dimensions"):
            return ""

        coverage = persona_summary.get("coverage_rate", 0)
        if coverage < 0.1:
            return ""

        parts = [
            f"\n## 人群画像分析（UAP v3.0, 覆盖率 {coverage:.0%}）"
        ]

        # 全局维度分布
        dim_labels = {
            "occupation": "职业分布",
            "age_range": "年龄段分布",
            "gender": "性别分布",
            "region": "地区分布",
            "education": "学历分布",
            "income_level": "收入水平分布",
            "investment_experience": "投资经验分布",
            "risk_appetite": "风险偏好分布",
            "consumption_style": "消费倾向分布",
        }
        for dim, dist in persona_summary["dimensions"].items():
            if not dist:
                continue
            label = dim_labels.get(dim, dim)
            sorted_items = sorted(dist.items(), key=lambda x: x[1], reverse=True)
            items_str = ", ".join(f"{k}({v}人)" for k, v in sorted_items)
            parts.append(f"- {label}: {items_str}")

        # 聚类级别的画像差异分析
        cluster_persona_parts = []
        for cluster in preprocess_result.clusters:
            if not cluster.persona_distribution:
                continue
            occ = cluster.persona_distribution.get("occupation", {})
            if occ:
                top_occ = sorted(occ.items(), key=lambda x: x[1], reverse=True)[:3]
                occ_str = ", ".join(f"{k}({v})" for k, v in top_occ)
                cluster_persona_parts.append(
                    f"  - 簇「{cluster.theme}」({cluster.sentiment}): 主要职业={occ_str}"
                )
        if cluster_persona_parts:
            parts.append("- 各簇人群差异:")
            parts.extend(cluster_persona_parts)

        parts.append(
            "提示: 不同人群的观点分化本身可能是重要的因果信号，"
            "请分析是否存在人群视角差异模式"
        )
        return "\n".join(parts) + "\n"
