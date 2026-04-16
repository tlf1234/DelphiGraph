"""
线索预处理管线 (SignalPreprocessor) — UAP v3.0

完整预处理流程：
1. 解析原始提交 → ProcessedSignal（含 relevance_reasoning/source_type/data_exclusivity/observed_at）
2. UAP v3 定向去重（仅 public 信号去重，private/semi_private 全量保留独立观测）
3. 隐私标记校验（确认端侧已脱敏）
4. 赋予证据权重（evidence_type × data_exclusivity 双乘数）
4.5. 相关度过滤（端侧已完成，跳过）
5. 语义聚类（LLM + relevance_reasoning 因果维度 + entity role 分层）
5.5. 簇间逻辑关系提取
6. 边际贡献评分 Qi（含 data_exclusivity/source_type 信息增益）
7. 少数派识别
8. 实体索引构建（含 role 分类）
8.5. 画像统计聚合（v3: risk_appetite/consumption_style/interests）
8.6. 因果实体种子提取（role=cause 高频实体 → Phase 2 因子命名）
9. 汇总输出
"""

import asyncio
import logging
import random
import time
import uuid
from datetime import datetime, timezone
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
    EXCLUSIVITY_WEIGHTS = {
        "private": 1.5,       # 用户私有数据，独立观测，最高信息价値
        "semi_private": 1.0,  # 生成推演，中等价値
        "public": 0.5,        # 公网数据，多 Agent 可能重复，边际价値最低
    }
    DEDUP_SIMILARITY_THRESHOLD = 0.92
    RELEVANCE_THRESHOLD = 0.2
    MAX_CONCURRENT_LLM_CALLS = 12  # Semaphore 并发上限（大规模场景下提升 LLM 吞吐）
    CLUSTER_SIGNAL_BATCH = 150      # 单次聚类最大信号数，超过则分批
    QI_HEURISTIC_THRESHOLD = 500    # 超过此值启用混合 Qi 评分（启发式预评分 + LLM 标定）
    QI_CALIBRATION_SAMPLE = 200     # 混合模式下 LLM 标定样本大小（固定上限，是 O(1) 而非 O(n⁄batch)）
    CLUSTER_TAXONOMY_THRESHOLD = 5000  # 超过此值改用分类体系优先聚类（O(1) LLM 调用量，与总量无关）
    CLUSTER_TAXONOMY_SAMPLE = 1500     # 用于发现主题体系的抽样规模
    MAX_FINAL_CLUSTERS = 12            # 合并后最终簇的上限，超过则追加强制合并轮次

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def process(
        self,
        task_id: str,
        raw_submissions: List[Dict[str, Any]],
        task_query: str,
    ) -> PreprocessResult:
        """完整预处理管线"""
        # Step 1: 转换为 ProcessedSignal（解析 relevance_score + entity_tags）
        signals = self._parse_raw_submissions(task_id, raw_submissions)
        logger.info("Step 1: 解析得到 %d 条线索", len(signals))

        # Step 2: UAP v3 定向去重 — 仅对 public 信号去重，private/semi_private 保留全量（独立观测）
        signals = await self._deduplicate_public_only(signals)
        logger.info("Step 2: 定向去重后剩余 %d 条线索", len(signals))

        # Step 3: 隐私标记校验
        signals = self._validate_privacy_flag(signals)
        logger.info("Step 3: 隐私校验后剩余 %d 条", len(signals))

        # Step 4: 赋予证据权重（UAP v3: evidence_type × data_exclusivity × persona 三乘数）
        for s in signals:
            base = self.EVIDENCE_WEIGHTS.get(s.evidence_type, 0.1)
            excl = self.EXCLUSIVITY_WEIGHTS.get(s.data_exclusivity, 1.0)
            persona_mult = self._persona_weight_multiplier(s)
            s.weight = base * excl * persona_mult

        # Step 4.5: 相关度过滤（已跳过：数据在插件端已完成质量检测，无需后端二次过滤）
        logger.info("Step 4.5: 跳过相关度过滤，保留全量 %d 条线索", len(signals))

        # Step 5: 语义聚类（先于 Qi 评分完成，为边际贡献评分提供簇上下文）
        _t56 = time.time()
        clusters = await self._semantic_clustering(signals, task_query)
        logger.info("Step 5: 语义聚类完成: %d 个语义簇", len(clusters))
        total_in_clusters = sum(len(c.signals) for c in clusters)
        logger.info(
            "[SIGNAL AUDIT] process(): parsed=%d  clusters=%d  total_in_clusters=%d",
            len(signals), len(clusters), total_in_clusters,
        )

        # Step 6: 簇感知 Qi 边际贡献评分（以簇为单位，评估每条信号相对同簇其他信号的边际信息量）
        signals = await self._compute_marginal_contribution(signals, task_query, clusters=clusters)
        _t56_elapsed = round(time.time() - _t56, 2)
        logger.info("Steps 5+6 完成 (%.2fs 串行): %d 条信号 Qi 评分完毕", _t56_elapsed, len(signals))

        # Step 5.5: 显式簇间逻辑关系提取（Alphapoly Implications）
        _t55 = time.time()
        cluster_relations = await self._extract_cluster_relations(clusters, task_query)
        _t55_elapsed = round(time.time() - _t55, 2)
        logger.info("Step 5.5: 提取 %d 条簇间逻辑关系 (%.2fs)", len(cluster_relations), _t55_elapsed)

        # Step 7: 少数派识别
        minority_clusters = self._identify_minority_clusters(clusters)
        logger.info("Step 7: 识别 %d 个少数派簇", len(minority_clusters))

        # Step 8: 实体索引构建
        entity_index = self._build_entity_index(signals)
        logger.info("Step 8: 实体索引包含 %d 个实体", len(entity_index))

        # Step 8.5: 画像统计聚合（UAP v3.0）
        persona_summary = self._aggregate_persona_stats(signals, clusters)
        logger.info("Step 8.5: 画像统计完成，%d 条信号含画像数据",
                    persona_summary.get("signals_with_persona", 0))

        # Step 8.6: 提取 cause_entity_seeds（role=cause 高频实体，供 Phase 2 因子命名）
        cause_entity_seeds = self._extract_cause_entity_seeds(entity_index)
        logger.info("Step 8.6: 提取 %d 个因果驱动力实体种子", len(cause_entity_seeds))

        # Step 9: 汇总
        return self._build_result(
            task_id, signals, clusters, minority_clusters,
            entity_index, persona_summary, cluster_relations, cause_entity_seeds
        )

    # ── Step 1: 解析 ────────────────────────────────────────────

    def _parse_raw_submissions(
        self, task_id: str, raw_submissions: List[Dict]
    ) -> List[ProcessedSignal]:
        """将 signal_submissions 数据转换为 ProcessedSignal（UAP v3.0，字段缺失时安全兑换）"""
        signals = []
        for sub in raw_submissions:
            agent_id = sub.get("agent_id") or sub.get("user_id", "unknown")
            raw_signals = sub.get("signals") or []

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

                # UAP v3: data_exclusivity 缺失时根据 source_type 推断默认値
                raw_exclusivity = raw_sig.get("data_exclusivity", "")
                if raw_exclusivity in ("private", "semi_private", "public"):
                    data_exclusivity = raw_exclusivity
                else:
                    source_type = raw_sig.get("source_type", "")
                    if source_type in ("local_chat", "local_email", "local_document",
                                       "local_transaction", "local_browsing"):
                        data_exclusivity = "private"
                    elif source_type in ("local_memory", "user_profile", "behavior_pattern"):
                        data_exclusivity = "semi_private"
                    else:
                        data_exclusivity = "public"

                signal = ProcessedSignal(
                    signal_id=raw_sig.get(
                        "signal_id", f"sig_{uuid.uuid4().hex[:8]}"
                    ),
                    task_id=task_id,
                    agent_id=agent_id,
                    evidence_type=evidence_type,
                    evidence_text=raw_sig.get("evidence_text", ""),
                    source_description=raw_sig.get("source_description", ""),
                    relevance_score=float(raw_sig.get("relevance_score", 0.5)),
                    relevance_reasoning=raw_sig.get("relevance_reasoning", ""),
                    source_type=raw_sig.get("source_type", ""),
                    data_exclusivity=data_exclusivity,
                    observed_at=raw_sig.get("observed_at"),
                    entity_tags=entity_tags,
                    agent_reputation=float(sub.get("agent_reputation", 100.0)),
                    user_persona=sub.get("user_persona"),
                )
                signals.append(signal)

        return signals

    # ── Step 2: UAP v3 定向去重 ──────────────────────────────────

    async def _deduplicate_public_only(
        self, signals: List[ProcessedSignal]
    ) -> List[ProcessedSignal]:
        """UAP v3 定向去重：仅对 public 信号做文本精确匹配去重。
        private/semi_private 信号全量保留（每条都是独立观测，去重会损失统计功效）。
        """
        public_sigs = [s for s in signals if s.data_exclusivity == "public"]
        non_public = [s for s in signals if s.data_exclusivity != "public"]

        if not public_sigs:
            return signals

        seen: dict = {}
        deduped_public: List[ProcessedSignal] = []
        for s in public_sigs:
            key = s.evidence_text.strip().lower()
            if key not in seen:
                seen[key] = True
                deduped_public.append(s)

        removed = len(public_sigs) - len(deduped_public)
        if removed > 0:
            logger.info(
                "Step 2 定向去重: public 信号 %d→%d（移除 %d 条重复公网数据），"
                "private+semi_private %d 条全量保留",
                len(public_sigs), len(deduped_public), removed, len(non_public),
            )
        return non_public + deduped_public

    # ── Step 3: 隐私标记校验 ──────────────────────────────────────

    @staticmethod
    def _validate_privacy_flag(
        signals: List[ProcessedSignal],
    ) -> List[ProcessedSignal]:
        """数据已在端侧插件完成脱敏，此处仅校验 privacy_cleared 标记"""
        # 当前实现直接通过（端侧已脱敏），后续可增加合规检查
        return signals

    # ── Step 4: Persona 权重乘数 ──────────────────────────────────

    @staticmethod
    def _persona_weight_multiplier(s: "ProcessedSignal") -> float:
        """UAP v3 利益相关者矩阵乘数：基于 user_persona 三个维度调整信号权重。

        规则：
          risk_appetite=conservative/low + 含负向实体(negative_intent) → ×1.3
            （保守型用户对风险的感知更准确，其风险信号具有更高预测价值）
          investment_experience=10y+ + hard_fact → ×1.2
            （高经验用户的事实判断准确率更高）
          occupation 利益相关度矩阵 → ×1.0–1.15
            （与预测任务利益相关度越高的职业，其信号越值得加权）
          combined 乘数上限 1.5（防止极端值）
        """
        if not s.user_persona:
            return 1.0

        mult = 1.0

        # ① risk_appetite × 风险实体：保守型用户标注的负向信号更可信
        risk_appetite = s.user_persona.get("risk_appetite", "")
        has_negative = any(t.role == "negative_intent" for t in s.entity_tags)
        if risk_appetite in ("conservative", "low") and has_negative:
            mult *= 1.3

        # ② investment_experience × hard_fact：高经验 Agent 的一手事实加成
        exp = s.user_persona.get("investment_experience", "")
        if exp in ("10y+", "10y以上", "10+years") and s.evidence_type == EvidenceType.HARD_FACT:
            mult *= 1.2

        # ③ occupation 利益相关者矩阵（金融/经济预测域）
        occ_relevance = {
            "finance": 1.15,
            "academic": 1.10,
            "entrepreneur": 1.10,
            "technology": 1.05,
            "government": 1.05,
            "energy": 1.05,
        }
        occ_mult = occ_relevance.get(s.user_persona.get("occupation", ""), 1.0)

        # ④ consumption_style 分析型用户信号质量更高
        if s.user_persona.get("consumption_style") in ("rational", "analytical"):
            occ_mult = min(occ_mult + 0.05, 1.15)

        mult *= occ_mult
        return min(1.5, mult)

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
        self, clusters: List[SignalCluster], task_query: str
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
            evidence_samples = []
            for s in top:
                line = s.evidence_text[:80]
                if s.relevance_reasoning:
                    line += f"（因果推理: {s.relevance_reasoning[:60]}）"
                evidence_samples.append(line)
            samples = " / ".join(evidence_samples) or "(无样本)"
            cluster_lines.append(
                f"簇{idx + 1}「{c.theme}」"
                f"({c.sentiment}, 硬核={c.hard_fact_count}条, 画像={c.persona_count}条)\n"
                f"  代表证据+因果推理: {samples}"
            )
        clusters_text = "\n".join(cluster_lines)

        prompt = f"""分析以下证据簇，识别它们之间有意义的逻辑关系。

## 预测问题
{task_query}

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
        self, signals: List[ProcessedSignal], task_query: str
    ) -> List[SignalCluster]:
        """路由函数：三档策略按信号量选择聚类模式
        ≤ CLUSTER_SIGNAL_BATCH      : 单批聚类（1 次 LLM）
        ≤ CLUSTER_TAXONOMY_THRESHOLD: 分批并行 + 层级合并（O(n/batch) 次 LLM）
        > CLUSTER_TAXONOMY_THRESHOLD: 分类体系优先（固定 O(1) 次 LLM，与总量无关）
        """
        if not signals:
            return []
        if len(signals) <= self.CLUSTER_SIGNAL_BATCH:
            return await self._cluster_signals_single(signals, task_query)
        if len(signals) <= self.CLUSTER_TAXONOMY_THRESHOLD:
            logger.info(
                "信号量 %d 超过阈值 %d，启动分批聚类",
                len(signals), self.CLUSTER_SIGNAL_BATCH,
            )
            return await self._cluster_signals_batched(signals, task_query)
        logger.info(
            "信号量 %d 超过 %d，启动分类体系优先聚类（O(1) LLM 开销）",
            len(signals), self.CLUSTER_TAXONOMY_THRESHOLD,
        )
        return await self._cluster_signals_taxonomy(signals, task_query)

    async def _cluster_signals_single(
        self, signals: List[ProcessedSignal], task_query: str
    ) -> List[SignalCluster]:
        """单批聚类（≤CLUSTER_SIGNAL_BATCH 条信号）"""
        entity_summary = self._build_entity_index(signals)
        top_entities = sorted(
            entity_summary.values(), key=lambda x: x["frequency"], reverse=True
        )[:15]
        entity_hint = ", ".join(
            f"{e['text']}({e['frequency']}次)" for e in top_entities
        )

        # UAP v3: 三维联合特征信号文本
        # 主维度: evidence_text + relevance_reasoning
        # 辅维度2: data_exclusivity 标签
        # 时序辅助: observed_at → 时间窗口标签
        now_ts = datetime.now(timezone.utc)

        def _time_window(obs: Optional[str]) -> str:
            if not obs:
                return "时间未知"
            try:
                dt = datetime.fromisoformat(obs.replace("Z", "+00:00"))
                days_ago = (now_ts - dt).days
                if days_ago <= 7:
                    return "近7天"
                if days_ago <= 30:
                    return "近30天"
                if days_ago <= 90:
                    return "1-3个月"
                return "3个月前"
            except Exception:
                return "时间未知"

        signal_lines = []
        for i, s in enumerate(signals):
            etype = "硬核事实" if s.evidence_type == EvidenceType.HARD_FACT else "画像推演"
            excl_label = {"private": "私有", "semi_private": "半私有", "public": "公网"}.get(
                s.data_exclusivity, ""
            )
            tw = _time_window(s.observed_at)
            # 主维度：evidence_text（200字）+ relevance_reasoning（完整因果推理）
            line = f"[{i}][{etype}][{excl_label}][{tw}] {s.evidence_text[:200]}"
            if s.relevance_reasoning:
                line += f"\n    └─因果推理: {s.relevance_reasoning[:150]}"
            # 辅维度1：共享 cause/indicator 实体（显式标注供 LLM 作为共聚锚点）
            cause_tags = [t.text for t in s.entity_tags if t.role in ("cause", "indicator")]
            if cause_tags:
                line += f"\n    └─因果实体: {', '.join(cause_tags)}"
            signal_lines.append(line)
        signal_texts = "\n".join(signal_lines)

        # UAP v3: 提取 cause/indicator role 实体作为锚点提示
        cause_entities = [
            e["text"] for e in sorted(
                entity_summary.values(), key=lambda x: x["frequency"], reverse=True
            )[:15]
            if e.get("role") in ("cause", "indicator")
        ]
        indicator_hint = "、".join(cause_entities[:8]) if cause_entities else "（无明确因果实体）"

        prompt = (
            "请对以下线索按因果主题/影响因素分组。每条线索包含证据文本、Agent 的因果推理和因果实体标注。\n\n"
            f"## 预测问题\n{task_query}\n\n"
            f"## 高频实体（供参考）\n{entity_hint}\n\n"
            f"## Agent 标注的因果驱动力实体（优先作为聚类锚点）\n{indicator_hint}\n\n"
            f"## 线索列表（含因果推理、时间窗口）\n{signal_texts}\n\n"
            "## 聚类规则\n"
            "1. 分成 5-15 个主题聚类（根据线索数量和主题多样性灵活调整）\n"
            "2. 【核心约束】共享相同「因果实体」标注的线索必须优先聚在同一簇——"
            "因果链相同比表面文字相似更重要\n"
            "3. 聚类特征三维联合考虑：①证据文本语义 ②因果推理语义 ③共享因果实体\n"
            "4. 【时序感知】同一因果实体在不同时间窗口（[近7天]/[近30天]/[1-3个月]）"
            "若情感方向相反，必须拆分为独立簇并标注方向翻转\n"
            "5. 私有数据（[私有]标记）具有独立观测价值，按因果主题分组时不因重复文本被排除\n"
            "6. 每个聚类判断其对预测问题的情感倾向（positive/negative/neutral）\n"
            "7. 输出 JSON 格式\n\n"
            '## 输出格式\n{"clusters": [\n'
            '  {"theme": "主题标签", "sentiment": "positive/negative/neutral",\n'
            '   "anchor_entities": ["实体1", "实体2"],\n'
            '   "signal_indices": [0, 3, 7]}\n'
            "]}"
        )

        for attempt in range(2):
            try:
                result = await asyncio.wait_for(
                    self.llm_client.chat_json(prompt), timeout=60.0
                )
                return self._parse_cluster_result(result, signals)
            except asyncio.TimeoutError:
                logger.warning("语义聚类超时 (attempt %d, n=%d)", attempt, len(signals))
            except Exception as e:
                logger.error("语义聚类 LLM 调用失败 (attempt %d): %s", attempt, e)
        return [self._make_fallback_cluster(signals)]

    async def _cluster_signals_batched(
        self, signals: List[ProcessedSignal], task_query: str
    ) -> List[SignalCluster]:
        """大量信号时：并行分批聚类，再 LLM 合并相似主题"""
        batches = [
            signals[i : i + self.CLUSTER_SIGNAL_BATCH]
            for i in range(0, len(signals), self.CLUSTER_SIGNAL_BATCH)
        ]
        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_LLM_CALLS)

        async def _cluster_one(batch: List[ProcessedSignal]) -> List[SignalCluster]:
            async with semaphore:
                return await self._cluster_signals_single(batch, task_query)

        logger.info(
            "[SIGNAL AUDIT] _cluster_signals_batched(): total=%d  batches=%d  sizes=%s",
            len(signals), len(batches), [len(b) for b in batches],
        )
        batch_results = await asyncio.gather(
            *[_cluster_one(b) for b in batches]
        )
        local_clusters = [c for bc in batch_results for c in bc]
        local_total = sum(len(c.signals) for c in local_clusters)
        logger.info(
            "[SIGNAL AUDIT] _cluster_signals_batched(): local_clusters=%d  local_total_signals=%d  (expected %d)",
            len(local_clusters), local_total, len(signals),
        )
        logger.info(
            "分批聚类完成: %d 批 → %d 个局部簇，开始合并",
            len(batches), len(local_clusters),
        )
        merged = await self._merge_local_clusters(local_clusters, task_query)
        merged_total = sum(len(c.signals) for c in merged)
        logger.info(
            "[SIGNAL AUDIT] _cluster_signals_batched() after merge: merged_clusters=%d  merged_total_signals=%d",
            len(merged), merged_total,
        )
        return merged

    async def _cluster_signals_taxonomy(
        self, signals: List[ProcessedSignal], task_query: str
    ) -> List[SignalCluster]:
        """超大规模聚类（> CLUSTER_TAXONOMY_THRESHOLD）— 分类体系优先算法:
        1. 分层抽样 CLUSTER_TAXONOMY_SAMPLE 条（按硬核/画像比例）
        2. 对样本运行标准批量聚类 → 发现主题分类体系（LLM 调用量固定，与总信号量无关）
        3. 剩余信号用字符 bigram 相似度做启发式主题分配（纯 Python O(n×K)，无 LLM）
        """
        # Step A: 分层抽样，保持硬核/画像比例
        hard = [s for s in signals if s.evidence_type == EvidenceType.HARD_FACT]
        persona = [s for s in signals if s.evidence_type != EvidenceType.HARD_FACT]
        n_total = min(self.CLUSTER_TAXONOMY_SAMPLE, len(signals))
        n_hard = min(len(hard), max(1, int(n_total * len(hard) / len(signals))))
        n_persona = min(len(persona), n_total - n_hard)
        random.seed(42)
        sample = random.sample(hard, n_hard) + random.sample(persona, n_persona)
        logger.info(
            "分类体系优先: 抽样=%d（硬核=%d 画像=%d），总量=%d",
            len(sample), n_hard, n_persona, len(signals),
        )

        # Step B: 对样本聚类 → 主题体系
        taxonomy_clusters = await self._cluster_signals_batched(sample, task_query)

        # Step C: 构建主题画像（UAP v3 全字段：因果实体分层 + 双维度 bigram）
        def _bigrams(text: str, max_len: int = 200) -> set:
            t = text.lower()[:max_len]
            return {t[i: i + 2] for i in range(len(t) - 1)}

        profiles: Dict[str, Dict] = {}
        for c in taxonomy_clusters:
            cause_entities: set = set()   # cause/indicator 角色实体（因果锚点，高权重）
            all_entities: set = set()     # 全部实体（通用匹配，低权重）
            bgrams_ev: set = set()        # evidence_text bigram
            bgrams_reas: set = set()      # relevance_reasoning bigram（UAP v3）
            for s in c.signals:
                for tag in s.entity_tags:
                    all_entities.add(tag.text.lower())
                    if tag.role in ("cause", "indicator"):
                        cause_entities.add(tag.text.lower())
                bgrams_ev.update(_bigrams(s.evidence_text))
                if s.relevance_reasoning:
                    bgrams_reas.update(_bigrams(s.relevance_reasoning, max_len=150))
            profiles[c.cluster_id] = {
                "cluster": c,
                "cause_entities": cause_entities,
                "all_entities": all_entities,
                "bgrams_ev": bgrams_ev,
                "bgrams_reas": bgrams_reas,
            }

        # Step D: 启发式分配剩余信号（UAP v3 四维打分：因果实体×8 + 全量实体×2 + 证据bigram + 推理bigram×2）
        sample_ids = {s.signal_id for s in sample}
        remaining = [s for s in signals if s.signal_id not in sample_ids]
        unmatched: List[ProcessedSignal] = []

        for s in remaining:
            sig_cause_ent = {t.text.lower() for t in s.entity_tags if t.role in ("cause", "indicator")}
            sig_all_ent = {t.text.lower() for t in s.entity_tags}
            sig_bg_ev = _bigrams(s.evidence_text)
            sig_bg_reas = _bigrams(s.relevance_reasoning, max_len=150) if s.relevance_reasoning else set()
            best_id, best_score = None, -1.0
            for cid, prof in profiles.items():
                # cause/indicator 实体重叠（×8，与 LLM 路径"因果实体必须优先共聚"语义一致）
                cause_score = len(sig_cause_ent & prof["cause_entities"]) * 8.0
                # 全量实体重叠（×2，通用语义兜底）
                entity_score = len(sig_all_ent & prof["all_entities"]) * 2.0
                # evidence_text bigram Jaccard
                ev_union = len(sig_bg_ev | prof["bgrams_ev"])
                ev_score = len(sig_bg_ev & prof["bgrams_ev"]) / ev_union if ev_union else 0.0
                # relevance_reasoning bigram Jaccard（×2，UAP v3 因果推理文本）
                if sig_bg_reas and prof["bgrams_reas"]:
                    reas_union = len(sig_bg_reas | prof["bgrams_reas"])
                    reas_score = (len(sig_bg_reas & prof["bgrams_reas"]) / reas_union * 2.0
                                  if reas_union else 0.0)
                else:
                    reas_score = 0.0
                score = cause_score + entity_score + ev_score + reas_score
                if score > best_score:
                    best_score, best_id = score, cid
            if best_id and best_score > 0:
                c = profiles[best_id]["cluster"]
                c.signals.append(s)
                s.cluster_id = c.cluster_id
                s.sentiment_tag = c.sentiment
                if s.evidence_type == EvidenceType.HARD_FACT:
                    c.hard_fact_count += 1
                else:
                    c.persona_count += 1
            else:
                unmatched.append(s)

        # Step E: 未匹配信号 → 二次 LLM 聚类（保护少数派主题，不人为膨胀已有簇）
        # 【不能直接并入最大簇】：未匹配信号往往是稀有主题（实体重叠为0的信号），
        # 并入最大簇会导致少数派识别失效，且错误膨胀最大簇的置信度权重。
        secondary_clusters: List[SignalCluster] = []
        if unmatched:
            logger.info(
                "未匹配信号=%d，启动二次 LLM 聚类以保护少数派主题",
                len(unmatched),
            )
            try:
                secondary_clusters = await self._cluster_signals_batched(unmatched, task_query)
            except Exception as e:
                logger.warning("二次聚类失败，未匹配信号以启发式兜底: %s", e)
                if taxonomy_clusters:
                    largest = max(taxonomy_clusters, key=lambda c: len(c.signals))
                    for s in unmatched:
                        s.cluster_id = largest.cluster_id
                        s.sentiment_tag = largest.sentiment
                    largest.signals.extend(unmatched)

        all_clusters = taxonomy_clusters + secondary_clusters
        logger.info(
            "分类体系优先聚类完成: 主体主题=%d  启发式分配=%d  "
            "未匹配二次聚类=%d（新增主题=%d）",
            len(taxonomy_clusters),
            len(remaining) - len(unmatched),
            len(unmatched),
            len(secondary_clusters),
        )
        return all_clusters

    async def _merge_local_clusters(
        self, local_clusters: List[SignalCluster], task_query: str
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
        # 过滤空簇函数（可能在合并过程中产生）
        def _drop_empty(clusters: List[SignalCluster]) -> List[SignalCluster]:
            dropped = [c for c in clusters if not c.signals]
            if dropped:
                logger.warning(
                    "过滤空簇: %d 个簇没有信号，已剔除 (%s)",
                    len(dropped), [c.theme for c in dropped],
                )
            return [c for c in clusters if c.signals]

        current = _drop_empty(list(local_clusters))
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
                    return await self._merge_clusters_single_pass(batch, task_query)

            results = await asyncio.gather(
                *[_merge_one_batch(b) for b in batches]
            )
            current = _drop_empty([c for batch_result in results for c in batch_result])
            logger.info("Round %d 完成: → %d 个中间簇", round_num, len(current))

            # 收敛检测：若本轮簇数未减少，说明 LLM 拒绝合并，提前退出防止死循环
            if len(current) >= count_before:
                logger.warning(
                    "层级合并 Round %d 未收敛（%d→%d），提前退出，保留当前 %d 个簇",
                    round_num, count_before, len(current), len(current),
                )
                break

        # 最终单次合并（current ≤ MERGE_BATCH_SIZE）
        final = _drop_empty(await self._merge_clusters_single_pass(current, task_query))

        # 追加强制合并：若结果仍 > MAX_FINAL_CLUSTERS，再进行一轮强制合并
        if len(final) > self.MAX_FINAL_CLUSTERS:
            logger.info(
                "强制合并: 当前 %d 簇 > 上限 %d，追加一轮强制合并",
                len(final), self.MAX_FINAL_CLUSTERS,
            )
            final = _drop_empty(
                await self._merge_clusters_single_pass(
                    final, task_query, target_count=self.MAX_FINAL_CLUSTERS
                )
            )

        logger.info(
            "主题合并完成 (%d 轮): %d 局部簇 → %d 最终簇",
            round_num + 1, len(local_clusters), len(final),
        )
        return final

    async def _merge_clusters_single_pass(
        self, clusters: List[SignalCluster], task_query: str,
        target_count: Optional[int] = None,
    ) -> List[SignalCluster]:
        """单次 LLM 合并：将给定局部簇列表合并为更少的主题簇，归并所有信号"""
        if not clusters:
            return []
        if len(clusters) == 1:
            return clusters

        target = target_count or self.MAX_FINAL_CLUSTERS
        # 强制合并模式：目标数明确且当前簇明显超标时更激进
        force_aggressive = target_count is not None

        theme_lines = "\n".join(
            f"- 「{c.theme}」({c.sentiment}, {len(c.signals)}条信号, "
            f"硬核={c.hard_fact_count})"
            for c in clusters
        )
        aggr_note = (
            f"\n【强制模式】当前 {len(clusters)} 个局部簇超出上限 {target}，"
            "必须大幅合并，允许跨主题归并，优先保留信号量最多的核心主题。\n"
            if force_aggressive else ""
        )
        prompt = (
            "以下是对大量线索分批聚类后产生的局部主题列表，"
            "请将语义相似或高度重叠的主题合并为更少的主题集合。\n\n"
            f"## 预测问题\n{task_query}\n\n"
            f"## 局部主题列表\n{theme_lines}\n\n"
            f"{aggr_note}"
            "## 要求\n"
            f"1. 合并后主题数量要求：{max(3, target // 2)}–{target} 个（严格不得超过 {target} 个）\n"
            "2. 必须强制合并名称相似、主题重叠的簇（如「通胀回落」与「通胀与宏观软化」应合并）\n"
            "3. 每个合并组必须列出所有被合并的原主题（source_themes，与上方完全一致）\n"
            "4. 每个条目需包含 1 个或多个 source_themes（未被合并的主题单独列出）\n\n"
            '## 输出 JSON\n{"merges": [\n'
            '{  "master_theme": "合并后主题名",\n'
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
        _in_total = sum(len(c.signals) for c in clusters)
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

        _out = list(master_map.values())
        _out_total = sum(len(c.signals) for c in _out)
        if _out_total != _in_total:
            logger.error(
                "[SIGNAL AUDIT] _merge_clusters_single_pass(): SIGNAL DROP in→%d out→%d LOST=%d",
                _in_total, _out_total, _in_total - _out_total,
            )
        else:
            logger.info(
                "[SIGNAL AUDIT] _merge_clusters_single_pass(): in=%d out=%d (preserved)",
                _in_total, _out_total,
            )
        return _out

    # ── 聚类辅助方法 ──────────────────────────────────────────────

    def _parse_cluster_result(
        self, result: Dict, signals: List[ProcessedSignal]
    ) -> List[SignalCluster]:
        """将 LLM 聚类结果解析为 SignalCluster 列表"""
        clusters = []
        assigned_indices: set = set()

        for c_data in result.get("clusters", []):
            indices = c_data.get("signal_indices", [])
            # 每条信号只能属于第一个声明它的簇，防止 LLM 将同一索引分配给多个簇
            unique_new = [
                i for i in indices
                if 0 <= i < len(signals) and i not in assigned_indices
            ]
            assigned_indices.update(unique_new)
            cluster_signals = [signals[i] for i in unique_new]

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
        self, signals: List[ProcessedSignal], task_query: str,
        clusters: Optional[List[SignalCluster]] = None,
    ) -> List[ProcessedSignal]:
        """Qi 评分路由：小批量走全量 LLM；大批量走混合（启发式 + LLM 标定）
        clusters 非空时启用簇感知模式：以簇为单位评估每条信号的边际信息量
        """
        if not signals or not self.llm_client:
            return signals
        if len(signals) > self.QI_HEURISTIC_THRESHOLD:
            return await self._compute_qi_hybrid(signals, task_query, clusters=clusters)
        return await self._compute_qi_llm_full(signals, task_query, clusters=clusters)

    async def _compute_qi_llm_full(
        self, signals: List[ProcessedSignal], task_query: str,
        clusters: Optional[List[SignalCluster]] = None,
    ) -> List[ProcessedSignal]:
        """全量 LLM Qi 边际贡献评分（≤ QI_HEURISTIC_THRESHOLD 条信号时使用）
        clusters 非空时：以簇为单位分批，LLM 在簇内视角下评估每条信号的边际信息量
        """
        batch_size = 30
        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_LLM_CALLS)

        # 构建评分批次列表：(batch, cluster_theme_or_None)
        scored_batches: List = []
        if clusters:
            sig_in_clusters: set = set()
            for c in clusters:
                # 簇内按启发式从高到低排序，让 LLM 优先看到高质量信号作为"已有信息"基准
                sigs = sorted(c.signals, key=lambda s: self._heuristic_qi_score(s), reverse=True)
                sig_in_clusters.update(s.signal_id for s in sigs)
                for i in range(0, len(sigs), batch_size):
                    scored_batches.append((sigs[i:i + batch_size], c.theme))
            # 未进入任何簇的孤立信号降级为全局质量评分
            orphan = [s for s in signals if s.signal_id not in sig_in_clusters]
            for i in range(0, len(orphan), batch_size):
                scored_batches.append((orphan[i:i + batch_size], None))
        else:
            for i in range(0, len(signals), batch_size):
                scored_batches.append((signals[i:i + batch_size], None))

        async def _score_batch(
            batch: List[ProcessedSignal], cluster_theme: Optional[str], batch_idx: int
        ) -> None:
            if cluster_theme:
                intro = (
                    f"以下信号均属于因果主题簇「{cluster_theme}」。\n"
                    "请评估每条信号在此簇内的**边际贡献**分数 (0-1)：\n"
                    "- 1.0：独特、不可替代的核心因果证据（与簇内其他信号无重叠）\n"
                    "- 0.7-0.9：提供有价值的补充视角或独立数据来源\n"
                    "- 0.4-0.6：与簇内其他信号存在中度重叠，仍有增量价值\n"
                    "- 0.1-0.3：高度冗余，主要重复簇内已有信息\n"
                    "- 0.0：完全重复或与簇主题无关\n"
                    "> private 私有数据即使内容相似，其独立观测来源也具备更高边际价值\n\n"
                )
            else:
                intro = (
                    "请为以下线索评估信息质量分数 (0-1)。\n"
                    "- 1.0: 罕见、具体、可验证的硬核事实（尤其 private 私有数据）\n"
                    "- 0.7-0.9: 有价值的具体细节，或具备因果推理\n"
                    "- 0.4-0.6: 一般性信息，有一定参考价值\n"
                    "- 0.1-0.3: 泛泛内容或公网重复数据\n"
                    "- 0.0: 重复/无关/幻觉内容\n"
                    "> 注意: private 私有数据的独立观测价值高于 public 公网数据\n\n"
                )
            signal_texts = "\n".join(
                f"[{j}][{'硬核事实' if s.evidence_type == EvidenceType.HARD_FACT else '画像推演'}]"
                f"[{s.data_exclusivity or 'public'}] {s.evidence_text[:200]}"
                + (f"\n    └─因果推理: {s.relevance_reasoning[:80]}" if s.relevance_reasoning else "")
                for j, s in enumerate(batch)
            )
            prompt = (
                f"{intro}"
                f"## 预测问题\n{task_query}\n\n"
                f"## 线索列表\n{signal_texts}\n\n"
                '## 输出 JSON\n{"scores": [0.85, 0.40, ...]}'
            )
            async with semaphore:
                for attempt in range(2):
                    try:
                        result = await asyncio.wait_for(
                            self.llm_client.chat_json(prompt), timeout=30.0
                        )
                        scores = result.get("scores", [])
                        for j, s in enumerate(batch):
                            if j < len(scores):
                                s.quality_score = max(0.0, min(1.0, float(scores[j])))
                        return
                    except asyncio.TimeoutError:
                        logger.warning("Qi 评分超时 (batch %d, attempt %d)", batch_idx, attempt)
                    except Exception as e:
                        logger.warning("Qi 评分失败 (batch %d, attempt %d): %s", batch_idx, attempt, e)
                for s in batch:
                    s.quality_score = self._heuristic_qi_score(s)

        await asyncio.gather(*[
            _score_batch(batch, theme, i)
            for i, (batch, theme) in enumerate(scored_batches)
        ])
        logger.info(
            "Qi 评分完成（%s）: %d 条信号，%d 批（并发=%d）",
            "簇感知LLM" if clusters else "全量LLM",
            len(signals), len(scored_batches), self.MAX_CONCURRENT_LLM_CALLS,
        )
        return signals

    @staticmethod
    def _heuristic_qi_score(s: "ProcessedSignal") -> float:
        """O(1) 启发式 Qi 评分（UAP v3.0），无 LLM 依赖。

        权重设计：
          evidence_type     硬核事实=0.35 / 画像推演=0.08
          data_exclusivity  private=+0.15 / semi_private=+0.05 / public=+0.00
          source_type       本地私有数据来源+0.05
          text_length       ≥10字=+0.15 / ≥50字=+0.08
          relevance_reasoning 非空=+0.05（Agent已做因果推理）
          entity_tags       每个实体+0.04（上限为0.12）
          relevance_score   Agent自评×0.12
          agent_reputation  百分制，贡献上限为0.08
        """
        score = 0.35 if s.evidence_type == EvidenceType.HARD_FACT else 0.08
        excl_bonus = {"private": 0.15, "semi_private": 0.05, "public": 0.0}
        score += excl_bonus.get(s.data_exclusivity, 0.0)
        local_sources = (
            "local_chat", "local_email", "local_document",
            "local_transaction", "local_browsing", "local_memory",
        )
        if s.source_type in local_sources:
            score += 0.05
        length = len(s.evidence_text)
        score += 0.15 if length >= 100 else (0.08 if length >= 50 else 0.0)
        if s.relevance_reasoning:
            score += 0.05
        score += min(0.12, len(s.entity_tags) * 0.04)
        score += s.relevance_score * 0.12
        score += min(0.08, s.agent_reputation / 1250.0)
        # UAP v3: observed_at 新近度加成（越近的观测反映当前状态越准确）
        if s.observed_at:
            try:
                now_ts = datetime.now(timezone.utc)
                dt = datetime.fromisoformat(s.observed_at.replace("Z", "+00:00"))
                days_ago = (now_ts - dt).days
                if days_ago <= 7:
                    score += 0.06
                elif days_ago <= 30:
                    score += 0.04
                elif days_ago <= 90:
                    score += 0.02
            except Exception:
                pass
        return min(1.0, score)

    async def _compute_qi_hybrid(
        self, signals: List[ProcessedSignal], task_query: str,
        clusters: Optional[List[SignalCluster]] = None,
    ) -> List[ProcessedSignal]:
        """大规模混合 Qi 评分（> QI_HEURISTIC_THRESHOLD 条信号时触发）。

        算法：
        1. 全量启发式评分 O(n) — 无 LLM，建立基准分布
        2. 簇感知分层抽样 QI_CALIBRATION_SAMPLE 条（clusters 存在时按簇比例抽取，确保各因果主题有代表）
        3. LLM 标定样本（含 UAP v3 全字段 + 簇主题上下文）
        4. 线性回归拟合 llm_score ≈ a × heuristic + b，校准全量评分
        LLM 调用量固定 O(QI_CALIBRATION_SAMPLE/30) ≈ 7 批，与总量无关
        """
        # Pass 1: 全量启发式评分（O(n)，无 LLM）
        for s in signals:
            s.quality_score = self._heuristic_qi_score(s)

        # Pass 2: 分层抽样
        sample_size = min(self.QI_CALIBRATION_SAMPLE, len(signals))

        if clusters:
            # 簇感知分层：每个簇按信号比例贡献样本，确保各因果主题均有代表
            sample: List[ProcessedSignal] = []
            sampled_ids: set = set()
            for c in sorted(clusters, key=lambda c: len(c.signals), reverse=True):
                quota = max(1, round(sample_size * len(c.signals) / len(signals)))
                for s in sorted(c.signals, key=lambda s: s.quality_score, reverse=True)[:quota]:
                    if s.signal_id not in sampled_ids:
                        sample.append(s)
                        sampled_ids.add(s.signal_id)
            for s in signals:
                if len(sample) >= sample_size:
                    break
                if s.signal_id not in sampled_ids:
                    sample.append(s)
                    sampled_ids.add(s.signal_id)
            sample = sample[:sample_size]
            sig_to_theme: Dict[str, str] = {
                s.signal_id: c.theme for c in clusters for s in c.signals
            }
        else:
            sorted_idx = sorted(range(len(signals)), key=lambda i: signals[i].quality_score)
            step = max(1, len(sorted_idx) // sample_size)
            sample = [signals[sorted_idx[i * step]] for i in range(sample_size)]
            sig_to_theme = {}

        # Pass 3: LLM 标定样本（UAP v3 全字段 + 簇主题上下文）
        batch_size = 30
        batches = [sample[i : i + batch_size] for i in range(0, len(sample), batch_size)]
        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_LLM_CALLS)
        llm_scores: Dict[str, float] = {}

        async def _calibrate_batch(batch: List[ProcessedSignal], batch_idx: int) -> None:
            themes = list({sig_to_theme.get(s.signal_id, "") for s in batch
                           if sig_to_theme.get(s.signal_id)})
            cluster_ctx = (
                f"（涉及因果主题：{', '.join(f'「{t}」' for t in themes[:3])}）"
                if themes else ""
            )
            signal_texts = "\n".join(
                f"[{j}] [{'硬核事实' if s.evidence_type == EvidenceType.HARD_FACT else '画像推演'}]"
                f"[{s.data_exclusivity or 'public'}] {s.evidence_text[:200]}"
                + (f"\n    └─因果推理: {s.relevance_reasoning[:80]}" if s.relevance_reasoning else "")
                for j, s in enumerate(batch)
            )
            prompt = (
                f"请为以下线索评估信息质量分数 (0-1){cluster_ctx}。\n\n"
                f"## 预测问题\n{task_query}\n\n"
                f"## 线索（含数据独占性和因果推理）\n{signal_texts}\n\n"
                "## 评分标准\n"
                "- 1.0: 罕见、具体、可验证的硬核事实（尤其 private 私有数据）\n"
                "- 0.7-0.9: 有价值的具体细节，或具备因果推理\n"
                "- 0.4-0.6: 一般性信息，有一定参考价值\n"
                "- 0.1-0.3: 泛泛内容或公网重复数据\n"
                "- 0.0: 重复/无关/幻觉内容\n\n"
                "> 注意: private 私有数据的独立观测价值高于 public 公网数据\n\n"
                '## 输出 JSON\n{"scores": [0.85, 0.40, ...]}'
            )
            async with semaphore:
                for attempt in range(2):
                    try:
                        result = await asyncio.wait_for(
                            self.llm_client.chat_json(prompt), timeout=30.0
                        )
                        scores = result.get("scores", [])
                        for j, s in enumerate(batch):
                            if j < len(scores):
                                llm_scores[s.signal_id] = max(0.0, min(1.0, float(scores[j])))
                        return
                    except asyncio.TimeoutError:
                        logger.warning("混合Qi标定超时 (batch %d, attempt %d)", batch_idx, attempt)
                    except Exception as e:
                        logger.warning("混合Qi标定失败 (batch %d, attempt %d): %s", batch_idx, attempt, e)

        await asyncio.gather(*[_calibrate_batch(b, i) for i, b in enumerate(batches)])

        # Pass 4: 线性回归校准（最小二乘，O(sample_size)）
        h_vals = [s.quality_score for s in sample if s.signal_id in llm_scores]
        l_vals = [llm_scores[s.signal_id] for s in sample if s.signal_id in llm_scores]
        a, b_coef = 1.0, 0.0
        if len(h_vals) >= 10:
            h_arr = np.array(h_vals)
            l_arr = np.array(l_vals)
            h_mean, l_mean = float(h_arr.mean()), float(l_arr.mean())
            h_var = float(((h_arr - h_mean) ** 2).mean())
            if h_var > 1e-6:
                a = float(((h_arr - h_mean) * (l_arr - l_mean)).mean() / h_var)
                b_coef = l_mean - a * h_mean

        # 应用校准：已有 LLM 分数直接使用，其余用线性映射
        for s in signals:
            if s.signal_id in llm_scores:
                s.quality_score = llm_scores[s.signal_id]
            else:
                s.quality_score = max(0.0, min(1.0, a * s.quality_score + b_coef))

        logger.info(
            "Qi 评分完成（混合%s）: %d 条信号 | 标定样本=%d | LLM批次=%d（并发=%d）"
            " | 线性校准 a=%.3f b=%.3f",
            "簇感知" if clusters else "",
            len(signals), len(h_vals), len(batches), self.MAX_CONCURRENT_LLM_CALLS, a, b_coef,
        )
        return signals

    # ── Step 7: 少数派识别 ────────────────────────────────────────

    def _identify_minority_clusters(
        self, clusters: List[SignalCluster]
    ) -> List[SignalCluster]:
        """识别少数派语义簇 — UAP v3 三维综合评估

        维度1: Qi 平均质量（基础门槛 > 0.3）
        维度2: data_exclusivity 加成（私有数据的少数派独立观测价值更高）
        维度3: cause/indicator 实体独特性（含多数派未覆盖的因果实体则加分）
        综合分 effective_qi > 0.45 才标为有价值的少数派
        """
        if not clusters:
            return []

        sentiment_weights: Dict[str, int] = {}
        for c in clusters:
            s = c.sentiment or "neutral"
            sentiment_weights[s] = sentiment_weights.get(s, 0) + len(c.signals)

        if not sentiment_weights:
            return []

        majority_sentiment = max(sentiment_weights, key=sentiment_weights.get)

        # UAP v3: 汇总多数派簇的 cause/indicator 实体（用于少数派独特性判断）
        majority_cause_entities: set = set()
        for c in clusters:
            if (c.sentiment or "neutral") == majority_sentiment:
                for s in c.signals:
                    for tag in s.entity_tags:
                        if tag.role in ("cause", "indicator"):
                            majority_cause_entities.add(tag.text.lower())

        minorities = []
        for c in clusters:
            if (c.sentiment or "neutral") == majority_sentiment or c.hard_fact_count == 0:
                continue
            avg_qi = self._avg_qi(c)
            if avg_qi <= 0.3:
                continue

            # UAP v3: data_exclusivity 加成（私有/半私有数据的独立观测价值）
            n = max(len(c.signals), 1)
            private_ratio = sum(1 for s in c.signals if s.data_exclusivity == "private") / n
            semi_ratio = sum(1 for s in c.signals if s.data_exclusivity == "semi_private") / n
            exclusivity_bonus = private_ratio * 0.15 + semi_ratio * 0.08

            # UAP v3: cause/indicator 实体独特性（含多数派未覆盖的因果实体则加分）
            cluster_cause_ents = {
                tag.text.lower()
                for s in c.signals
                for tag in s.entity_tags
                if tag.role in ("cause", "indicator")
            }
            unique_cause_bonus = 0.1 if (cluster_cause_ents - majority_cause_entities) else 0.0

            effective_qi = avg_qi + exclusivity_bonus + unique_cause_bonus
            if effective_qi > 0.45:
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
        """UAP v3.0: 聚合画像维度统计，供因果引擎进行人群视角分析"""
        dimensions = [
            "occupation", "age_range", "gender", "region",
            "education", "income_level", "investment_experience",
            "risk_appetite", "consumption_style",
        ]
        global_dist: Dict[str, Dict[str, int]] = {d: {} for d in dimensions}
        interests_tally: Dict[str, int] = {}
        signals_with_persona = 0

        for s in signals:
            if not s.user_persona:
                continue
            signals_with_persona += 1
            for dim in dimensions:
                val = s.user_persona.get(dim)
                if val:
                    global_dist[dim][val] = global_dist[dim].get(val, 0) + 1
            for interest in s.user_persona.get("interests", []) or []:
                interests_tally[interest] = interests_tally.get(interest, 0) + 1

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
            cluster.persona_distribution = {
                d: dist for d, dist in cluster_dist.items() if dist
            }

        top_interests = sorted(interests_tally.items(), key=lambda x: x[1], reverse=True)[:10]
        return {
            "signals_with_persona": signals_with_persona,
            "total_signals": len(signals),
            "coverage_rate": round(signals_with_persona / max(len(signals), 1), 2),
            "dimensions": {d: dist for d, dist in global_dist.items() if dist},
            "top_interests": dict(top_interests),
        }

    # ── Step 8.6: 因果实体种子提取 ────────────────────────────────

    @staticmethod
    def _extract_cause_entity_seeds(entity_index: Dict) -> List[Dict]:
        """UAP v3: 从实体索引中提取 role=cause 的高频实体作为 Phase 2 因子命名种子。
        Agent 已标注为 cause 的实体是最直接的因果驱动力候选，优先作为因子名称。
        indicator 观测指标实体也包含在内，使用权重递减。
        """
        seeds: List[Dict] = []
        for entry in entity_index.values():
            role = entry.get("role", "")
            if role in ("cause", "indicator"):
                seeds.append({
                    "text": entry["text"],
                    "type": entry.get("type", ""),
                    "role": role,
                    "frequency": entry["frequency"],
                    "independent_agent_count": entry.get("independent_agent_count", 1),
                })
        # 按独立 Agent 数 × 频次排序，返回 Top 20
        seeds.sort(
            key=lambda x: x["independent_agent_count"] * 2 + x["frequency"],
            reverse=True,
        )
        return seeds[:20]

    # ── Step 9: 汇总 ────────────────────────────────────────────

    @staticmethod
    def _build_result(
        task_id: str,
        signals: List[ProcessedSignal],
        clusters: List[SignalCluster],
        minority_clusters: List[SignalCluster],
        entity_index: Dict,
        persona_summary: Optional[Dict] = None,
        cluster_relations: Optional[List[ClusterRelation]] = None,
        cause_entity_seeds: Optional[List[Dict]] = None,
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
            cause_entity_seeds=cause_entity_seeds or [],
        )
