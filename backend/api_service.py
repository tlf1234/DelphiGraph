"""
DelphiGraph 统一 API 服务入口

FastAPI 应用，提供：
1. 因果分析路由（/api/causal-analysis/*）
2. 智能调查路由（/api/surveys/*）
3. 因果分析触发由 Edge Function submit-signal 直接 HTTP 调用（无轮询）

启动方式：
    python -m api_service
    或
    uvicorn api_service:app --host 0.0.0.0 --port 8100
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from causal_engine.llm_client import QwenLLMClient
from causal_engine.orchestrator import CausalEngineOrchestrator
from causal_engine.supabase_client import SupabaseManager
from survey_engine import survey_router
from survey_engine.survey_supabase import SurveySupabaseClient

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

# ── 全局状态 ──────────────────────────────────────────────────────────
_supabase: Optional[SupabaseManager] = None
_llm_client: Optional[QwenLLMClient] = None

MIN_SIGNALS_FOR_ANALYSIS = int(os.getenv("CAUSAL_MIN_SIGNALS", "5"))
MIN_SIGNALS_FOR_FINAL = int(os.getenv("CAUSAL_MIN_SIGNALS_FINAL", "20"))


# ══════════════════════════════════════════════════════════════════════
# 核心业务逻辑（辅助函数）
# ══════════════════════════════════════════════════════════════════════

async def run_analysis_for_task(
    task_id: str,
    triggered_by: str = "auto",
    force_final: bool = False,
):
    """对单个任务执行因果分析
    
    这是整个因果推理引擎的核心入口函数，负责：
    1. 从数据库获取任务信息和信号提交数据
    2. 调用因果引擎编排器执行分析
    3. 生成未来报纸
    4. 保存结果到数据库
    
    参数:
        task_id: 任务 ID
        triggered_by: 触发方式 ("auto" 后台轮询 | "manual" 手动触发)
        force_final: 是否强制最终分析（忽略提交数量判断）
    
    流程:
        Step 1: 检查任务是否存在
        Step 2: 防止重复分析（检查 processing 状态）
        Step 3: 获取信号提交数据并验证数量
        Step 4: 判断分析类型（增量 vs 最终）
        Step 5: 调用因果引擎执行分析
        Step 6: 生成未来报纸
        Step 7: 保存结果到数据库
    """
    global _supabase, _llm_client

    task = _supabase.get_task(task_id)
    if not task:
        logger.warning("Task %s not found, skipping", task_id)
        return

    current_status = task.get("causal_analysis_status")
    if current_status == "processing":
        # Stale lock detection: if stuck in processing for >10 min, reset and re-run
        STALE_LOCK_MINUTES = 10
        updated_at_str = task.get("updated_at")
        is_stale = False
        if updated_at_str:
            try:
                updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                age_minutes = (datetime.now(timezone.utc) - updated_at).total_seconds() / 60
                if age_minutes > STALE_LOCK_MINUTES:
                    is_stale = True
                    logger.warning(
                        "Task %s has been in 'processing' for %.1f min (>%d min threshold) — resetting stale lock",
                        task_id, age_minutes, STALE_LOCK_MINUTES,
                    )
            except Exception:
                pass
        if not is_stale:
            logger.info(
                "Task %s is already being processed, skipping duplicate analysis",
                task_id
            )
            return

    _supabase.update_task_analysis_status(task_id, "processing")

    # ── 等待信号提交稳定（防止分析在提交未完成时就开始）──
    STABILIZE_INTERVAL = 3       # 每次检查间隔（秒）
    STABILIZE_MAX_WAIT = 30      # 最大等待时间（秒）
    prev_count = _supabase.get_signal_submission_count(task_id)
    waited = 0
    while waited < STABILIZE_MAX_WAIT:
        await asyncio.sleep(STABILIZE_INTERVAL)
        waited += STABILIZE_INTERVAL
        cur_count = _supabase.get_signal_submission_count(task_id)
        if cur_count == prev_count:
            break  # 数量不再增长，提交已稳定
        logger.info(
            "⏳ 信号提交仍在进行: %d → %d（+%d），等待稳定... (%ds/%ds)",
            prev_count, cur_count, cur_count - prev_count,
            waited, STABILIZE_MAX_WAIT,
        )
        prev_count = cur_count
    logger.info(
        "📊 信号提交已稳定: %d 条 (等待 %ds)", prev_count, waited,
    )

    submissions = _supabase.get_signal_submissions_for_task(task_id)
    sub_count = len(submissions)

    if sub_count < MIN_SIGNALS_FOR_ANALYSIS:
        logger.info(
            "Task %s has only %d submissions (need %d), skipping",
            task_id, sub_count, MIN_SIGNALS_FOR_ANALYSIS,
        )
        _supabase.update_task_analysis_status(task_id, "pending")
        return

    is_final = force_final or (
        task.get("status") == "closed"
        or sub_count >= MIN_SIGNALS_FOR_FINAL
    )

    logger.info(
        "\n" + "═" * 60 + "\n"
        "  ▶ 因果分析流水线启动\n"
        "  task_id    : %s\n"
        "  task_title : %s\n"
        "  触发方式   : %s\n"
        "  分析类型   : %s\n"
        "  信号提交数 : %d (最低要求 %d / 最终分析 %d)\n"
        + "═" * 60,
        task_id,
        task.get("title", ""),
        triggered_by,
        "FINAL(最终)" if is_final else "incremental(增量)",
        sub_count, MIN_SIGNALS_FOR_ANALYSIS, MIN_SIGNALS_FOR_FINAL,
    )

    try:
        formatted_submissions = _format_signal_submissions(submissions)
        total_signals_in_formatted = sum(len(s.get("signals") or []) for s in formatted_submissions)
        logger.info(
            "[PIPELINE] 格式化提交: %d 条提交 → %d 条信号 (平均 %.1f 条/提交)",
            len(formatted_submissions), total_signals_in_formatted,
            total_signals_in_formatted / max(len(formatted_submissions), 1),
        )

        async with CausalEngineOrchestrator(llm_client=_llm_client) as engine:
            engine.MIN_SIGNALS = MIN_SIGNALS_FOR_ANALYSIS
            result = await engine.analyze(
                task_id=task_id,
                task_title=task.get("title", ""),
                submissions=formatted_submissions,
                task_description=task.get("description", ""),
            )

        if result["status"] == "completed":
            _graph = result.get("graph", {})
            _nodes = _graph.get("nodes", [])
            _edges = _graph.get("edges", [])
            _by_type = {}
            for n in _nodes:
                t = n.get("node_type", "unknown")
                _by_type[t] = _by_type.get(t, 0) + 1
            _conclusion = result.get("conclusion", {})
            logger.info(
                "\n" + "─" * 60 + "\n"
                "  ✅ 因果引擎分析完成\n"
                "  方向       : %s   置信度: %.0f%%  (区间 %.0f%%–%.0f%%)\n"
                "  图谱节点   : %d 总计 %s\n"
                "  图谱边     : %d 条\n"
                "  关键路径   : %d 条\n"
                "  耗时       : %.1fs\n"
                + "─" * 60,
                _conclusion.get("direction", "?"),
                _conclusion.get("confidence", 0) * 100,
                _conclusion.get("confidence_interval", {}).get("low", 0) * 100,
                _conclusion.get("confidence_interval", {}).get("high", 0) * 100,
                len(_nodes),
                "  ".join(f"{k}×{v}" for k, v in sorted(_by_type.items())),
                len(_edges),
                len(_conclusion.get("critical_paths", [])),
                result.get("meta", {}).get("elapsed_seconds", 0),
            )

            if not result.get("newspaper"):
                logger.info("[PIPELINE] 开始生成未来报纸（基于完整因果推演结果）...")
                _t_news = time.time()
                newspaper = await _generate_newspaper(task, result)
                _news_elapsed = round(time.time() - _t_news, 2)
                result["newspaper"] = newspaper

                # 注入 conflicts 摘要文本（前端侧边栏显示；_conflict_resolutions 只在 LLM prompt 用）
                _conclusion_ref = result.get("conclusion", {})
                _resolutions = _conclusion_ref.get("_conflict_resolutions", [])
                if _resolutions and not _conclusion_ref.get("conflicts"):
                    _conflict_parts = [
                        f"{r.get('node_name','?')}主导{r.get('resolved_direction','?')}：{r.get('reasoning','')}"
                        for r in _resolutions[:3]
                    ]
                    _conclusion_ref["conflicts"] = "；".join(_conflict_parts)
                # 暴露 sensitivity_scores（去私有前缀，供前端因果链侧边栏使用）
                if "_sensitivity_scores" in _conclusion_ref:
                    _conclusion_ref["sensitivity_scores"] = _conclusion_ref["_sensitivity_scores"]

                logger.info(
                    "[PIPELINE] 未来报纸生成完成 (%.2fs)  字数≈%d  预览: %s",
                    _news_elapsed, len(newspaper),
                    newspaper[:80].replace("\n", " ") + "…",
                )

            _sig_count = result.get("preprocess_summary", {}).get("total_signals", 0)
            logger.info(
                "[PIPELINE] 保存分析结果 → task=%s  is_final=%s  signals=%d  nodes=%d  edges=%d",
                task_id, is_final, _sig_count, len(_nodes), len(_edges),
            )
            _supabase.save_causal_analysis(
                task_id=task_id,
                result=result,
                is_final=is_final,
                triggered_by=triggered_by,
            )
            _supabase.update_task_analysis_status(
                task_id, "completed", submission_count=sub_count,
            )
            logger.info(
                "\n" + "═" * 60 + "\n"
                "  ✅ 因果分析全流程完成  task=%s\n"
                "  信号: %d  | 节点: %d  | 边: %d  | is_final: %s\n"
                "  方向: %s  置信度: %.0f%%  | 触发: %s\n"
                + "═" * 60,
                task_id, _sig_count, len(_nodes), len(_edges), is_final,
                _conclusion.get("direction", "?"),
                _conclusion.get("confidence", 0) * 100,
                triggered_by,
            )
        else:
            error_result = {
                "status": "error",
                "error": result.get("message", "Analysis incomplete"),
                "preprocess_summary": {"total_signals": sub_count},
            }
            _saved = _supabase.save_causal_analysis(
                task_id=task_id,
                result=error_result,
                is_final=False,
                triggered_by=triggered_by,
            )
            _err_ver = _saved.get("version", 1) if _saved else 1
            if _err_ver >= 2:
                _supabase.update_task_analysis_status(task_id, "completed")
                logger.warning(
                    "Task %s 连续失败 %d 次，停止自动重试。"
                    "请从前端点击 '开始模拟' 以全新姿态重新运行。",
                    task_id, _err_ver,
                )
            else:
                _supabase.update_task_analysis_status(task_id, "pending")
                logger.info("Task %s 首次失败，允许1次自动重试 (v%d)", task_id, _err_ver)

    except Exception as e:
        logger.error("Analysis failed for task %s: %s", task_id, e, exc_info=True)
        error_result = {
            "status": "error",
            "error": str(e),
            "preprocess_summary": {"total_signals": sub_count},
        }
        _err_ver = 1
        try:
            _saved = _supabase.save_causal_analysis(
                task_id=task_id,
                result=error_result,
                is_final=False,
                triggered_by=triggered_by,
            )
            _err_ver = (_saved.get("version", 1) if _saved else 1)
        except Exception as _save_err:
            logger.error(
                "Failed to save error result for task %s (will still reset status): %s",
                task_id, _save_err,
            )
        try:
            if _err_ver >= 2:
                _supabase.update_task_analysis_status(task_id, "completed")
                logger.warning(
                    "Task %s 连续失败 %d 次，停止自动重试。"
                    "请从前端点击 '开始模拟' 以全新姿态重新运行。",
                    task_id, _err_ver,
                )
            else:
                _supabase.update_task_analysis_status(task_id, "pending")
                logger.info("Task %s 首次失败，允许1次自动重试 (v%d)", task_id, _err_ver)
        except Exception as _upd_err:
            logger.error(
                "CRITICAL: Failed to reset task %s status — task will remain stuck: %s",
                task_id, _upd_err,
            )


def _format_signal_submissions(raw_submissions: list) -> list:
    """将 signal_submissions 行直接传递给因果引擎

    v3.0 signal_submissions 已包含 signals JSONB 数组，
    仅需补充 agent_id 别名。
    """
    formatted = []
    for s in raw_submissions:
        entry = {
            "submission_id": s.get("id", "unknown"),
            "task_id": s["task_id"],
            "agent_id": s["user_id"],
            "submitted_at": s.get("submitted_at", ""),
            "user_persona": s.get("user_persona"),
            "signals": s.get("signals") or [],
        }
        formatted.append(entry)
    return formatted


async def _generate_newspaper(
    task: Dict[str, Any],
    analysis_result: Dict[str, Any],
) -> str:
    """基于因果图谱结果生成增强版未来报纸"""
    global _llm_client

    conclusion = analysis_result.get("conclusion", {})
    graph = analysis_result.get("graph", {})
    ontology = analysis_result.get("ontology", {})
    preprocess = analysis_result.get("preprocess_summary", {})

    nodes = [n for n in graph.get("nodes", [])
             if n.get("node_type", "factor") in ("factor", "target")]
    edges = [e for e in graph.get("edges", [])
             if e.get("edge_type", "factor_factor") in ("factor_factor", "factor_target")]

    direction_raw = conclusion.get("direction", "neutral")
    _fallback_cn = {"bullish": "看涨", "bearish": "看跌", "neutral": "中性"}.get(
        direction_raw, direction_raw
    )
    direction_cn = conclusion.get("direction_label") or _fallback_cn
    confidence = conclusion.get("confidence", 0.5)
    ci = conclusion.get("confidence_interval", {})
    ci_low = ci.get("low", max(0.0, confidence - 0.15))
    ci_high = ci.get("high", min(1.0, confidence + 0.10))

    # ── 因子详表（含方向、影响力、证据质量） ──
    sorted_nodes = sorted(nodes, key=lambda x: x.get("impact_score", 0), reverse=True)
    factor_rows = []
    for n in sorted_nodes:
        if n.get("is_analysis_target") or n.get("node_type") == "target":
            continue
        ev_dir = n.get("evidence_direction", "neutral")
        dir_sym = "↑看涨" if ev_dir == "bullish" else "↓看跌" if ev_dir == "bearish" else "→中性"
        minority_tag = "⚠️是" if n.get("is_minority") else "否"
        factor_rows.append(
            f"| {n.get('name', '?')} | {n.get('category', '?')} | {dir_sym} "
            f"| {n.get('impact_score', 0):.2f} | {n.get('confidence', 0):.0%} "
            f"| {n.get('hard_fact_count', 0)}/{n.get('persona_count', 0)} | {minority_tag} |"
        )
    factor_table = (
        "\n| 因子名称 | 类别 | 方向 | 影响力 | 置信度 | 硬核/画像 | 少数派 |\n"
        "|----------|------|------|--------|--------|-----------|--------|\n"
        + "\n".join(factor_rows)
    ) if factor_rows else "\n（无因子数据）"

    # ── 关键因果路径（带边方向） ──
    critical_paths = conclusion.get("critical_paths", [])
    edge_dir_map: Dict[str, str] = {}
    for e in edges:
        key = f"{e.get('source_name','')}→{e.get('target_name','')}"
        sym = "促进" if e.get("direction") == "positive" else "抑制"
        edge_dir_map[key] = f"[{sym} w={e.get('weight', 0):.2f}]"

    if critical_paths:
        path_lines = []
        for i, p in enumerate(critical_paths[:5], 1):
            segments = []
            for j in range(len(p) - 1):
                ann = edge_dir_map.get(f"{p[j]}→{p[j+1]}", "")
                segments.append(f"{p[j]} {ann}→" if ann else f"{p[j]} →")
            segments.append(p[-1])
            path_lines.append(f"路径{i}: {''.join(segments)}")
        paths_text = "\n".join(path_lines)
    else:
        edge_chains = [
            f"{e.get('source_name', '?')} "
            f"{'→促进' if e.get('direction') == 'positive' else '⊣抑制'} "
            f"{e.get('target_name', '?')} [权重{e.get('weight', 0):.2f}]"
            for e in edges[:5]
        ]
        paths_text = "\n".join(edge_chains) if edge_chains else "（无路径数据）"

    # ── 本体因果机制（WHY：source→target 的关系类型与强度） ──
    raw_relations = ontology.get("raw_causal_relations", [])
    _rel_sym = {"DRIVES": "→驱动", "INHIBITS": "⊣抑制", "CORRELATES_WITH": "～相关",
                "AMPLIFIES": "→放大", "DAMPENS": "⊣衰减"}
    relation_lines = []
    for r in raw_relations[:15]:
        sym = _rel_sym.get(r.get("relation_type", ""), f"→{r.get('relation_type','')}")
        strength = r.get("strength", "moderate")
        ev_n = r.get("evidence_count", 0)
        mech = r.get("mechanism") or r.get("description") or ""
        line = (f"- {r.get('source_factor','?')} {sym} {r.get('target_factor','?')}"
                f"（强度={strength}, 证据={ev_n}条）")
        if mech:
            line += f"\n  机制: {mech}"
        relation_lines.append(line)
    causal_mechanism_text = "\n".join(relation_lines) if relation_lines else "（无）"

    # ── 敏感性排名（量化哪些因子最关键） ──
    sensitivity_scores: Dict[str, float] = conclusion.get("_sensitivity_scores", {})
    if sensitivity_scores:
        top_sensitivity = sorted(sensitivity_scores.items(), key=lambda x: x[1], reverse=True)[:8]
        sensitivity_text = "\n".join(
            f"- {name}：{score:.4f}" for name, score in top_sensitivity
        )
    else:
        sensitivity_text = "（未计算）"

    # ── 冲突消解（信号间矛盾如何裁定） ──
    conflict_resolutions = conclusion.get("_conflict_resolutions", [])
    if conflict_resolutions:
        conflict_lines = []
        for r in conflict_resolutions:
            conflict_lines.append(
                f"- {r.get('node_name','?')}：主导方向={r.get('resolved_direction','?')}，"
                f"置信惩罚={r.get('confidence_penalty', 0):.2f} | {r.get('reasoning','')}"
            )
        conflict_text = "\n".join(conflict_lines)
    else:
        conflict_text = "（本次推演无信号冲突）"

    # ── 证据基底（聚类主题 + 信号质量统计） ──
    clusters = preprocess.get("clusters", [])
    minority_ids = {c.get("cluster_id") for c in preprocess.get("minority_clusters", [])}
    total_signals = preprocess.get("total_signals", 0)
    hard_fact_count = preprocess.get("hard_fact_count", 0)
    persona_count = preprocess.get("persona_count", 0)
    hard_ratio = hard_fact_count / max(1, total_signals)

    cluster_lines = []
    for c in sorted(clusters, key=lambda x: x.get("signal_count", 0), reverse=True)[:10]:
        sig_n = c.get("signal_count", 0)
        sent = c.get("sentiment", "neutral")
        sent_sym = "↑" if sent == "positive" else "↓" if sent == "negative" else "→"
        hf = c.get("hard_fact_count", 0)
        minority_tag = "⚠️少数派" if c.get("cluster_id") in minority_ids else ""
        cluster_lines.append(
            f"- 「{c.get('theme','?')}」{sent_sym}{sent} {sig_n}条信号 硬核={hf} {minority_tag}"
        )
    cluster_text = "\n".join(cluster_lines) if cluster_lines else "（无聚类数据）"

    one_line = conclusion.get("one_line_conclusion", "")
    key_drivers = conclusion.get("key_drivers", [])
    risk_factors = conclusion.get("risk_factors", [])
    minority_assessment = conclusion.get("minority_assessment", "")
    persona_insight = conclusion.get("persona_insight", "")
    minority_warning = conclusion.get("minority_warning") or ""
    counterfactual = conclusion.get("counterfactual", "")
    time_horizon = conclusion.get("time_horizon", "")
    inflection_point = conclusion.get("inflection_point", "")
    second_order_effects = conclusion.get("second_order_effects", [])
    uncertainty_source = conclusion.get("uncertainty_source", "")

    key_drivers_text = "\n".join(f"- {d}" for d in key_drivers) if key_drivers else "（未提取）"
    risk_text = "\n".join(f"- {r}" for r in risk_factors) if risk_factors else "（未提取）"
    second_order_text = "\n".join(f"- {e}" for e in second_order_effects) if second_order_effects else "（未提取）"
    task_question = task.get("question", task.get("title", ""))
    task_desc = task.get("description", "无")

    _today = datetime.now()
    _today_str = _today.strftime("%Y年%m月%d日")
    _future_date_str = (_today + timedelta(days=180)).strftime("%Y年%m月%d日")

    prompt = f"""## 素材（因果推演引擎已生成，禁止篡改数值）

**预测问题**：{task_question}
**背景**：{task_desc}
**裁定方向**：{direction_cn}（{direction_raw}）
**置信度**：{confidence:.0%}（区间 {ci_low:.0%}–{ci_high:.0%}）
**当前实际日期**：{_today_str}（真实今日，报纸发行日期必须晚于此日期）
**建议报纸日期**：根据时间窗口推算，约为 {_future_date_str} 前后（请结合时间窗口信息灵活调整）
**时间窗口**：{time_horizon or '（引擎未输出）'}
**一句话裁定**：{one_line or '（引擎未输出）'}

**驱动力**：
{key_drivers_text}

**因子详表**（必须原样嵌入正文"因果图谱摘要"框）：
{factor_table}

**关键因果路径**（含边方向与权重）：
{paths_text}

**因果机制**（各因子间 WHY 的关系类型与强度）：
{causal_mechanism_text}

**敏感性排名**（量化影响力，分数越高越关键）：
{sensitivity_text}

**信号冲突与消解**：
{conflict_text}

**证据基底**（{total_signals}条信号 | 硬核事实={hard_fact_count}条({hard_ratio:.0%}) | 画像推演={persona_count}条）：
{cluster_text}

**风险**：
{risk_text}

**反事实推断**（Pearl因果阶梯第三级）：
{counterfactual or '（引擎未输出）'}

**决定性拐点**（因果链锁定条件）：
{inflection_point or '（引擎未输出）'}

**二阶效应**（该结论实现后的级联后果）：
{second_order_text}

**不确定性来源**：{uncertainty_source or '（未分类）'}

**少数派评估**：{minority_assessment or '无'}
{('少数派警告：' + minority_warning) if minority_warning else ''}

**人群画像洞察**：{persona_insight or '无'}

---

## 写作任务

你正在为《德尔菲未来报》撰写一篇头版深度报道。

**关键前提：你站在未来，这件事已经发生。** 不要写"可能"、"预计"、"或许"——用新闻事实的语气描述它，就像《纽约时报》报道昨天发生的事一样。数据是你的信源，不是你的主角；观点是你的灵魂，不是可选项。

**铁律**：
1. 第一段（导言）必须像真正的新闻导言：一句话说清楚"什么事、已经怎样了、为什么重要"，字数不超过80字，没有废话
2. 正文要有观点、有判断、有温度——读者要感受到记者的立场，不是读一份财务分析
3. 因子详表必须原样嵌入，但要用"本报梳理的因果图谱显示……"等新闻句式引出，不是孤零零甩出来
4. 少数派部分必须旗帜鲜明表态：是真实威胁还是噪音，给出理由，不得模糊
5. 结尾社论必须包含：这件事对读者的行动意义 + 本报对后续级联效应的判断
6. 字数4000–4500字，分节用 `§` 符号，节名简洁有力（像真实报纸版块标题）
7. 禁止出现"本报告"、"分析报告"、"数据显示"——你是记者，不是分析师
8. §决定性拐点 必须说清楚：是什么条件让结果锁定了，以及什么条件能逆转它（哪怕已经不可能）
9. §后续涟漪 必须写出至少3个二阶效应，用新闻叙事语气，不是列举
10. **报纸发行日期必须明确晚于当前实际日期 {_today_str}**；§标题或§导言中必须出现具体的未来日期（建议使用 {_future_date_str} 附近，可结合时间窗口灵活调整），严禁出现今日或过去的日期——这是一份来自未来的报纸，日期是读者感受"未来感"的第一信号

---

## 报纸结构（严格按此顺序）

**§ 标题**
不超过25字的陈述句——已经发生的事，不是问句，不是预测。要有冲击力。

**§ 导言**
倒金字塔第一段，80字以内，5W1H，新闻事实语气。在此段末尾自然嵌入时间窗口。

**§ 正文**
3–4段叙事性分析。**第一段必须从敏感性排名第1位的因子出发**，按关键路径1逐节点追溯到目标，每一跳明确说明因果关系类型（促进/抑制/放大）与边权重数值；第二段分析敏感性第2、3位因子如何与第一因子相互强化或对冲，引用具体数字；第三段至少一处引用"参与这一分析的[人群背景]分析师群体"的集体判断（来自画像洞察）。写出为什么这个结果让人震惊/不让人震惊。

**§ 因果图谱摘要**
用一句引导语引出，然后原样嵌入因子详表。之后用2–3句话点出最关键的1–2个因子和它们如何相互强化（结合因果机制中的关系类型说明）。

**§ 决定性拐点**
用叙事笔法描述：那个让结果不可逆的时刻是什么？哪个因子越过了哪条红线？反事实：如果当时那个关键因子缺席，今天的故事会怎么写？必须具体，不得泛泛。

**§ 少数派声音**
明确表态：少数派信号是警报还是杂音？为什么？即使是少数声音，它指向的是哪个真实风险？不得和稀泥。

**§ 后续涟漪**
这件事发生了，然后呢？用叙事语气写出至少3个可预见的二阶效应，解释每个效应的因果机制，以及它们对哪类读者构成威胁或机会。

**§ 社论**
本报立场，3–5句，鲜明、有力、可引用。告诉读者这件事对他们意味着什么，结合不确定性来源点出剩余风险，下一步应该关注什么。

请直接开始撰写，从标题起，不要输出任何前言："""

    try:
        newspaper = await _llm_client.chat(
            user_prompt=prompt,
            system_prompt=(
                "你是《德尔菲未来报》首席记者，你的报道来自未来——你站在预测事件已经发生的时间点，"
                "用真实新闻笔法记录这一切。你不是分析师，你是目击者和评论者。"
                "你的文章有立场、有温度、有判断力，数据是你的信源，观点是你的灵魂。"
                "你的读者是需要做出真实决策的人，他们付费阅读这份报纸，是因为你能告诉他们"
                "别人不敢说的真相，而不是把数据重新排列一遍。"
                "写作时：用陈述句报道已发生的事；用强势动词；给出明确判断；让少数派观点有尊严但有定论。"
            ),
            temperature=0.85,
            max_tokens=6000,
        )
        return newspaper
    except Exception as e:
        logger.error("Newspaper generation failed: %s", e)
        return f"[报告生成失败: {e}]"


# ══════════════════════════════════════════════════════════════════════
# FastAPI 应用
# ══════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global _supabase, _llm_client

    logger.info("Starting DelphiGraph API Service...")

    _supabase = SupabaseManager()
    _llm_client = QwenLLMClient()

    _survey_db = SurveySupabaseClient(
        url=os.environ["SUPABASE_URL"],
        service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    survey_router.init(db=_survey_db, llm_client=_llm_client)
    logger.info("Survey router initialized")

    # 启动恢复：处理尚未完成的 pending 任务（防止服务中断期间触发丢失）
    try:
        pending = _supabase.get_pending_tasks()
        if pending:
            logger.info("Startup recovery: found %d pending task(s), scheduling...", len(pending))
            for task in pending:
                asyncio.create_task(run_analysis_for_task(task_id=task["id"], triggered_by="startup_recovery"))
    except Exception as e:
        logger.warning("Startup recovery scan failed (non-fatal): %s", e)

    yield

    logger.info("DelphiGraph API Service stopped")


app = FastAPI(
    title="DelphiGraph API",
    description="因果推理引擎 + 智能调查服务",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 挂载路由 ──────────────────────────────────────────────────────────
app.include_router(survey_router.router)


# ── 请求/响应模型 ────────────────────────────────────────────────────
class TriggerAnalysisRequest(BaseModel):
    task_id: str
    force_final: bool = False


class AnalysisStatusResponse(BaseModel):
    task_id: str
    status: str
    version: Optional[int] = None
    signal_count: Optional[int] = None
    is_final: Optional[bool] = None
    created_at: Optional[str] = None


# ── 健康检查 ──────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "delphi-graph"}


# ── 因果分析触发 ──────────────────────────────────────────────────────
@app.post("/api/causal-analysis/trigger")
async def trigger_analysis(
    req: TriggerAnalysisRequest,
    background_tasks: BackgroundTasks,
):
    task = _supabase.get_task(req.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    sub_count = _supabase.get_signal_submission_count(req.task_id)
    if sub_count < MIN_SIGNALS_FOR_ANALYSIS:
        raise HTTPException(
            status_code=400,
            detail=f"线索不足（当前 {sub_count} 条，需要至少 {MIN_SIGNALS_FOR_ANALYSIS} 条）",
        )

    background_tasks.add_task(
        run_analysis_for_task,
        task_id=req.task_id,
        triggered_by="manual",
        force_final=req.force_final,
    )

    return {
        "message": "分析任务已提交",
        "task_id": req.task_id,
        "submission_count": sub_count,
        "force_final": req.force_final,
    }


# ── 获取分析结果 ──────────────────────────────────────────────────────
@app.get("/api/causal-analysis/{task_id}")
async def get_analysis(task_id: str):
    result = _supabase.get_latest_analysis(task_id)
    if not result:
        raise HTTPException(status_code=404, detail="该任务暂无因果分析结果")
    return result


@app.get("/api/causal-analysis/{task_id}/graph")
async def get_graph(task_id: str):
    result = _supabase.get_latest_analysis(task_id)
    if not result or not result.get("graph_data"):
        raise HTTPException(status_code=404, detail="该任务暂无因果图谱")
    return {
        "task_id": task_id,
        "graph": result["graph_data"],
        "conclusion": result.get("conclusion"),
        "version": result.get("version"),
        "is_final": result.get("is_final"),
        "updated_at": result.get("updated_at"),
    }


@app.get("/api/causal-analysis/{task_id}/newspaper")
async def get_newspaper(task_id: str):
    result = _supabase.get_latest_analysis(task_id)
    if not result or not result.get("newspaper_content"):
        raise HTTPException(status_code=404, detail="该任务暂无未来报纸")
    return {
        "task_id": task_id,
        "newspaper": result["newspaper_content"],
        "conclusion": result.get("conclusion"),
        "version": result.get("version"),
        "is_final": result.get("is_final"),
    }


@app.get("/api/causal-analysis/{task_id}/history")
async def get_analysis_history(task_id: str, limit: int = 20):
    history = _supabase.get_analysis_history(task_id, limit=limit)
    return {"task_id": task_id, "history": history}


# ── 入口 ─────────────────────────────────────────────────────────────
def main():
    import uvicorn
    try:
        from dotenv import load_dotenv
        load_dotenv()
        logger.info("Loaded .env file")
    except ImportError:
        pass

    port = int(os.getenv("CAUSAL_ENGINE_PORT", "8100"))
    uvicorn.run(
        "api_service:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("CAUSAL_ENGINE_RELOAD", "false").lower() == "true",
    )


if __name__ == "__main__":
    main()
