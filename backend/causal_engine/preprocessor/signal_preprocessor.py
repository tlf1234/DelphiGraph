"""
线索预处理管线 (SignalPreprocessor)

完整预处理流程：
1. 解析原始提交 → ProcessedSignal
2. 语义去重（embedding 余弦相似度）
3. 隐私标记校验（确认端侧已脱敏）
4. 赋予证据权重
4.5. 相关度过滤
5. 语义聚类（LLM驱动 + 实体锚点）
6. 边际贡献评分 Qi
7. 少数派识别
8. 实体索引构建
8.5. 画像统计聚合（UAP v2.0）
9. 汇总输出
"""

import asyncio
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

import numpy as np

from ..models.signal import (
    ClusterRelation,
    EntityTag,
    EvidenceType,
    PreprocessResult,
    ProcessedSignal,
    SignalCluster,
)

logger = logging.getLogger(__name__)


class SignalPreprocessor:
    """线索预处理管线"""

    EVIDENCE_WEIGHTS = {
        EvidenceType.HARD_FACT: 1.0,
        EvidenceType.PERSONA_INFERENCE: 0.1,
    }
    DEDUP_SIMILARITY_THRESHOLD = 0.92
    RELEVANCE_THRESHOLD = 0.2
    MAX_CONCURRENT_LLM_CALLS = 5   # Semaphore 并发上限，防止超速率限制
    CLUSTER_SIGNAL_BATCH = 150     # 单次聚类最大信号数，超过则分批

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def process(
        self,
        task_id: str,
        raw_predictions: List[Dict[str, Any]],
        market_query: str,
    ) -> PreprocessResult:
        """完整预处理管线"""
        # Step 1: 转换为 ProcessedSignal（解析 relevance_score + entity_tags）
        signals = self._parse_raw_predictions(task_id, raw_predictions)
        logger.info("Step 1: 解析得到 %d 条线索", len(signals))

        # Step 2: 语义去重（已跳过：数据在插件端已完成质量检测，无需后端二次过滤）
        logger.info("Step 2: 跳过去重，保留全量 %d 条线索", len(signals))

        # Step 3: 隐私标记校验
        signals = self._validate_privacy_flag(signals)
        logger.info("Step 3: 隐私校验后剩余 %d 条", len(signals))

        # Step 4: 赋予证据权重
        for s in signals:
            s.weight = self.EVIDENCE_WEIGHTS.get(s.evidence_type, 0.1)

        # Step 4.5: 相关度过滤（已跳过：数据在插件端已完成质量检测，无需后端二次过滤）
        logger.info("Step 4.5: 跳过相关度过滤，保留全量 %d 条线索", len(signals))

        # Steps 5+6: 语义聚类 与 Qi评分 并行执行（操作不同字段，asyncio 单线程无竞争）
        logger.info("Steps 5+6: 并行执行语义聚类 + Qi评分")
        _t56 = time.time()
        clusters, signals = await asyncio.gather(
            self._semantic_clustering(signals, market_query),
            self._compute_marginal_contribution(signals, market_query),
        )
        _t56_elapsed = round(time.time() - _t56, 2)
        logger.info("Steps 5+6 完成 (%.2fs 并行墙钟): %d 个语义簇", _t56_elapsed, len(clusters))
        # 将更新后的 Qi 同步回各簇的 signal 引用
        sig_map = {s.signal_id: s for s in signals}
        for cluster in clusters:
            cluster.signals = [
                sig_map.get(s.signal_id, s) for s in cluster.signals
            ]

        # Step 5.5: 显式簇间逻辑关系提取（Alphapoly Implications）
        _t55 = time.time()
        cluster_relations = await self._extract_cluster_relations(clusters, market_query)
        _t55_elapsed = round(time.time() - _t55, 2)
        logger.info("Step 5.5: 提取 %d 条簇间逻辑关系 (%.2fs)", len(cluster_relations), _t55_elapsed)

        # Step 7: 少数派识别
        minority_clusters = self._identify_minority_clusters(clusters)
        logger.info("Step 7: 识别 %d 个少数派簇", len(minority_clusters))

        # Step 8: 实体索引构建
        entity_index = self._build_entity_index(signals)
        logger.info("Step 8: 实体索引包含 %d 个实体", len(entity_index))

        # Step 8.5: 画像统计聚合（UAP v2.0）
        persona_summary = self._aggregate_persona_stats(signals, clusters)
        logger.info("Step 8.5: 画像统计完成，%d 条信号含画像数据",
                    persona_summary.get("signals_with_persona", 0))

        # Step 9: 汇总
        return self._build_result(
            task_id, signals, clusters, minority_clusters,
            entity_index, persona_summary, cluster_relations
        )

    # ── Step 1: 解析 ──────────────────────────────────────────────

    def _parse_raw_predictions(
        self, task_id: str, raw_predictions: List[Dict]
    ) -> List[ProcessedSignal]:
        """将原始 predictions 数据转换为 ProcessedSignal"""
        signals = []
        for pred in raw_predictions:
            agent_id = pred.get("agent_id") or pred.get("user_id", "unknown")
            raw_signals = pred.get("signals") or []

            # 兼容旧格式：如果没有 signals 数组，用 rationale 作为单条线索
            # 旧格式只含 rationale 文本，无可验证来源，默认为 persona_inference（UAP §2.2）
            if not raw_signals and pred.get("rationale"):
                pred_id = str(pred.get("id") or pred.get("prediction_id") or uuid.uuid4())
                raw_signals = [
                    {
                        "signal_id": f"sig_{pred_id[:8]}",
                        "evidence_type": pred.get("evidence_type", "persona_inference"),
                        "source_description": "rationale",
                        "evidence": pred["rationale"],
                        "relevance_score": pred.get("relevance_score", 0.5),
                        "entity_tags": pred.get("entity_tags", []),
                    }
                ]

            for raw_sig in raw_signals:
                evidence_type_str = raw_sig.get("evidence_type", "persona_inference")
                try:
                    evidence_type = EvidenceType(evidence_type_str)
                except ValueError:
                    evidence_type = EvidenceType.PERSONA_INFERENCE

                entity_tags = [
                    EntityTag.from_dict(t)
                    for t in raw_sig.get("entity_tags", [])
                ]

                signal = ProcessedSignal(
                    signal_id=raw_sig.get(
                        "signal_id", f"sig_{uuid.uuid4().hex[:8]}"
                    ),
                    task_id=task_id,
                    agent_id=agent_id,
                    evidence_type=evidence_type,
                    evidence_text=raw_sig.get("evidence", ""),
                    source_description=raw_sig.get("source_description", ""),
                    relevance_score=float(
                        raw_sig.get("relevance_score", 0.5)
                    ),
                    entity_tags=entity_tags,
                    agent_reputation=float(
                        pred.get("agent_reputation", 100.0)
                    ),
                    user_persona=pred.get("user_persona"),
                )
                signals.append(signal)

        return signals

    # ── Step 2: 语义去重 ──────────────────────────────────────────

    async def _deduplicate(
        self, signals: List[ProcessedSignal]
    ) -> List[ProcessedSignal]:
        """基于 embedding 余弦相似度的语义去重（含预处理阶段：文本精确匹配去重）"""
        if len(signals) <= 1 or not self.llm_client:
            return signals
        # O(n²) 安全上限：超过 500 条时跳过 embedding 去重，防止相似度矩阵内存爆炸
        # (500×500 float32 = 1MB，1000×1000 = 4MB，10000×10000 = 400MB)
        if len(signals) > 500:
            logger.warning(
                "信号量(%d)超过去重上限500，跳过 embedding 语义去重，仅执行文本精确匹配",
                len(signals),
            )
            seen_normalized: dict = {}
            result = []
            for s in signals:
                key = s.evidence_text.strip().lower()
                if key not in seen_normalized:
                    seen_normalized[key] = True
                    result.append(s)
            return result

        # ── 预处理：文本精确匹配去重（O(n)，在计算 embedding 前减少请求量） ──
        seen_normalized: dict = {}
        fast_deduped: List[ProcessedSignal] = []
        for s in signals:
            key = s.evidence_text.strip().lower()
            if key not in seen_normalized:
                seen_normalized[key] = True
                fast_deduped.append(s)
        fast_removed = len(signals) - len(fast_deduped)
        if fast_removed > 0:
            logger.info("文本精确匹配预去重移除 %d 条重复线索，剩余 %d 条", fast_removed, len(fast_deduped))
        signals = fast_deduped

        if len(signals) <= 1:
            return signals

        texts = [s.evidence_text for s in signals]
        try:
            embeddings = await self.llm_client.get_embeddings(texts)
        except Exception as e:
            logger.warning("Embedding 调用失败，跳过去重: %s", e)
            return signals

        emb_array = np.array(embeddings)
        # 归一化
        norms = np.linalg.norm(emb_array, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        emb_normalized = emb_array / norms

        # 余弦相似度矩阵
        similarity_matrix = emb_normalized @ emb_normalized.T

        # 贪心去重：保留 weight 更高或 relevance_score 更高的
        removed = set()
        for i in range(len(signals)):
            if i in removed:
                continue
            for j in range(i + 1, len(signals)):
                if j in removed:
                    continue
                if similarity_matrix[i][j] >= self.DEDUP_SIMILARITY_THRESHOLD:
                    # 保留质量更好的（硬核事实优先，然后相关度高的）
                    if (
                        signals[j].evidence_type == EvidenceType.HARD_FACT
                        and signals[i].evidence_type != EvidenceType.HARD_FACT
                    ) or signals[j].relevance_score > signals[i].relevance_score:
                        removed.add(i)
                        break
                    else:
                        removed.add(j)

        result = [s for idx, s in enumerate(signals) if idx not in removed]
        logger.info("去重移除 %d 条重复线索", len(removed))
        return result

    # ── Step 3: 隐私标记校验 ──────────────────────────────────────

    @staticmethod
    def _validate_privacy_flag(
        signals: List[ProcessedSignal],
    ) -> List[ProcessedSignal]:
        """数据已在端侧插件完成脱敏，此处仅校验 privacy_cleared 标记"""
        # 当前实现直接通过（端侧已脱敏），后续可增加合规检查
        return signals

    # ── Step 4.5: 相关度过滤 ──────────────────────────────────────

    def _filter_by_relevance(
        self, signals: List[ProcessedSignal]
    ) -> List[ProcessedSignal]:
        """过滤明显无关的数据"""
        return [
            s
            for s in signals
            if s.relevance_score >= self.RELEVANCE_THRESHOLD
        ]

    # ── Step 5.5: 簇间逻辑关系提取 ────────────────────────────────

    async def _extract_cluster_relations(
        self, clusters: List[SignalCluster], market_query: str
    ) -> List[ClusterRelation]:
        """显式提取所有语义簇两两之间的有意义逻辑关系（单次LLM调用）"""
        if len(clusters) < 2 or not self.llm_client:
            return []

        # 簇数过多时取 Top 20（按信号数），防止 Prompt 过长
        MAX_CLUSTERS_FOR_RELATIONS = 20
        analysis_clusters = (
            sorted(clusters, key=lambda c: len(c.signals), reverse=True)[:MAX_CLUSTERS_FOR_RELATIONS]
            if len(clusters) > MAX_CLUSTERS_FOR_RELATIONS
            else clusters
        )

        # 为每个簇生成摘要（含代表性证据样本）
        cluster_lines = []
        for idx, c in enumerate(analysis_clusters):
            top = sorted(c.signals, key=lambda s: s.quality_score, reverse=True)[:2]
            samples = " / ".join(s.evidence_text[:60] for s in top) or "(无样本)"
            cluster_lines.append(
                f"簇{idx + 1}「{c.theme}」"
                f"({c.sentiment}, 硬核={c.hard_fact_count}条, 画像={c.persona_count}条)\n"
                f"  代表证据: {samples}"
            )
        clusters_text = "\n".join(cluster_lines)

        prompt = f"""分析以下证据簇，识别它们之间有意义的逻辑关系。

## 预测问题
{market_query}

## 证据簇列表
{clusters_text}

## 任务
只输出具有以下关系类型的簇对，跳过无意义关联：
- causes: 源簇是目标簇的直接原因（时序上源簇先发生）
- supports: 源簇为目标簇提供侧面支撑证据（相关但非直接因果）
- contradicts: 两簇信号相互对抗/矛盾（一个正向一个负向）
- conditional: 源簇成立时目标簇才成立（条件依赖）

方向说明: "A->B" 表示从source到target，"B->A" 表示反向，"bidirectional" 表示双向影响

## 输出 JSON
{{"relations": [
  {{"source_theme": "簇主题名（与上方完全一致）",
    "target_theme": "簇主题名（与上方完全一致）",
    "relation_type": "causes",
    "direction": "A->B",
    "confidence": 0.85,
    "explanation": "一句话说明逻辑关系"}}
]}}"""

        try:
            result = await self.llm_client.chat_json(prompt, temperature=0.2)
        except Exception as e:
            logger.warning("簇间关系提取 LLM 调用失败: %s", e)
            return []

        # 构建 theme → ClusterID 映射（精确 + 子串兜底）
        theme_to_cluster: Dict[str, SignalCluster] = {
            c.theme: c for c in clusters
        }

        def _match_cluster(theme: str) -> Optional[SignalCluster]:
            if theme in theme_to_cluster:
                return theme_to_cluster[theme]
            # 子串兜底（LLM可能略微改写主题名）
            theme_lower = theme.lower()
            for t, c in theme_to_cluster.items():
                if theme_lower in t.lower() or t.lower() in theme_lower:
                    return c
            return None

        relations: List[ClusterRelation] = []
        seen: set = set()  # 防止重复
        for r in result.get("relations", []):
            src_cluster = _match_cluster(r.get("source_theme", ""))
            tgt_cluster = _match_cluster(r.get("target_theme", ""))
            if not src_cluster or not tgt_cluster:
                continue
            if src_cluster.cluster_id == tgt_cluster.cluster_id:
                continue
            pair_key = tuple(sorted([src_cluster.cluster_id, tgt_cluster.cluster_id]))
            if pair_key in seen:
                continue
            seen.add(pair_key)

            relations.append(ClusterRelation(
                source_cluster_id=src_cluster.cluster_id,
                target_cluster_id=tgt_cluster.cluster_id,
                source_theme=src_cluster.theme,
                target_theme=tgt_cluster.theme,
                relation_type=r.get("relation_type", "supports"),
                direction=r.get("direction", "A->B"),
                confidence=max(0.0, min(1.0, float(r.get("confidence", 0.5)))),
                explanation=r.get("explanation", ""),
            ))

        logger.debug(
            "簇间关系: %d 条有效关系 (causes=%d, supports=%d, contradicts=%d)",
            len(relations),
            sum(1 for r in relations if r.relation_type == "causes"),
            sum(1 for r in relations if r.relation_type == "supports"),
            sum(1 for r in relations if r.relation_type == "contradicts"),
        )
        return relations

    # ── Step 5: 语义聚类 ──────────────────────────────────────────

    async def _semantic_clustering(
        self, signals: List[ProcessedSignal], market_query: str
    ) -> List[SignalCluster]:
        """路由函数：信号量少于阈值时单批聚类，否则分批并行后合并"""
        if not signals:
            return []
        if len(signals) <= self.CLUSTER_SIGNAL_BATCH:
            return await self._cluster_signals_single(signals, market_query)
        logger.info(
            "信号量 %d 超过阈值 %d，启动分批聚类",
            len(signals), self.CLUSTER_SIGNAL_BATCH,
        )
        return await self._cluster_signals_batched(signals, market_query)

    async def _cluster_signals_single(
        self, signals: List[ProcessedSignal], market_query: str
    ) -> List[SignalCluster]:
        """单批聚类（≤CLUSTER_SIGNAL_BATCH 条信号）"""
        entity_summary = self._build_entity_index(signals)
        top_entities = sorted(
            entity_summary.values(), key=lambda x: x["frequency"], reverse=True
        )[:15]
        entity_hint = ", ".join(
            f"{e['text']}({e['frequency']}次)" for e in top_entities
        )

        signal_texts = "\n".join(
            f"[{i}] [{'硬核事实' if s.evidence_type == EvidenceType.HARD_FACT else '画像推演'}]"
            f" {s.evidence_text[:80]}"
            for i, s in enumerate(signals)
        )

        prompt = (
            "请对以下线索按主题/影响因素分组。\n\n"
            f"## 预测问题\n{market_query}\n\n"
            f"## 高频实体（供参考）\n{entity_hint}\n\n"
            f"## 线索列表\n{signal_texts}\n\n"
            "## 要求\n"
            "1. 分成 5-15 个主题聚类（根据线索数量和主题多样性灵活调整）\n"
            "2. 优先以高频实体为聚类锚点\n"
            "3. 每个聚类应该主题明确、边界清晰，避免过度泛化\n"
            "4. 为每个聚类判断其对预测问题的情感倾向（positive/negative/neutral）\n"
            "5. 输出 JSON 格式\n\n"
            '## 输出格式\n{"clusters": [\n'
            '  {"theme": "主题标签", "sentiment": "positive/negative/neutral",\n'
            '   "anchor_entities": ["实体1", "实体2"],\n'
            '   "signal_indices": [0, 3, 7]}\n'
            "]}"
        )

        try:
            result = await self.llm_client.chat_json(prompt)
        except Exception as e:
            logger.error("语义聚类 LLM 调用失败: %s", e)
            return [self._make_fallback_cluster(signals)]

        return self._parse_cluster_result(result, signals)

    async def _cluster_signals_batched(
        self, signals: List[ProcessedSignal], market_query: str
    ) -> List[SignalCluster]:
        """大量信号时：并行分批聚类，再 LLM 合并相似主题"""
        batches = [
            signals[i : i + self.CLUSTER_SIGNAL_BATCH]
            for i in range(0, len(signals), self.CLUSTER_SIGNAL_BATCH)
        ]
        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_LLM_CALLS)

        async def _cluster_one(batch: List[ProcessedSignal]) -> List[SignalCluster]:
            async with semaphore:
                return await self._cluster_signals_single(batch, market_query)

        batch_results = await asyncio.gather(
            *[_cluster_one(b) for b in batches]
        )
        local_clusters = [c for bc in batch_results for c in bc]
        logger.info(
            "分批聚类完成: %d 批 → %d 个局部簇，开始合并",
            len(batches), len(local_clusters),
        )
        return await self._merge_local_clusters(local_clusters, market_query)

    async def _merge_local_clusters(
        self, local_clusters: List[SignalCluster], market_query: str
    ) -> List[SignalCluster]:
        """层级合并：所有局部簇都参与，分批并行→收敛，不丢弃任何数据。
        
        算法（类 Merge-Sort）：
          Round 1: 将 N 个局部簇分成若干组（每组 ≤ MERGE_BATCH_SIZE），
                   各组并行调用 LLM 合并 → 产生中间层簇
          Round N: 若中间层簇仍 > MERGE_BATCH_SIZE，继续分批合并
          终止条件: 总簇数 ≤ MERGE_BATCH_SIZE → 最终单次合并
        时间复杂度: O(log(N/B) × B) 次 LLM 调用（B=批次大小）
        """
        if not local_clusters:
            return []

        MERGE_BATCH_SIZE = 30  # 每次 LLM 合并最多处理的局部簇数
        MAX_ROUNDS = 10        # 最大合并轮次，防止 LLM 拒绝合并时的死循环
        current = list(local_clusters)
        round_num = 0

        while len(current) > MERGE_BATCH_SIZE and round_num < MAX_ROUNDS:
            round_num += 1
            count_before = len(current)
            batches = [
                current[i : i + MERGE_BATCH_SIZE]
                for i in range(0, len(current), MERGE_BATCH_SIZE)
            ]
            logger.info(
                "层级合并 Round %d: %d 个簇 → %d 批并行合并",
                round_num, count_before, len(batches),
            )
            semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_LLM_CALLS)

            async def _merge_one_batch(batch: List[SignalCluster]) -> List[SignalCluster]:
                async with semaphore:
                    return await self._merge_clusters_single_pass(batch, market_query)

            results = await asyncio.gather(
                *[_merge_one_batch(b) for b in batches]
            )
            current = [c for batch_result in results for c in batch_result]
            logger.info("Round %d 完成: → %d 个中间簇", round_num, len(current))

            # 收敛检测：若本轮簇数未减少，说明 LLM 拒绝合并，提前退出防止死循环
            if len(current) >= count_before:
                logger.warning(
                    "层级合并 Round %d 未收敛（%d→%d），提前退出，保留当前 %d 个簇",
                    round_num, count_before, len(current), len(current),
                )
                return current

        # 最终单次合并（current ≤ MERGE_BATCH_SIZE）
        final = await self._merge_clusters_single_pass(current, market_query)
        logger.info(
            "主题合并完成 (%d 轮): %d 局部簇 → %d 最终簇",
            round_num + 1, len(local_clusters), len(final),
        )
        return final

    async def _merge_clusters_single_pass(
        self, clusters: List[SignalCluster], market_query: str
    ) -> List[SignalCluster]:
        """单次 LLM 合并：将给定局部簇列表合并为更少的主题簇，归并所有信号"""
        if not clusters:
            return []
        if len(clusters) == 1:
            return clusters

        theme_lines = "\n".join(
            f"- 「{c.theme}」({c.sentiment}, {len(c.signals)}条信号, "
            f"硬核={c.hard_fact_count})"
            for c in clusters
        )
        prompt = (
            "以下是对大量线索分批聚类后产生的局部主题列表，"
            "请将语义相似或高度重叠的主题合并为更少的主题集合。\n\n"
            f"## 预测问题\n{market_query}\n\n"
            f"## 局部主题列表\n{theme_lines}\n\n"
            "## 要求\n"
            "1. 合并后主题数量控制在 3-10 个（本批次范围内合理归并）\n"
            "2. 每个合并组必须列出所有被合并的原主题（source_themes，与上方完全一致）\n"
            "3. 为合并后主题指定情感倾向（以信号数较多的子主题为准）\n\n"
            '## 输出 JSON\n{"merges": [\n'
            '  {"master_theme": "合并后主题名",\n'
            '   "sentiment": "positive/negative/neutral",\n'
            '   "source_themes": ["原主题1", "原主题2"]}\n'
            "]}"
        )

        try:
            result = await self.llm_client.chat_json(prompt, temperature=0.2)
        except Exception as e:
            logger.warning("主题合并 LLM 调用失败，保留本批局部簇: %s", e)
            return clusters

        # 构建 source_theme → master_theme 映射
        theme_to_master: Dict[str, str] = {}
        master_sentiments: Dict[str, str] = {}
        for merge in result.get("merges", []):
            master = merge.get("master_theme", "")
            sentiment = merge.get("sentiment", "neutral")
            if not master:
                continue
            master_sentiments[master] = sentiment
            for src in merge.get("source_themes", []):
                theme_to_master[src] = master

        # 未被映射的局部簇保留原主题名
        for c in clusters:
            if c.theme not in theme_to_master:
                theme_to_master[c.theme] = c.theme
                master_sentiments.setdefault(c.theme, c.sentiment or "neutral")

        # 按 master_theme 归并信号
        master_map: Dict[str, SignalCluster] = {}
        for local_c in clusters:
            master = theme_to_master[local_c.theme]
            if master not in master_map:
                master_map[master] = SignalCluster(
                    cluster_id=f"cluster_{uuid.uuid4().hex[:8]}",
                    theme=master,
                    sentiment=master_sentiments.get(master, "neutral"),
                    signals=[],
                    hard_fact_count=0,
                    persona_count=0,
                )
            mc = master_map[master]
            mc.signals.extend(local_c.signals)
            mc.hard_fact_count += local_c.hard_fact_count
            mc.persona_count += local_c.persona_count
            mc.anchor_entities = list(
                set(mc.anchor_entities) | set(local_c.anchor_entities)
            )
            for s in local_c.signals:
                s.cluster_id = mc.cluster_id
                s.sentiment_tag = mc.sentiment

        return list(master_map.values())

    # ── 聚类辅助方法 ──────────────────────────────────────────────

    def _parse_cluster_result(
        self, result: Dict, signals: List[ProcessedSignal]
    ) -> List[SignalCluster]:
        """将 LLM 聚类结果解析为 SignalCluster 列表"""
        clusters = []
        assigned_indices: set = set()

        for c_data in result.get("clusters", []):
            indices = c_data.get("signal_indices", [])
            cluster_signals = [
                signals[i] for i in indices if 0 <= i < len(signals)
            ]
            assigned_indices.update(i for i in indices if 0 <= i < len(signals))

            cluster_id = f"cluster_{uuid.uuid4().hex[:8]}"
            sentiment = c_data.get("sentiment", "neutral")
            for s in cluster_signals:
                s.cluster_id = cluster_id
                s.sentiment_tag = sentiment

            clusters.append(SignalCluster(
                cluster_id=cluster_id,
                theme=c_data.get("theme", "未知主题"),
                sentiment=sentiment,
                anchor_entities=c_data.get("anchor_entities", []),
                signals=cluster_signals,
                hard_fact_count=sum(
                    1 for s in cluster_signals
                    if s.evidence_type == EvidenceType.HARD_FACT
                ),
                persona_count=sum(
                    1 for s in cluster_signals
                    if s.evidence_type == EvidenceType.PERSONA_INFERENCE
                ),
            ))

        # 未分配线索 → "其他" 簇
        unassigned = [
            signals[i] for i in range(len(signals)) if i not in assigned_indices
        ]
        if unassigned:
            clusters.append(self._make_fallback_cluster(unassigned, theme="其他"))

        return clusters

    @staticmethod
    def _make_fallback_cluster(
        signals: List[ProcessedSignal], theme: str = "综合"
    ) -> SignalCluster:
        cluster_id = f"cluster_{uuid.uuid4().hex[:8]}"
        for s in signals:
            s.cluster_id = cluster_id
        return SignalCluster(
            cluster_id=cluster_id,
            theme=theme,
            sentiment="neutral",
            signals=list(signals),
            hard_fact_count=sum(
                1 for s in signals if s.evidence_type == EvidenceType.HARD_FACT
            ),
            persona_count=sum(
                1 for s in signals if s.evidence_type == EvidenceType.PERSONA_INFERENCE
            ),
        )

    # ── Step 6: 边际贡献评分 ──────────────────────────────────────

    async def _compute_marginal_contribution(
        self, signals: List[ProcessedSignal], market_query: str
    ) -> List[ProcessedSignal]:
        """LLM 并行批次评估信息质量 Qi (0-1)，Semaphore 控制并发上限"""
        if not signals or not self.llm_client:
            return signals

        batch_size = 30
        batches = [signals[i : i + batch_size] for i in range(0, len(signals), batch_size)]
        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_LLM_CALLS)

        async def _score_batch(batch: List[ProcessedSignal], batch_idx: int) -> None:
            signal_texts = "\n".join(
                f"[{j}] [{'硬核事实' if s.evidence_type == EvidenceType.HARD_FACT else '画像推演'}]"
                f" {s.evidence_text[:300]}"
                for j, s in enumerate(batch)
            )
            prompt = (
                "请为以下线索评估信息质量分数 (0-1)。\n\n"
                f"## 预测问题\n{market_query}\n\n"
                f"## 线索\n{signal_texts}\n\n"
                "## 评分标准\n"
                "- 1.0: 罕见、具体、可验证的硬核事实\n"
                "- 0.7-0.9: 有价值的具体细节\n"
                "- 0.4-0.6: 一般性信息，有一定参考价值\n"
                "- 0.1-0.3: 泛泛内容，缺乏具体信息\n"
                "- 0.0: 重复/无关/幻觉内容\n\n"
                '## 输出 JSON\n{"scores": [0.85, 0.40, ...]}'
            )
            async with semaphore:
                try:
                    result = await self.llm_client.chat_json(prompt)
                    scores = result.get("scores", [])
                    for j, s in enumerate(batch):
                        if j < len(scores):
                            s.quality_score = max(0.0, min(1.0, float(scores[j])))
                except Exception as e:
                    logger.warning("Qi 评分失败 (batch %d): %s", batch_idx, e)
                    for s in batch:
                        s.quality_score = 0.5

        await asyncio.gather(
            *[_score_batch(batch, idx) for idx, batch in enumerate(batches)]
        )
        logger.info(
            "Qi 评分完成: %d 条线索，%d 批并行（并发上限=%d）",
            len(signals), len(batches), self.MAX_CONCURRENT_LLM_CALLS,
        )
        return signals

    # ── Step 7: 少数派识别 ────────────────────────────────────────

    def _identify_minority_clusters(
        self, clusters: List[SignalCluster]
    ) -> List[SignalCluster]:
        """识别少数派语义簇 — 由平台LLM判断，非Agent预测"""
        if not clusters:
            return []

        sentiment_weights: Dict[str, int] = {}
        for c in clusters:
            s = c.sentiment or "neutral"
            sentiment_weights[s] = sentiment_weights.get(s, 0) + len(c.signals)

        if not sentiment_weights:
            return []

        majority_sentiment = max(sentiment_weights, key=sentiment_weights.get)

        minorities = []
        for c in clusters:
            avg_qi = self._avg_qi(c)
            if (
                c.sentiment != majority_sentiment
                and c.hard_fact_count > 0
                and avg_qi > 0.5
            ):
                for s in c.signals:
                    s.is_minority = True
                minorities.append(c)

        return minorities

    @staticmethod
    def _avg_qi(cluster: SignalCluster) -> float:
        if not cluster.signals:
            return 0.0
        return sum(s.quality_score for s in cluster.signals) / len(
            cluster.signals
        )

    # ── Step 8: 实体索引 ──────────────────────────────────────────

    @staticmethod
    def _build_entity_index(
        signals: List[ProcessedSignal],
    ) -> Dict[str, Dict]:
        """汇总所有 Agent 提取的实体标注，构建全局实体索引"""
        index: Dict[str, Dict] = {}
        for s in signals:
            for tag in s.entity_tags:
                key = tag.text.lower()
                if key not in index:
                    index[key] = {
                        "text": tag.text,
                        "type": tag.type,
                        "role": tag.role,
                        "signal_ids": [],
                        "agent_ids": set(),
                        "frequency": 0,
                    }
                index[key]["signal_ids"].append(s.signal_id)
                index[key]["agent_ids"].add(s.agent_id)
                index[key]["frequency"] += 1

        # set → list for serialization
        for entry in index.values():
            entry["agent_ids"] = list(entry["agent_ids"])
            entry["independent_agent_count"] = len(entry["agent_ids"])

        return index

    # ── Step 8.5: 画像统计聚合 ──────────────────────────────────

    @staticmethod
    def _aggregate_persona_stats(
        signals: List[ProcessedSignal],
        clusters: List[SignalCluster],
    ) -> Dict:
        """UAP v2.0: 聚合画像维度统计，供因果引擎进行人群视角分析"""
        # 全局维度分布
        dimensions = [
            "occupation", "age_range", "gender", "region",
            "education", "income_level", "investment_experience",
        ]
        global_dist: Dict[str, Dict[str, int]] = {d: {} for d in dimensions}
        signals_with_persona = 0

        for s in signals:
            if not s.user_persona:
                continue
            signals_with_persona += 1
            for dim in dimensions:
                val = s.user_persona.get(dim)
                if val:
                    global_dist[dim][val] = global_dist[dim].get(val, 0) + 1

        # 每个簇的画像分布
        for cluster in clusters:
            cluster_dist: Dict[str, Dict[str, int]] = {d: {} for d in dimensions}
            for s in cluster.signals:
                if not s.user_persona:
                    continue
                for dim in dimensions:
                    val = s.user_persona.get(dim)
                    if val:
                        cluster_dist[dim][val] = cluster_dist[dim].get(val, 0) + 1
            # 只保留有数据的维度
            cluster.persona_distribution = {
                d: dist for d, dist in cluster_dist.items() if dist
            }

        return {
            "signals_with_persona": signals_with_persona,
            "total_signals": len(signals),
            "coverage_rate": round(signals_with_persona / max(len(signals), 1), 2),
            "dimensions": {d: dist for d, dist in global_dist.items() if dist},
        }

    # ── Step 9: 汇总 ─────────────────────────────────────────────

    @staticmethod
    def _build_result(
        task_id: str,
        signals: List[ProcessedSignal],
        clusters: List[SignalCluster],
        minority_clusters: List[SignalCluster],
        entity_index: Dict,
        persona_summary: Optional[Dict] = None,
        cluster_relations: Optional[List[ClusterRelation]] = None,
    ) -> PreprocessResult:
        hard_fact_count = sum(
            1 for s in signals if s.evidence_type == EvidenceType.HARD_FACT
        )
        persona_count = sum(
            1
            for s in signals
            if s.evidence_type == EvidenceType.PERSONA_INFERENCE
        )
        return PreprocessResult(
            task_id=task_id,
            total_signals=len(signals),
            valid_signals=len(signals),
            clusters=clusters,
            minority_clusters=minority_clusters,
            entity_index=entity_index,
            hard_fact_count=hard_fact_count,
            persona_count=persona_count,
            persona_summary=persona_summary or {},
            cluster_relations=cluster_relations or [],
        )
