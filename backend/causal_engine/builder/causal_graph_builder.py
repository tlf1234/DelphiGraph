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
from typing import Any, Callable, Coroutine, Dict, List, Optional

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
            market_query=ontology.market_query,
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

        # 设置预测目标节点 ID
        target_node = graph.get_target_node()
        if target_node:
            graph.prediction_target_node_id = target_node.node_id

        logger.info(
            "5层因果图构建完成: %d 聚类, %d 因子, %d 聚类边, %d 因果边, graph_id=%s",
            len(graph.cluster_nodes),
            len(graph.nodes),
            len(graph.cluster_edges),
            len(graph.edges),
            graph.graph_id,
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
                is_prediction_target=(ft.name == ontology.prediction_target),
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
                    # 精确匹配
                    cluster = cluster_by_theme.get(sc_theme)
                    if cluster is None:
                        # 模糊匹配：声明主题是聚类主题的子串或反之
                        for theme, c in cluster_by_theme.items():
                            if sc_theme in theme or theme in sc_theme:
                                cluster = c
                                break
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
            positive_types = {"DRIVES", "AMPLIFIES", "TRIGGERS"}
            negative_types = {"INHIBITS", "MITIGATES"}
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
        """计算边权重：基于证据数量和强度
        
        最小权重地板 0.05：防止 evidence_count=0（LLM 对弱关系常见输出）时
        边权重为 0，导致该边在置信度传播/路径计算/敏感性分析中完全失效。
        """
        multiplier = {"strong": 1.0, "moderate": 0.6, "weak": 0.3}
        base = min(evidence_count / 100.0, 1.0)  # 100条时饱和
        weight = base * multiplier.get(strength, 0.5)
        return max(weight, 0.05)  # 地板：保证弱关系边至少有微弱传播能力

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
            if node.is_prediction_target:
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
        """DFS 找从 source 到 target 的最大累积权重路径"""
        if source == target:
            return 1.0

        best_weight = 0.0
        stack = [(source, 1.0, {source})]  # (current, cumulative_weight, visited)

        while stack:
            current, cum_weight, visited = stack.pop()
            if len(visited) > max_depth:
                continue
            for neighbor, edge_weight in adj.get(current, []):
                new_weight = cum_weight * edge_weight
                if neighbor == target:
                    best_weight = max(best_weight, new_weight)
                elif neighbor not in visited:
                    stack.append(
                        (neighbor, new_weight, visited | {neighbor})
                    )

        return best_weight

    # ── Step 4.5: 节点方向计算 ───────────────────────────────────

    @staticmethod
    def _compute_node_directions(graph: CausalGraph) -> None:
        """基于入边方向的加权投票计算每个节点的 evidence_direction"""
        incoming: Dict[str, List[tuple]] = {}
        for e in graph.edges:
            incoming.setdefault(e.target_node_id, []).append(
                (e.direction, e.weight)
            )

        cluster_node_map = {c.cluster_id: c for c in graph.cluster_nodes}

        for node in graph.nodes:
            edges_in = incoming.get(node.node_id, [])
            if not edges_in:
                # 源节点（无入边）：从连接的 ClusterNode sentiment 做信号数加权投票
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
                # else: 保持 neutral（正负相当，或无匹配簇）
                continue

            pos_weight = sum(w for d, w in edges_in if d == "positive")
            neg_weight = sum(w for d, w in edges_in if d == "negative")

            if pos_weight > neg_weight * 1.2:
                node.evidence_direction = "bullish"
            elif neg_weight > pos_weight * 1.2:
                node.evidence_direction = "bearish"
            else:
                node.evidence_direction = "neutral"

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
