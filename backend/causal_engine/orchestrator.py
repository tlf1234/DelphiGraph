"""
因果逻辑图引擎编排器 (CausalEngineOrchestrator)

核心职责:
    串联因果分析的完整流水线，协调各个子模块的执行顺序和数据流转。
    对外暴露统一的 analyze() 接口，隐藏内部复杂性。

完整流程（4 个阶段）:
    Phase 1: 预处理 (SignalPreprocessor)
        - 解析原始信号提交数据，提取信号
        - 去重、聚类、质量评分
        - 识别少数派观点
    
    Phase 2: 本体生成 (CausalOntologyGenerator)
        - 基于信号识别因果因子类型
        - 提取因果关系（Factor → Factor, Factor → Target）
        - 定义分析目标
    
    Phase 3: 图谱构建 (CausalGraphBuilder)
        - 将本体转换为图结构（节点 + 边）
        - 分配权重、影响力分数
        - 构建因果链路
    
    Phase 4: 因果推演 (CausalInferenceEngine)
        - 基于图谱执行推理
        - 计算分析方向和置信度
        - 生成关键路径和敏感性分析

数据流:
    原始信号 → 信号聚类 → 因果本体 → 因果图谱 → 推演结论
"""

import asyncio
import logging
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional

from .builder.causal_graph_builder import CausalGraphBuilder
from .inference.causal_inference_engine import CausalInferenceEngine
from .llm_client import QwenLLMClient
from .models.causal_graph import CausalGraph
from .ontology.causal_ontology_generator import CausalOntologyGenerator
from .preprocessor.signal_preprocessor import SignalPreprocessor

logger = logging.getLogger(__name__)

ProgressCallback = Optional[
    Callable[[int, int, str], Coroutine[Any, Any, None]]
]


class CausalEngineOrchestrator:
    """因果逻辑图引擎编排器
    
    设计模式:
        - 编排器模式：协调多个子系统的执行
        - 异步上下文管理器：自动管理资源生命周期
    
    子模块:
        - preprocessor: 信号预处理器
        - ontology_gen: 因果本体生成器
        - graph_builder: 因果图构建器
        - inference_engine: 因果推演引擎
    """

    MIN_SIGNALS = 5  # 最小信号数量阈值（开发/测试：5，生产环境建议：50）

    def __init__(
        self,
        llm_client: Optional[QwenLLMClient] = None,
        api_key: Optional[str] = None,
    ):
        """初始化因果引擎编排器
        
        参数:
            llm_client: 外部传入的 LLM 客户端（共享实例）
            api_key: API 密钥（用于创建新的 LLM 客户端）
        
        LLM 客户端管理策略:
            - 如果传入 llm_client：使用外部实例，不负责关闭
            - 如果传入 api_key：创建新实例，负责关闭
            - 都不传入：使用环境变量创建，负责关闭
        """
        # LLM 客户端初始化（支持共享或独立实例）
        if llm_client:
            self.llm_client = llm_client
            self._owns_llm_client = False  # 外部传入，不负责关闭
        elif api_key:
            self.llm_client = QwenLLMClient(api_key=api_key)
            self._owns_llm_client = True
        else:
            self.llm_client = QwenLLMClient()
            self._owns_llm_client = True

        # 初始化各子模块（共享同一个 LLM 客户端）
        self.preprocessor = SignalPreprocessor(llm_client=self.llm_client)
        self.ontology_gen = CausalOntologyGenerator(
            llm_client=self.llm_client
        )
        self.graph_builder = CausalGraphBuilder(llm_client=self.llm_client)
        self.inference_engine = CausalInferenceEngine(
            llm_client=self.llm_client
        )

    async def analyze(
        self,
        task_id: str,
        task_title: str,
        submissions: List[Dict[str, Any]],
        task_description: Optional[str] = None,
        progress_callback: ProgressCallback = None,
    ) -> Dict[str, Any]:
        """完整因果分析流水线（核心入口函数）
        
        这是整个因果推理引擎的主入口，协调 4 个阶段的执行：
        1. 预处理：解析信号、去重聚类、质量评分
        2. 本体生成：识别因子类型、提取因果关系
        3. 图谱构建：构建节点和边、分配权重
        4. 因果推演：计算分析方向、置信度、关键路径

        参数:
            task_id: 任务 ID（用于日志追踪）
            task_title: 任务标题（分析问题，如"美联储是否降息？"）
            submissions: 信号提交数据列表（来自 signal_submissions）
            task_description: 可选的任务背景描述
            progress_callback: 进度回调函数（用于实时更新前端）

        返回:
            {
                "status": "completed" | "error" | "insufficient_signals",
                "graph": {"nodes": [...], "edges": [...]},  # 4层图谱
                "conclusion": {"direction": "bullish/bearish", "confidence": 0.72, ...},
                "ontology": {...},  # 因果本体
                "preprocess_summary": {...},  # 预处理摘要
                "meta": {"elapsed_seconds": 12.5, ...}
            }
        """
        start_time = time.time()
        total_phases = 4

        # ══════════════════════════════════════════════════════════════
        # 前置校验：信号数量是否足够
        # ══════════════════════════════════════════════════════════════
        if len(submissions) < self.MIN_SIGNALS:
            return {
                "status": "insufficient_signals",
                "count": len(submissions),
                "min_required": self.MIN_SIGNALS,
                "message": f"线索数量不足（{len(submissions)}/{self.MIN_SIGNALS}）",
            }

        timing: Dict[str, float] = {}
        try:
            # ══════════════════════════════════════════════════════════════
            # Phase 1: 预处理（信号提取与聚类）
            # ══════════════════════════════════════════════════════════════
            # 功能:
            #   - 从原始提交中提取结构化信号
            #   - 去重、聚类（基于语义相似度）
            #   - 质量评分（相关性、可信度）
            #   - 识别少数派观点（低频但高质量的信号）
            # 输入: 原始信号提交数据（Agent 提交的证据、推理等）
            # 输出: PreprocessResult（包含聚类、少数派、统计信息）
            if progress_callback:
                await progress_callback(
                    1, total_phases, "预处理线索数据..."
                )
            logger.info(
                "Phase 1: 开始预处理 %d 条原始数据", len(submissions)
            )
            _t1 = time.time()

            preprocess_result = await self.preprocessor.process(
                task_id=task_id,
                raw_submissions=submissions,
                task_query=task_title,
            )
            timing["phase1_preprocess"] = round(time.time() - _t1, 2)
            logger.info(
                "Phase 1 完成 (%.2fs): %d/%d 有效线索, %d 个聚类, %d 个少数派",
                timing["phase1_preprocess"],
                preprocess_result.valid_signals,
                preprocess_result.total_signals,
                len(preprocess_result.clusters),
                len(preprocess_result.minority_clusters),
            )

            # ══════════════════════════════════════════════════════════════
            # Phase 2: 因果本体生成（识别因子与关系）
            # ══════════════════════════════════════════════════════════════
            # 功能:
            #   - 基于聚类后的信号，识别因果因子类型（如"通胀预期"、"就业数据"）
            #   - 提取因果关系（Factor → Factor, Factor → Target）
            #   - 定义分析目标（Target，如"美联储降息概率"）
            # 方法: 调用 LLM 分析信号内容，提取结构化因果知识
            # 输入: PreprocessResult（聚类后的信号，含 Step 5.5 的簇间关系）
            # 输出: CausalOntology（因子类型、因果关系、目标定义）
            if progress_callback:
                await progress_callback(
                    2, total_phases, "生成因果本体（识别因子与关系）..."
                )
            logger.info("Phase 2: 开始因果本体生成")
            _t2 = time.time()

            ontology = await self.ontology_gen.generate(
                preprocess_result,
                task_title,
                task_description,
            )
            timing["phase2_ontology"] = round(time.time() - _t2, 2)
            logger.info(
                "Phase 2 完成 (%.2fs): %d 个因子, %d 条因果关系, 目标='%s'",
                timing["phase2_ontology"],
                len(ontology.factor_types),
                len(ontology.raw_causal_relations),
                ontology.analysis_target,
            )

            # ══════════════════════════════════════════════════════════════
            # Phase 3: 因果图构建（本体 → 图结构）
            # ══════════════════════════════════════════════════════════════
            # 功能:
            #   - 将因果本体转换为图结构（节点 + 边）
            #   - 为每个因子创建节点，分配权重和影响力分数
            #   - 为因果关系创建有向边，标注方向（正/负）
            #   - 构建因果链路（从 Factor 到 Target 的路径）
            # 输入: CausalOntology + PreprocessResult
            # 输出: CausalGraph（节点、边、拓扑结构）
            if progress_callback:
                await progress_callback(
                    3, total_phases, "构建因果逻辑图..."
                )
            logger.info("Phase 3: 开始因果图构建")
            _t3 = time.time()

            graph = await self.graph_builder.build(
                ontology, preprocess_result
            )
            timing["phase3_graph_build"] = round(time.time() - _t3, 2)
            logger.info(
                "Phase 3 完成 (%.2fs): %d 节点, %d 边",
                timing["phase3_graph_build"],
                len(graph.nodes),
                len(graph.edges),
            )

            # ══════════════════════════════════════════════════════════════
            # Phase 4: 因果推演（图谱 → 分析结论）
            # ══════════════════════════════════════════════════════════════
            # 功能:
            #   - 基于因果图谱执行推理，计算分析方向（看涨/看跌）
            #   - 计算置信度（基于路径强度、信号质量）
            #   - 生成关键路径（影响最大的因果链）
            #   - 敏感性分析（识别关键因子）
            #   - 少数派警告（检测被忽视的重要信号）
            # 方法: 图遍历 + 权重传播 + LLM 辅助推理
            # 输入: CausalGraph + PreprocessResult
            # 输出: 更新后的 CausalGraph（含分析方向、置信度等）
            if progress_callback:
                await progress_callback(
                    4, total_phases, "执行因果推演..."
                )
            logger.info("Phase 4: 开始因果推演")
            _t4 = time.time()

            graph = await self.inference_engine.infer(
                graph, preprocess_result
            )
            timing["phase4_inference"] = round(time.time() - _t4, 2)
            logger.info(
                "Phase 4 完成 (%.2fs): 方向=%s, 置信度=%.2f",
                timing["phase4_inference"],
                graph.analysis_direction,
                graph.analysis_confidence,
            )

            elapsed = time.time() - start_time
            timing["total"] = round(elapsed, 2)
            logger.info(
                "\n══ 耗时汇总 ══\n"
                "  Phase 1 预处理:    %.2fs\n"
                "  Phase 2 本体生成:  %.2fs\n"
                "  Phase 3 图构建:    %.2fs\n"
                "  Phase 4 推演:      %.2fs\n"
                "  总计:              %.2fs",
                timing.get("phase1_preprocess", 0),
                timing.get("phase2_ontology", 0),
                timing.get("phase3_graph_build", 0),
                timing.get("phase4_inference", 0),
                timing["total"],
            )

            # ══════════════════════════════════════════════════════════════
            # 图谱充实：Factor-only → 4层完整图谱
            # ══════════════════════════════════════════════════════════════
            # 说明: 因果引擎只生成 Factor → Target 层，前端需要 4 层可视化
            # 充实内容: Agent → Signal → Factor → Target
            enriched_graph = self._enrich_graph_for_frontend(
                graph, preprocess_result, submissions
            )

            return {
                "status": "completed",
                "graph": enriched_graph,
                "ontology": ontology.to_dict(),
                "preprocess_summary": preprocess_result.to_dict(),
                "conclusion": {
                    # 基础推演结论
                    "direction": graph.analysis_direction,
                    "confidence": graph.analysis_confidence,
                    "confidence_interval": graph.confidence_interval,
                    "critical_paths": graph.critical_paths,
                    "critical_path_length": max(
                        (len(p) for p in graph.critical_paths), default=0
                    ),
                    "sensitivity_count": len([
                        n for n in graph.nodes
                        if not n.is_analysis_target and n.impact_score > 0.3
                    ]),
                    "minority_warning": graph.minority_warning,
                    # LLM完整推理输出（key_drivers/risk_factors/one_line_conclusion等）
                    **{k: v for k, v in graph.raw_conclusion.items()
                       if k not in ("direction", "confidence", "confidence_interval")},
                },
                "meta": {
                    "task_id": task_id,
                    "elapsed_seconds": round(elapsed, 2),
                    "total_signals": preprocess_result.total_signals,
                    "valid_signals": preprocess_result.valid_signals,
                    "graph_id": graph.graph_id,
                    "timing": timing,
                },
            }

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("分析流水线异常: %s", e, exc_info=True)
            return {
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__,
                "elapsed_seconds": round(elapsed, 2),
            }

    # ── 前端 5 层图谱充实 ─────────────────────────────────────────────

    @staticmethod
    def _enrich_graph_for_frontend(
        graph: CausalGraph,
        preprocess_result,
        raw_submissions: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """将因果引擎产出的图谱充实为前端需要的 5 层结构
        
        转换说明:
            引擎输出: Cluster → Factor → Target（3层，核心因果逻辑）
            前端需求: Agent → Signal → Cluster → Factor → Target（5层，完整溯源）
        
        充实策略:
            1. 保留原有 Cluster、Factor 和 Target 节点
            2. 从 preprocess_result 提取 Signal 节点
            3. 从 raw_submissions 提取 Agent 节点
            4. 建立连接关系:
               - Agent → Signal（基于 agent_id）
               - Signal → Cluster（基于 cluster_id）
               - Cluster → Factor（原有映射关系 cluster_edges）
               - Factor → Factor（原有因果关系）
               - Factor → Target（原有因果关系）
        """
        base = graph.to_dict()
        enriched_nodes = []
        enriched_edges = []

        # -- 1. 添加 Cluster 节点（Layer 3）--
        for cluster_node in base["cluster_nodes"]:
            cluster_node["node_type"] = "cluster"
            enriched_nodes.append(cluster_node)

        # -- 2. 标记现有 factor/target 节点的 node_type（Layer 4 & 5）--
        target_node_id = graph.analysis_target_node_id

        for nd in base["nodes"]:
            nd["node_type"] = "target" if nd.get("is_target") else "factor"
            enriched_nodes.append(nd)

        # -- 3. 添加 Cluster → Factor 映射边 --
        for edge in base["cluster_edges"]:
            edge["edge_type"] = "cluster_factor"
            enriched_edges.append(edge)

        # -- 4. 标记现有 Factor 间因果关系边 --
        for ed in base["edges"]:
            tgt = ed.get("target", "")
            ed["edge_type"] = (
                "factor_target" if tgt == target_node_id else "factor_factor"
            )
            enriched_edges.append(ed)

        # -- 5. 收集 signal→cluster 映射 --
        signal_to_cluster = {}  # signal_id → cluster_id
        for cluster_node in graph.cluster_nodes:
            for sig_id in cluster_node.signal_ids:
                signal_to_cluster[sig_id] = cluster_node.cluster_id

        # -- 6. 收集所有 processed signals（含 agent_id）--
        # 注意：minority_clusters 是 clusters 的子集，直接用 clusters 遍历即可，
        # 避免少数派信号被重复添加（导致前端出现重复节点和边）。
        #
        # 两轮全局预算分配策略（比单簇固定上限更充分利用可视化预算）：
        #   第一轮：每簇保底 MIN_PER_CLUSTER 条最优信号，保证所有主题均有代表
        #   第二轮：剩余配额从所有未入选信号中按全局质量分排序补充，上限 MAX_TOTAL_SIGNALS_VIZ
        MAX_TOTAL_SIGNALS_VIZ = 1000   # 全局总上限，防止超大数据集时 JSON 体积失控
        MIN_PER_CLUSTER = 5            # 每簇至少保留的最优信号数
        seen_signal_ids: set = set()
        all_signals = []

        _audit_clusters = len(preprocess_result.clusters)
        _audit_total_in_clusters = sum(len(c.signals) for c in preprocess_result.clusters)
        logger.info(
            "[SIGNAL AUDIT] _enrich_graph_for_frontend(): clusters=%d  total_signals_in_clusters=%d  raw_submissions=%d",
            _audit_clusters, _audit_total_in_clusters, len(raw_submissions),
        )

        # 第一轮：每簇保底
        for cluster in preprocess_result.clusters:
            top_sigs = sorted(cluster.signals, key=lambda s: s.quality_score, reverse=True)
            for s in top_sigs[:MIN_PER_CLUSTER]:
                if s.signal_id not in seen_signal_ids:
                    seen_signal_ids.add(s.signal_id)
                    all_signals.append(s)

        # 第二轮：全局质量排序补充剩余配额
        remaining_slots = MAX_TOTAL_SIGNALS_VIZ - len(all_signals)
        if remaining_slots > 0:
            candidates = [
                s
                for cluster in preprocess_result.clusters
                for s in cluster.signals
                if s.signal_id not in seen_signal_ids
            ]
            candidates.sort(key=lambda s: s.quality_score, reverse=True)
            for s in candidates[:remaining_slots]:
                if s.signal_id not in seen_signal_ids:
                    seen_signal_ids.add(s.signal_id)
                    all_signals.append(s)
        
        # -- 7. 构建 agent_id → submission 映射 --
        sub_by_agent = {}
        for sub in raw_submissions:
            aid = sub.get("agent_id") or sub.get("user_id", "unknown")
            sub_by_agent[aid] = sub

        # -- 6. 生成 agent + signal 节点和边 --
        seen_agents = set()

        for sig in all_signals:
            # Signal 节点
            sig_dict = sig.to_dict()
            sig_dict["id"] = sig.signal_id
            sig_dict["name"] = (
                sig.evidence_text[:40] + "…"
                if len(sig.evidence_text) > 40
                else sig.evidence_text
            )
            sig_dict["node_type"] = "signal"
            enriched_nodes.append(sig_dict)

            # Agent 节点（每个 agent_id 仅创建一次）
            agent_id = f"agent_{sig.agent_id.replace('-', '')[:12]}"
            if agent_id not in seen_agents:
                seen_agents.add(agent_id)
                sub = sub_by_agent.get(sig.agent_id, {})
                stance = sig.sentiment_tag or "neutral"
                enriched_nodes.append({
                    "id": agent_id,
                    "name": f"Agent-{sig.agent_id[:6]}",
                    "node_type": "agent",
                    "avatar_label": sig.agent_id[:2].upper(),
                    "persona": {
                        "stance": stance,
                        "expertise": "general",
                        "reputation": sig.agent_reputation,
                    },
                })

            # Agent → Signal 边
            enriched_edges.append({
                "id": f"e_as_{sig.signal_id}",
                "source": agent_id,
                "target": sig.signal_id,
                "edge_type": "agent_signal",
                "weight": sig.weight,
                "direction": sig.sentiment_tag or "neutral",
            })

            # Signal → Cluster 边
            cluster_id = signal_to_cluster.get(sig.signal_id)
            if cluster_id:
                enriched_edges.append({
                    "id": f"e_sc_{sig.signal_id}",
                    "source": sig.signal_id,
                    "target": cluster_id,
                    "edge_type": "signal_cluster",
                    "weight": sig.quality_score,
                    "direction": sig.sentiment_tag or "neutral",
                })

        sc_edges = [e for e in enriched_edges if e.get("edge_type") == "signal_cluster"]
        logger.info(
            "[SIGNAL AUDIT] all_signals=%d  signal_to_cluster entries=%d  signal_cluster edges=%d",
            len(all_signals), len(signal_to_cluster), len(sc_edges),
        )

        base["nodes"] = enriched_nodes
        base["edges"] = enriched_edges

        # ── 详细节点和边统计 ──────────────────────────────────────────
        node_type_counts = {}
        for n in enriched_nodes:
            t = n.get("node_type", "unknown")
            node_type_counts[t] = node_type_counts.get(t, 0) + 1
        edge_type_counts = {}
        for e in enriched_edges:
            t = e.get("edge_type", "unknown")
            edge_type_counts[t] = edge_type_counts.get(t, 0) + 1

        logger.info(
            "\n" + "─" * 55 + "\n"
            "  5层图谱充实完成\n"
            "  ── 节点分布 ──────────────────────────\n"
            "  agent   : %d  (Layer 1)\n"
            "  signal  : %d  (Layer 2)\n"
            "  cluster : %d  (Layer 3)\n"
            "  factor  : %d  (Layer 4)\n"
            "  target  : %d  (Layer 5)\n"
            "  合计    : %d\n"
            "  ── 边分布 ────────────────────────────\n"
            "  agent→signal   : %d\n"
            "  signal→cluster : %d\n"
            "  cluster→factor : %d\n"
            "  factor→factor  : %d\n"
            "  factor→target  : %d\n"
            "  合计           : %d\n"
            + "─" * 55,
            node_type_counts.get("agent", 0),
            node_type_counts.get("signal", 0),
            node_type_counts.get("cluster", 0),
            node_type_counts.get("factor", 0),
            node_type_counts.get("target", 0),
            len(enriched_nodes),
            edge_type_counts.get("agent_signal", 0),
            edge_type_counts.get("signal_cluster", 0),
            edge_type_counts.get("cluster_factor", 0),
            edge_type_counts.get("factor_factor", 0),
            edge_type_counts.get("factor_target", 0),
            len(enriched_edges),
        )
        return base

    async def close(self):
        """关闭 LLM 客户端（仅当由本实例创建时才关闭）"""
        if self._owns_llm_client:
            await self.llm_client.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
