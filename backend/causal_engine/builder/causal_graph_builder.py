"""
因果逻辑图构建引擎 (CausalGraphBuilder)

借鉴  GraphBuilderService:
- create_graph → _build_nodes
- set_ontology → 使用 CausalOntology 定义
- add_text_batch → _bind_evidence（批量绑定证据）
- wait_for_processing → progress_callback

核心差异: 自建图结构 + 有向加权 + 证据溯源
"""

import logging
import math
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set

from ..models.causal_graph import (
    CausalEdge,
    CausalGraph,
    CausalNode,
    ClusterEdge,
    ClusterNode,
)
from ..models.ontology import CausalOntology
from ..models.signal import EvidenceType, PreprocessResult, SignalCluster

logger = logging.getLogger(__name__)

ProgressCallback = Optional[
    Callable[[int, int, str], Coroutine[Any, Any, None]]
]


class CausalGraphBuilder:
    """因果逻辑图构建引擎 - 5层图谱架构"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def build(
        self,
        ontology: CausalOntology,
        preprocess_result: PreprocessResult,
        progress_callback: ProgressCallback = None,
    ) -> CausalGraph:
        """构建完整的5层因果逻辑图
        
        Layer 1: Agent层（数据源）
        Layer 2: Signal层（原始证据）
        Layer 3: Cluster层（主题聚合）⭐ 5-15组
        Layer 4: Factor层（因果因子）5-8个
        Layer 5: Target层（预测目标）1个
        """
        graph = CausalGraph(
            task_id=ontology.task_id,
            task_query=ontology.task_query,
        )
        total_steps = 7

        # Step 1: 构建聚类节点（Layer 3）
        if progress_callback:
            await progress_callback(1, total_steps, "构建主题聚类节点...")
        graph.cluster_nodes = self._build_cluster_nodes(preprocess_result)
        logger.info("Step 1: 构建 %d 个聚类节点", len(graph.cluster_nodes))

        # Step 2: 构建因子节点（Layer 4）
        if progress_callback:
            await progress_callback(2, total_steps, "构建因果因子节点...")
        graph.nodes = self._build_nodes(ontology)
        logger.info("Step 2: 构建 %d 个因子节点", len(graph.nodes))

        # Step 3: 构建聚类→因子映射边
        if progress_callback:
            await progress_callback(3, total_steps, "构建聚类到因子的映射...")
        graph.cluster_edges = self._build_cluster_to_factor_edges(
            graph.cluster_nodes, graph.nodes, preprocess_result, ontology
        )
        logger.info("Step 3: 构建 %d 条聚类映射边", len(graph.cluster_edges))

        # Step 4: 构建因果关系边（Layer 4内部 & Layer 4→5）
        if progress_callback:
            await progress_callback(4, total_steps, "构建因果关系边...")
        graph.edges = self._build_edges(ontology, graph.nodes)
        logger.info("Step 4: 构建 %d 条因果边", len(graph.edges))

        # Step 4.5: 孤岛因子检测+自动补边修复
        self._validate_factor_connectivity(graph)
        self._repair_orphan_connectivity(graph)

        # Step 5: 绑定证据溯源
        if progress_callback:
            await progress_callback(5, total_steps, "绑定证据溯源...")
        self._bind_evidence(graph, preprocess_result)

        # Step 6: 计算节点影响力评分
        if progress_callback:
            await progress_callback(6, total_steps, "计算影响力评分...")
        self._compute_impact_scores(graph)
        self._compute_node_directions(graph)

        # Step 7: 标注少数派节点
        if progress_callback:
            await progress_callback(7, total_steps, "标注少数派信号...")
        self._mark_minority_nodes(graph, preprocess_result)

        # 填充元数据
        graph.total_signals_used = preprocess_result.valid_signals
        graph.hard_fact_count = preprocess_result.hard_fact_count
        graph.persona_count = preprocess_result.persona_count

        # 设置分析目标节点 ID
        target_node = graph.get_target_node()
        if target_node:
            graph.analysis_target_node_id = target_node.node_id

        # ── 构建结果详情日志 ──────────────────────────────────────────
        cluster_lines = "\n".join(
            f"    [{i+1}] {cn.theme!r}  signals={cn.signal_count}"
            f"  hard={cn.hard_fact_count}  persona={cn.persona_count}"
            f"  {'[少数派]' if cn.is_minority else ''}"
            for i, cn in enumerate(graph.cluster_nodes)
        )
        factor_lines = "\n".join(
            f"    [{i+1}] {'★' if n.is_analysis_target else ' '}"
            f" {n.name!r}  [{n.category}]"
            f"  impact={n.impact_score:.3f}  conf={n.confidence:.2f}"
            f"  evid={n.total_evidence_count}(hard={n.hard_fact_count}/persona={n.persona_count})"
            f"  dir={n.evidence_direction}"
            for i, n in enumerate(sorted(graph.nodes, key=lambda x: x.impact_score, reverse=True))
        )
        _nid_map = {n.node_id: n.name for n in graph.nodes}
        for cn in graph.cluster_nodes:
            _nid_map[cn.cluster_id] = cn.theme
        edge_lines = "\n".join(
            f"    {_nid_map.get(e.source_node_id, e.source_node_id)!r}"
            f" --{e.relation_type}({'+' if e.direction == 'positive' else '-'}"
            f" w={e.weight:.3f})--> "
            f"{_nid_map.get(e.target_node_id, e.target_node_id)!r}"
            for e in graph.edges
        )
        logger.info(
            "\n── 因果图构建完成  graph_id=%s ──────────────────────────\n"
            "  聚类节点 (%d):\n%s\n"
            "  因子节点 (%d, 按影响力排序):\n%s\n"
            "  因果边 (%d):\n%s\n"
            "  聚类映射边: %d  |  总信号: %d  (hard=%d / persona=%d)\n"
            "─────────────────────────────────────────────────────────",
            graph.graph_id,
            len(graph.cluster_nodes), cluster_lines or "    (无)",
            len(graph.nodes),        factor_lines or "    (无)",
            len(graph.edges),        edge_lines   or "    (无)",
            len(graph.cluster_edges),
            graph.total_signals_used,
            graph.hard_fact_count,
            graph.persona_count,
        )
        return graph

    # ── Step 1: 聚类节点构建（Layer 3）──────────────────────────

    @staticmethod
    def _build_cluster_nodes(
        preprocess_result: PreprocessResult,
    ) -> List[ClusterNode]:
        """从预处理结果构建聚类节点"""
        cluster_nodes = []
        
        for cluster in preprocess_result.clusters:
            # 计算簇内信号平均质量
            avg_quality = (
                sum(s.quality_score for s in cluster.signals) / len(cluster.signals)
                if cluster.signals
                else 0.0
            )
            
            # 计算相关度（基于信号的平均相关度）
            avg_relevance = (
                sum(s.relevance_score for s in cluster.signals) / len(cluster.signals)
                if cluster.signals
                else 0.0
            )
            
            # 判断是否为少数派
            is_minority = cluster in preprocess_result.minority_clusters
            
            cluster_node = ClusterNode(
                cluster_id=cluster.cluster_id,
                theme=cluster.theme,
                description=f"主题聚类：{cluster.theme}",
                sentiment=cluster.sentiment or "neutral",
                anchor_entities=cluster.anchor_entities,
                signal_count=len(cluster.signals),
                hard_fact_count=cluster.hard_fact_count,
                persona_count=cluster.persona_count,
                avg_quality_score=avg_quality,
                relevance_score=avg_relevance,
                is_minority=is_minority,
                persona_distribution=cluster.persona_distribution,
                signal_ids=[s.signal_id for s in cluster.signals],
            )
            cluster_nodes.append(cluster_node)
        
        logger.info(
            "构建聚类节点: %d 个聚类，其中 %d 个少数派",
            len(cluster_nodes),
            sum(1 for c in cluster_nodes if c.is_minority),
        )
        return cluster_nodes

    # ── Step 2: 因子节点构建（Layer 4）──────────────────────────

    @staticmethod
    def _build_nodes(ontology: CausalOntology) -> List[CausalNode]:
        """从本体因子类型构建因果因子节点"""
        nodes = []
        for ft in ontology.factor_types:
            node = CausalNode(
                name=ft.name,
                description=ft.description,
                category=ft.category,
                is_analysis_target=(ft.name == ontology.analysis_target),
            )
            nodes.append(node)
        return nodes

    # ── Step 3: 聚类→因子映射边构建 ──────────────────────────────

    def _build_cluster_to_factor_edges(
        self,
        cluster_nodes: List[ClusterNode],
        factor_nodes: List[CausalNode],
        preprocess_result: PreprocessResult,
        ontology: "CausalOntology" = None,
    ) -> List[ClusterEdge]:
        """构建聚类到因子的映射边（多对多：一个聚类可连多个因子，一个因子可连多个聚类）"""
        edges = []
        # 已创建的 (cluster_id, factor_id) 对，防止重复边
        created_pairs: set = set()

        def _add_edge(cluster: "ClusterNode", factor: "CausalNode", score: float) -> None:
            pair = (cluster.cluster_id, factor.node_id)
            if pair in created_pairs:
                return
            created_pairs.add(pair)
            edges.append(ClusterEdge(
                source_cluster_id=cluster.cluster_id,
                target_factor_id=factor.node_id,
                mapping_score=score,
                signal_contribution=cluster.signal_count,
            ))
            if cluster.cluster_id not in factor.source_cluster_ids:
                factor.source_cluster_ids.append(cluster.cluster_id)

        # ── 第一遍：以因子为主体，遍历 source_clusters 声明（真正的多对多）──
        # 一个聚类可被多个因子声明 → 产生多条边（一聚类→多因子）
        # 一个因子声明多个聚类 → 产生多条边（多聚类→一因子）
        cluster_by_theme: dict = {}
        for c in cluster_nodes:
            cluster_by_theme[c.theme] = c

        explicit_hits = 0
        if ontology is not None:
            factor_by_name = {n.name: n for n in factor_nodes}
            for ft in ontology.factor_types:
                node = factor_by_name.get(ft.name)
                if not node or not ft.source_clusters:
                    continue
                for sc_theme in ft.source_clusters:
                    # 1. 精确匹配
                    cluster = cluster_by_theme.get(sc_theme)
                    if cluster is None:
                        # 2. 子串匹配：声明主题是聚类主题的子串，或反之
                        #    例: 声明 "Federal Reserve" 匹配到 "Federal Reserve rate policy signals"
                        for theme, c in cluster_by_theme.items():
                            if sc_theme in theme or theme in sc_theme:
                                cluster = c
                                break
                    if cluster is None:
                        logger.debug(
                            "显式声明未匹配: 因子'%s' 声明的聚类'%s' 在当前聚类列表中找不到",
                            ft.name, sc_theme,
                        )
                    if cluster is not None:
                        score = cluster.avg_quality_score * cluster.relevance_score
                        _add_edge(cluster, node, score)
                        explicit_hits += 1
                        logger.debug(
                            "多对多显式映射: 聚类'%s' → 因子'%s'",
                            cluster.theme, node.name,
                        )

        # ── 第二遍：对未被任何因子显式声明的聚类，用相似度/兜底补充（保证全覆盖）──
        covered_clusters = {e.source_cluster_id for e in edges}
        for cluster in cluster_nodes:
            if cluster.cluster_id in covered_clusters:
                continue  # 已被显式映射覆盖，跳过
            mapping_score = cluster.avg_quality_score * cluster.relevance_score

            # 相似度匹配
            target_factor = self._find_best_matching_node(
                cluster.theme, cluster.anchor_entities, factor_nodes,
            )
            if target_factor:
                logger.debug(
                    "聚类相似度映射: '%s' → '%s'", cluster.theme, target_factor.name,
                )
            elif factor_nodes:
                # 兜底：负载均衡
                factor_load = {f.node_id: 0 for f in factor_nodes}
                for e in edges:
                    factor_load[e.target_factor_id] = factor_load.get(e.target_factor_id, 0) + 1
                target_factor = min(factor_nodes, key=lambda f: factor_load.get(f.node_id, 0))
                mapping_score = 0.05
                logger.debug("聚类 '%s' 无匹配，兜底→因子 '%s'", cluster.theme, target_factor.name)

            if target_factor:
                _add_edge(cluster, target_factor, mapping_score)
        
        logger.info(
            "构建聚类映射边: %d 条边（显式映射 %d 条，相似度/兜底 %d 条），平均每个因子关联 %.1f 个聚类",
            len(edges),
            explicit_hits,
            len(edges) - explicit_hits,
            len(edges) / max(len(factor_nodes), 1),
        )
        return edges

    # ── Step 4: 因果关系边构建 ────────────────────────────────────

    def _build_edges(
        self, ontology: CausalOntology, nodes: List[CausalNode]
    ) -> List[CausalEdge]:
        """从本体因果关系构建有向加权边"""
        node_name_map = {n.name: n.node_id for n in nodes}
        edges = []

        for rel in ontology.raw_causal_relations:
            source_name = rel.get("source_factor", "")
            target_name = rel.get("target_factor", "")
            source_id = node_name_map.get(source_name)
            target_id = node_name_map.get(target_name)

            if not source_id or not target_id:
                # 尝试模糊匹配
                source_id = source_id or self._fuzzy_match_node(
                    source_name, node_name_map
                )
                target_id = target_id or self._fuzzy_match_node(
                    target_name, node_name_map
                )
                if not source_id or not target_id:
                    logger.warning(
                        "跳过关系: %s → %s（节点未找到）",
                        source_name,
                        target_name,
                    )
                    continue

            relation_type = rel.get("relation_type", "CORRELATES_WITH")
            strength = rel.get("strength", "moderate")
            evidence_count = int(rel.get("evidence_count", 0))
            weight = self._compute_edge_weight(evidence_count, strength)

            # 根据关系类型确定方向
            positive_types = {
                "DRIVES", "AMPLIFIES", "TRIGGERS", "ENABLES",
                "ACCELERATES", "REINFORCES", "SUPPORTS", "PROMOTES",
            }
            negative_types = {
                "INHIBITS", "MITIGATES", "DAMPENS", "BLOCKS",
                "REDUCES", "HINDERS", "SUPPRESSES", "CONSTRAINS",
            }
            if relation_type in positive_types:
                direction = "positive"
            elif relation_type in negative_types:
                direction = "negative"
            else:
                direction = "neutral"

            edge = CausalEdge(
                source_node_id=source_id,
                target_node_id=target_id,
                relation_type=relation_type,
                weight=weight,
                strength=strength,
                direction=direction,
                evidence_count=evidence_count,
                reasoning=rel.get("reasoning", ""),
            )
            edges.append(edge)

        return edges

    @staticmethod
    def _compute_edge_weight(evidence_count: int, strength: str) -> float:
        """计算边权重：以 strength 为主驱动，evidence_count 作对数加成

        旧设计的问题：
          base = evidence_count / 100  # LLM 常输出 n=2，base=0.02
          weight = base × multiplier   # 全部低于地板 0.05 → 强/中/弱无差别

        修正：
          - strength 直接作为基准权重（strong=1.0 / moderate=0.6 / weak=0.3）
          - evidence_count 提供 log 加成上限 +0.2（弥补引用数量差异）
          - 无地板：weak 最低 0.3，已足以传播，不需要人为托底
        """
        strength_base = {"strong": 1.0, "moderate": 0.6, "weak": 0.3}
        base = strength_base.get(strength, 0.5)
        # log1p 加成：n=0→0, n=2→+0.06, n=10→+0.14, n=20→+0.20（上限）
        evidence_bonus = min(math.log1p(evidence_count) / math.log1p(20) * 0.2, 0.2)
        return round(base + evidence_bonus, 3)

    @staticmethod
    def _fuzzy_match_node(
        name: str, node_name_map: Dict[str, str]
    ) -> Optional[str]:
        """简单模糊匹配节点名"""
        name_lower = name.lower()
        for node_name, node_id in node_name_map.items():
            if (
                name_lower in node_name.lower()
                or node_name.lower() in name_lower
            ):
                return node_id
        return None

    # ── Step 3: 证据绑定 ──────────────────────────────────────────

    def _bind_evidence(
        self, graph: CausalGraph, preprocess_result: PreprocessResult
    ) -> None:
        """将预处理聚类中的线索关联到最匹配的因子节点"""
        for cluster in preprocess_result.clusters:
            # 优先使用 Step 3 已建立的显式 source_cluster_ids 映射（多对多）
            # 避免与拓扑结构（cluster_edges）发生不一致
            mapped_factors = [
                f for f in graph.nodes
                if cluster.cluster_id in f.source_cluster_ids
            ]
            if not mapped_factors:
                # 无显式映射时 fallback 到文本相似度匹配
                fallback = self._find_best_matching_node(
                    cluster.theme, cluster.anchor_entities, graph.nodes
                )
                if not fallback:
                    logger.debug("簇 '%s' 未匹配到节点，跳过", cluster.theme)
                    continue
                mapped_factors = [fallback]

            for best_node in mapped_factors:
                # 融合前先记录已有证据数，用于跨簇置信度加权平均
                existing_count = best_node.total_evidence_count
                for sig in cluster.signals:
                    best_node.evidence_ids.append(sig.signal_id)
                    if sig.evidence_type == EvidenceType.HARD_FACT:
                        best_node.hard_fact_count += 1
                    else:
                        best_node.persona_count += 1
                    best_node.total_evidence_count += 1

                # 节点置信度 = 跨簇信号数加权平均累积（而非 max，防止单个小簇虚高置信度）
                if cluster.signals:
                    weighted = sum(
                        s.weight * s.quality_score for s in cluster.signals
                    )
                    total_w = sum(s.weight for s in cluster.signals) or 1
                    new_conf = weighted / total_w
                    new_count = len(cluster.signals)
                    if existing_count == 0:
                        best_node.confidence = new_conf
                    else:
                        # 按信号数做加权平均，多簇融合时置信度平滑收敛
                        best_node.confidence = (
                            best_node.confidence * existing_count + new_conf * new_count
                        ) / (existing_count + new_count)

        # 更新边的硬核事实比例
        node_map = {n.node_id: n for n in graph.nodes}
        for edge in graph.edges:
            source = node_map.get(edge.source_node_id)
            target = node_map.get(edge.target_node_id)
            if source and target:
                total = source.hard_fact_count + source.persona_count
                if total > 0:
                    edge.hard_fact_ratio = source.hard_fact_count / total

    @staticmethod
    def _find_best_matching_node(
        theme: str,
        anchor_entities: List[str],
        nodes: List[CausalNode],
    ) -> Optional[CausalNode]:
        """找到与主题最匹配的因子节点（关键词重叠）"""
        theme_lower = theme.lower()
        anchor_lower = {e.lower() for e in anchor_entities}
        best_node = None
        best_score = -1  # 初始化为 -1，确保至少返回第一个节点（score=0 也算最优）

        for node in nodes:
            score = 0
            node_name_lower = node.name.lower()
            node_desc_lower = node.description.lower()

            # 主题名直接包含关系
            if theme_lower in node_name_lower or node_name_lower in theme_lower:
                score += 10

            # 描述包含关系
            if theme_lower in node_desc_lower:
                score += 5

            # 字符级二元组匹配（适合中文：无需空格分词）
            theme_clean = theme_lower.replace(' ', '')
            name_clean = node_name_lower.replace(' ', '')
            theme_bigrams = {theme_clean[i:i+2] for i in range(len(theme_clean) - 1)}
            name_bigrams = {name_clean[i:i+2] for i in range(len(name_clean) - 1)}
            score += len(theme_bigrams & name_bigrams) * 2

            # 锚点实体匹配
            for anchor in anchor_lower:
                if anchor in node_name_lower or anchor in node_desc_lower:
                    score += 8

            # 分词匹配
            theme_words = set(theme_lower.split())
            name_words = set(node_name_lower.split())
            overlap = theme_words & name_words
            score += len(overlap) * 3

            if score > best_score:
                best_score = score
                best_node = node

        return best_node  # 始终返回最优节点（None 仅在 nodes 为空时出现）

    # ── Step 4: 影响力评分 ────────────────────────────────────────

    def _compute_impact_scores(self, graph: CausalGraph) -> None:
        """简化 PageRank 变体：从源节点向预测目标传播路径权重"""
        target_node = graph.get_target_node()
        if not target_node:
            logger.warning("无预测目标节点，跳过影响力评分")
            return

        target_id = target_node.node_id

        # 构建邻接表
        adj: Dict[str, List[tuple]] = {}
        for e in graph.edges:
            adj.setdefault(e.source_node_id, []).append(
                (e.target_node_id, e.weight)
            )

        for node in graph.nodes:
            if node.is_analysis_target:
                node.impact_score = 1.0
            else:
                node.impact_score = self._find_max_path_weight(
                    node.node_id, target_id, adj
                )

    @staticmethod
    def _find_max_path_weight(
        source: str,
        target: str,
        adj: Dict[str, List[tuple]],
        max_depth: int = 6,
    ) -> float:
        """DFS 找从 source 到 target 的最大累积权重路径（加法累积）

        改为加法累积（而非乘法）：因果链中每条边的贡献独立叠加，
        避免中介节点（如 A→B→Target）因连乘趋零而得到接近 0 的 impact_score，
        导致结构上重要的中介因子在影响力排序和敏感性分析中被错误压制。
        """
        if source == target:
            return 1.0

        best_weight = 0.0
        stack = [(source, 0.0, {source})]  # 加法从 0 开始

        while stack:
            current, cum_weight, visited = stack.pop()
            if len(visited) > max_depth:
                continue
            for neighbor, edge_weight in adj.get(current, []):
                new_weight = cum_weight + edge_weight  # 加法累积
                if neighbor == target:
                    best_weight = max(best_weight, new_weight)
                elif neighbor not in visited:
                    stack.append(
                        (neighbor, new_weight, visited | {neighbor})
                    )

        return best_weight

    # ── Step 4.5a: 孤岛因子连通性校验 ──────────────────────────────

    @staticmethod
    def _validate_factor_connectivity(graph: CausalGraph) -> None:
        """检测无法到达 analysis_target 的孤岛因子并记录 WARNING。

        孤岛因子的信号证据在推演中 impact=0，意味着这部分数据对结论无贡献。
        正常情况下 Phase 2 的连通性约束会阻止孤岛因子产生；
        本校验作为安全网，在日志中暴露问题以便追查。
        """
        target_node = graph.get_target_node()
        if not target_node:
            return

        # 构建邻接表（出边方向）
        adj: Dict[str, List[str]] = {}
        for e in graph.edges:
            adj.setdefault(e.source_node_id, []).append(e.target_node_id)

        target_id = target_node.node_id

        def _can_reach_target(start_id: str) -> bool:
            visited: set = set()
            queue = [start_id]
            while queue:
                cur = queue.pop()
                if cur == target_id:
                    return True
                if cur in visited:
                    continue
                visited.add(cur)
                queue.extend(adj.get(cur, []))
            return False

        # 构建因子节点的证据信号数（用于评估孤岛的严重程度）
        factor_evidence: Dict[str, int] = {}
        for ce in graph.cluster_edges:
            factor_evidence[ce.target_factor_id] = (
                factor_evidence.get(ce.target_factor_id, 0)
                + next(
                    (cn.signal_count for cn in graph.cluster_nodes if cn.cluster_id == ce.source_cluster_id),
                    0,
                )
            )

        orphans = []
        for node in graph.nodes:
            if node.is_analysis_target:
                continue
            if not _can_reach_target(node.node_id):
                signals = factor_evidence.get(node.node_id, 0)
                orphans.append((node.name, signals))

        if orphans:
            orphan_desc = "  ".join(f"'{name}'({sig}条信号)" for name, sig in orphans)
            total_orphan_signals = sum(s for _, s in orphans)
            logger.warning(
                "⚠️  孤岛因子检测: %d 个因子无法到达分析目标，共 %d 条信号证据被浪费 → %s"
                "\n    原因：Phase 2 LLM 漏写了这些因子指向目标的因果边。"
                "\n    建议：触发重试或人工检查 causal_relations 输出。",
                len(orphans), total_orphan_signals, orphan_desc,
            )
        else:
            logger.info("Step 4.5: 因果图连通性校验通过，所有因子均可到达分析目标")

    # ── Step 4.5a2: 孤岛因子自动补边修复 ────────────────────────

    def _repair_orphan_connectivity(self, graph: CausalGraph) -> None:
        """为无法到达分析目标的叶子孤岛因子自动添加合成因果边。

        叶子孤岛 = 在孤岛因子子图中无出边指向非孤岛节点的因子。
        根据 evidence_direction 决定合成边类型：
          bullish/neutral → DRIVES（正向）
          bearish         → INHIBITS（负向）
        """
        target_node = graph.get_target_node()
        if not target_node:
            return

        target_id = target_node.node_id

        # 出边邻接表
        adj: Dict[str, Set[str]] = {}
        for e in graph.edges:
            adj.setdefault(e.source_node_id, set()).add(e.target_node_id)

        def _can_reach(start: str) -> bool:
            visited: Set[str] = set()
            queue = [start]
            while queue:
                cur = queue.pop()
                if cur == target_id:
                    return True
                if cur in visited:
                    continue
                visited.add(cur)
                queue.extend(adj.get(cur, set()))
            return False

        orphan_ids: Set[str] = {
            n.node_id for n in graph.nodes
            if not n.is_analysis_target and not _can_reach(n.node_id)
        }

        if not orphan_ids:
            return

        # 叶子孤岛：出边全部指向其他孤岛（或无出边）
        leaf_orphans = [
            n for n in graph.nodes
            if n.node_id in orphan_ids
            and all(nb in orphan_ids for nb in adj.get(n.node_id, set()))
        ]

        repaired = []
        for node in leaf_orphans:
            direction = node.evidence_direction or "bullish"
            if direction == "bearish":
                relation_type = "INHIBITS"
                edge_direction = "negative"
            else:
                relation_type = "DRIVES"
                edge_direction = "positive"

            weight = self._compute_edge_weight(0, "moderate")
            synthetic_edge = CausalEdge(
                source_node_id=node.node_id,
                target_node_id=target_id,
                relation_type=relation_type,
                weight=weight,
                strength="moderate",
                direction=edge_direction,
                evidence_count=0,
                reasoning=(
                    f"[自动补边] {node.name} 为孤岛叶子节点，"
                    f"依据 evidence_direction={direction} 合成 {relation_type} 边指向目标"
                ),
            )
            graph.edges.append(synthetic_edge)
            adj.setdefault(node.node_id, set()).add(target_id)
            repaired.append(f"'{node.name}'({relation_type})")

        if repaired:
            logger.info(
                "Step 4.5 自动补边修复: 为 %d 个叶子孤岛因子添加合成边 → %s",
                len(repaired), "  ".join(repaired),
            )

    # ── Step 4.5b: 节点方向计算 ─────────────────────────────────

    @staticmethod
    def _compute_node_directions(graph: CausalGraph) -> None:
        """基于因果边方向计算每个节点的 evidence_direction。

        语义定义：evidence_direction 表示该节点对分析目标的净贡献方向
          - 有入边的节点: 入边加权投票（入边 positive→bullish，negative→bearish）
          - 纯源节点（无入边，有出边）: 出边方向加权投票
            「出边 positive（DRIVES/TRIGGERS）→ bullish，negative（INHIBITS）→ bearish」
          - 孤立节点（无入边也无出边）: 回退到连接的 ClusterNode sentiment 投票
        """
        incoming: Dict[str, List[tuple]] = {}
        outgoing: Dict[str, List[tuple]] = {}
        for e in graph.edges:
            incoming.setdefault(e.target_node_id, []).append((e.direction, e.weight))
            outgoing.setdefault(e.source_node_id, []).append((e.direction, e.weight))

        cluster_node_map = {c.cluster_id: c for c in graph.cluster_nodes}

        for node in graph.nodes:
            edges_in = incoming.get(node.node_id, [])
            edges_out = outgoing.get(node.node_id, [])

            if edges_in:
                # 有入边：入边加权投票（不变）
                pos_weight = sum(w for d, w in edges_in if d == "positive")
                neg_weight = sum(w for d, w in edges_in if d == "negative")
                if pos_weight > neg_weight * 1.2:
                    node.evidence_direction = "bullish"
                elif neg_weight > pos_weight * 1.2:
                    node.evidence_direction = "bearish"
                else:
                    node.evidence_direction = "neutral"

            elif edges_out:
                # 纯源节点：用出边方向判断该因子如何推动目标
                # 出边 positive(DRIVES/TRIGGERS) → factor 推动目标正向 → bullish
                # 出边 negative(INHIBITS/MITIGATES) → factor 压制目标 → bearish
                pos_out = sum(w for d, w in edges_out if d == "positive")
                neg_out = sum(w for d, w in edges_out if d == "negative")
                if pos_out > neg_out * 1.2:
                    node.evidence_direction = "bullish"
                elif neg_out > pos_out * 1.2:
                    node.evidence_direction = "bearish"
                else:
                    node.evidence_direction = "neutral"

            else:
                # 孤立节点（无任何因果边）：回退到簇 sentiment 投票
                pos_signals = neg_signals = 0
                for ce in graph.cluster_edges:
                    if ce.target_factor_id != node.node_id:
                        continue
                    cn = cluster_node_map.get(ce.source_cluster_id)
                    if cn:
                        if cn.sentiment == "positive":
                            pos_signals += cn.signal_count
                        elif cn.sentiment == "negative":
                            neg_signals += cn.signal_count
                if pos_signals > neg_signals * 1.2:
                    node.evidence_direction = "bullish"
                elif neg_signals > pos_signals * 1.2:
                    node.evidence_direction = "bearish"
                # else: 保持 neutral

    # ── Step 5: 少数派标注 ────────────────────────────────────────

    def _mark_minority_nodes(
        self, graph: CausalGraph, preprocess_result: PreprocessResult
    ) -> None:
        """标注少数派驱动的节点"""
        if not preprocess_result.minority_clusters:
            return

        minority_themes = {
            mc.theme.lower() for mc in preprocess_result.minority_clusters
        }
        minority_entities = set()
        for mc in preprocess_result.minority_clusters:
            for e in mc.anchor_entities:
                minority_entities.add(e.lower())

        for node in graph.nodes:
            node_name_lower = node.name.lower()
            node_desc_lower = node.description.lower()
            is_minority = False

            for theme in minority_themes:
                if theme in node_name_lower or node_name_lower in theme:
                    is_minority = True
                    break

            if not is_minority:
                for entity in minority_entities:
                    if entity in node_name_lower or entity in node_desc_lower:
                        is_minority = True
                        break

            if is_minority:
                node.is_minority_driven = True
                graph.minority_node_ids.append(node.node_id)

        if graph.minority_node_ids:
            minority_names = [
                n.name
                for n in graph.nodes
                if n.node_id in graph.minority_node_ids
            ]
            graph.minority_warning = (
                f"注意：以下因子由少数派信号驱动，可能包含被多数观点忽略的重要信息: "
                f"{', '.join(minority_names)}"
            )
