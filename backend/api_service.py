"""
DelphiGraph 统一 API 服务入口

FastAPI 应用，提供：
1. 因果分析路由（/api/causal-analysis/*）
2. 智能调查路由（/api/surveys/*）
3. 后台轮询任务（自动检测待分析市场并执行）

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
_polling_task: Optional[asyncio.Task] = None

POLL_INTERVAL = int(os.getenv("CAUSAL_POLL_INTERVAL", "30"))
MIN_SIGNALS_FOR_ANALYSIS = int(os.getenv("CAUSAL_MIN_SIGNALS", "5"))
MIN_SIGNALS_FOR_FINAL = int(os.getenv("CAUSAL_MIN_SIGNALS_FINAL", "20"))


# ══════════════════════════════════════════════════════════════════════
# 核心业务逻辑（辅助函数）
# ══════════════════════════════════════════════════════════════════════

async def run_analysis_for_market(
    task_id: str,
    triggered_by: str = "auto",
    force_final: bool = False,
):
    """对单个市场执行因果分析
    
    这是整个因果推理引擎的核心入口函数，负责：
    1. 从数据库获取市场信息和预测数据
    2. 调用因果引擎编排器执行分析
    3. 生成未来报纸
    4. 保存结果到数据库
    
    参数:
        task_id: 市场/任务 ID
        triggered_by: 触发方式 ("auto" 后台轮询 | "manual" 手动触发)
        force_final: 是否强制最终分析（忽略预测数量判断）
    
    流程:
        Step 1: 检查市场是否存在
        Step 2: 防止重复分析（检查 processing 状态）
        Step 3: 获取预测数据并验证数量
        Step 4: 判断分析类型（增量 vs 最终）
        Step 5: 调用因果引擎执行分析
        Step 6: 生成未来报纸
        Step 7: 保存结果到数据库
    """
    global _supabase, _llm_client

    market = _supabase.get_market(task_id)
    if not market:
        logger.warning("Market %s not found, skipping", task_id)
        return

    current_status = market.get("causal_analysis_status")
    if current_status == "processing":
        logger.info(
            "Market %s is already being processed, skipping duplicate analysis",
            task_id
        )
        return

    _supabase.update_market_analysis_status(task_id, "processing")

    predictions = _supabase.get_predictions_for_market(task_id)
    pred_count = len(predictions)

    if pred_count < MIN_SIGNALS_FOR_ANALYSIS:
        logger.info(
            "Market %s has only %d predictions (need %d), skipping",
            task_id, pred_count, MIN_SIGNALS_FOR_ANALYSIS,
        )
        _supabase.update_market_analysis_status(task_id, "pending")
        return

    is_final = force_final or (
        market.get("status") == "closed"
        or pred_count >= MIN_SIGNALS_FOR_FINAL
    )

    logger.info(
        "Running %s analysis for market %s (%d predictions)",
        "FINAL" if is_final else "incremental",
        task_id,
        pred_count,
    )

    try:
        formatted_predictions = _format_predictions(predictions)

        async with CausalEngineOrchestrator(llm_client=_llm_client) as engine:
            engine.MIN_SIGNALS = MIN_SIGNALS_FOR_ANALYSIS
            result = await engine.analyze(
                task_id=task_id,
                market_title=market.get("title", ""),
                predictions=formatted_predictions,
                market_description=market.get("description", ""),
            )

        if result["status"] == "completed":
            if not result.get("newspaper"):
                newspaper = await _generate_newspaper(market, result)
                result["newspaper"] = newspaper

            _supabase.save_causal_analysis(
                task_id=task_id,
                result=result,
                is_final=is_final,
                triggered_by=triggered_by,
            )
            _supabase.update_market_analysis_status(
                task_id, "completed", prediction_count=pred_count,
            )
            logger.info("Analysis completed for market %s", task_id)
        else:
            error_result = {
                "status": "error",
                "error": result.get("message", "Analysis incomplete"),
                "preprocess_summary": {"total_signals": pred_count},
            }
            _supabase.save_causal_analysis(
                task_id=task_id,
                result=error_result,
                is_final=False,
                triggered_by=triggered_by,
            )
            _supabase.update_market_analysis_status(task_id, "pending")

    except Exception as e:
        logger.error("Analysis failed for market %s: %s", task_id, e, exc_info=True)
        error_result = {
            "status": "error",
            "error": str(e),
            "preprocess_summary": {"total_signals": pred_count},
        }
        _supabase.save_causal_analysis(
            task_id=task_id,
            result=error_result,
            is_final=False,
            triggered_by=triggered_by,
        )
        _supabase.update_market_analysis_status(task_id, "pending")


def _format_predictions(raw_predictions: list) -> list:
    """将 Supabase predictions 行格式转换为因果引擎输入格式"""
    formatted = []
    for p in raw_predictions:
        evidence_text = p.get("evidence_text") or p.get("rationale", "")
        prediction_id = p.get("id", "unknown")
        signal_id = f"sig_{prediction_id[:8]}" if isinstance(prediction_id, str) and len(prediction_id) >= 8 else f"sig_{prediction_id}"

        pred = {
            "prediction_id": prediction_id,
            "task_id": p["task_id"],
            "agent_id": p["user_id"],
            "probability": p.get("probability", 0.5),
            "submitted_at": p.get("submitted_at", ""),
            "user_persona": p.get("user_persona"),
            "agent_reputation": float(p.get("agent_reputation", 100.0)),
            "signals": [
                {
                    "signal_id": signal_id,
                    "evidence_type": p.get("evidence_type", "persona_inference"),
                    "evidence": evidence_text,
                    "source_description": p.get("source_url") or "prediction_submission",
                    "relevance_score": float(p.get("relevance_score", 0.5)),
                    "entity_tags": p.get("entity_tags") or [],
                }
            ],
        }
        if p.get("rationale"):
            pred["rationale"] = p["rationale"]
        formatted.append(pred)
    return formatted


async def _generate_newspaper(
    market: Dict[str, Any],
    analysis_result: Dict[str, Any],
) -> str:
    """基于因果图谱结果生成增强版未来报纸"""
    global _llm_client

    conclusion = analysis_result.get("conclusion", {})
    graph = analysis_result.get("graph", {})

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

    sorted_nodes = sorted(nodes, key=lambda x: x.get("impact_score", 0), reverse=True)
    factor_rows = []
    for n in sorted_nodes:
        if n.get("is_prediction_target") or n.get("node_type") == "target":
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

    critical_paths = conclusion.get("critical_paths", [])
    if critical_paths:
        paths_text = "\n".join(
            f"路径{i}: {' → '.join(p)}"
            for i, p in enumerate(critical_paths[:3], 1)
        )
    else:
        edge_chains = [
            f"{e.get('source_name', '?')} "
            f"{'→促进' if e.get('direction') == 'positive' else '⊣抑制'} "
            f"{e.get('target_name', '?')} [权重{e.get('weight', 0):.2f}]"
            for e in edges[:5]
        ]
        paths_text = "\n".join(edge_chains) if edge_chains else "（无路径数据）"

    one_line = conclusion.get("one_line_conclusion", "")
    key_drivers = conclusion.get("key_drivers", [])
    risk_factors = conclusion.get("risk_factors", [])
    minority_assessment = conclusion.get("minority_assessment", "")
    persona_insight = conclusion.get("persona_insight", "")
    minority_warning = conclusion.get("minority_warning") or ""

    key_drivers_text = "\n".join(f"- {d}" for d in key_drivers) if key_drivers else "（未提取）"
    risk_text = "\n".join(f"- {r}" for r in risk_factors) if risk_factors else "（未提取）"
    market_question = market.get("question", market.get("title", ""))
    market_desc = market.get("description", "无")

    prompt = f"""## 素材（因果推演引擎已生成，禁止篡改数值）

**预测问题**：{market_question}
**背景**：{market_desc}
**裁定方向**：{direction_cn}（{direction_raw}）
**置信度**：{confidence:.0%}（区间 {ci_low:.0%}–{ci_high:.0%}）
**一句话裁定**：{one_line or '（引擎未输出）'}

**驱动力**：
{key_drivers_text}

**因子详表**（必须原样嵌入正文"因果图谱摘要"框）：
{factor_table}

**关键因果链**：
{paths_text}

**风险**：
{risk_text}

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
5. 结尾用社论式收笔：一个有力的判断句，告诉读者这意味着什么、他们应该怎么看
6. 字数3500–4000字，分节用 `§` 符号，节名简洁有力（像真实报纸版块标题）
7. 禁止出现"本报告"、"分析报告"、"数据显示"——你是记者，不是分析师

---

## 报纸结构（严格按此顺序）

**§ 标题**
不超过25字的陈述句——已经发生的事，不是问句，不是预测。要有冲击力。

**§ 导言**
倒金字塔第一段，80字以内，5W1H，新闻事实语气。

**§ 正文**
3–4段叙事性分析。把驱动力、因果链路自然织入叙述，用具体数字佐证。至少一处引用"参与这一预测的[人群背景]分析师群体"的集体判断（来自画像洞察）。写出为什么这个结果让人震惊/不让人震惊。

**§ 因果图谱摘要**
用一句引导语引出，然后原样嵌入因子详表。之后用2–3句话点出最关键的1–2个因子和它们如何相互强化。

**§ 少数派声音**
明确表态：少数派信号是警报还是杂音？为什么？即使是少数声音，它指向的是哪个真实风险？不得和稀泥。

**§ 社论**
本报立场，3–5句，鲜明、有力、可引用。告诉读者这件事对他们意味着什么，下一步应该关注什么。

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


# ── 后台轮询任务 ─────────────────────────────────────────────────────
async def polling_loop():
    """后台轮询：检测待分析的市场并触发分析"""
    global _supabase

    logger.info("Polling loop started (interval=%ds)", POLL_INTERVAL)
    consecutive_errors = 0
    max_consecutive_errors = 5

    while True:
        try:
            pending = _supabase.get_pending_markets()
            consecutive_errors = 0

            if pending:
                logger.info("Found %d markets pending analysis", len(pending))
                tasks = [
                    asyncio.create_task(
                        run_analysis_for_market(
                            task_id=market["id"],
                            triggered_by="auto",
                        )
                    )
                    for market in pending
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        logger.error(
                            "Analysis failed for market %s: %s",
                            pending[i]["id"],
                            result
                        )
            else:
                logger.debug("No markets pending analysis")

        except Exception as e:
            consecutive_errors += 1
            error_type = type(e).__name__
            is_network_error = any(keyword in str(e).lower() for keyword in
                                   ['ssl', 'eof', 'connection', 'timeout', 'network'])
            if is_network_error:
                logger.warning(
                    "Network error in polling loop (%d/%d): %s - will retry with backoff",
                    consecutive_errors, max_consecutive_errors, error_type
                )
            else:
                logger.error("Polling loop error: %s", e, exc_info=True)

            if consecutive_errors >= max_consecutive_errors:
                logger.error(
                    "Too many consecutive errors (%d), resetting connection pool",
                    consecutive_errors
                )
                try:
                    _supabase = SupabaseManager()
                    logger.info("Connection pool refreshed")
                    consecutive_errors = 0
                except Exception as reset_err:
                    logger.error("Failed to reset connection: %s", reset_err)
                await asyncio.sleep(POLL_INTERVAL * 3)
                continue

            backoff = min(POLL_INTERVAL * (1.5 ** consecutive_errors), POLL_INTERVAL * 3)
            await asyncio.sleep(backoff)
            continue

        await asyncio.sleep(POLL_INTERVAL)


# ══════════════════════════════════════════════════════════════════════
# FastAPI 应用
# ══════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global _supabase, _llm_client, _polling_task

    logger.info("Starting DelphiGraph API Service...")

    _supabase = SupabaseManager()
    _llm_client = QwenLLMClient()

    _survey_db = SurveySupabaseClient(
        url=os.environ["SUPABASE_URL"],
        service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    survey_router.init(db=_survey_db, llm_client=_llm_client)
    logger.info("Survey router initialized")

    _polling_task = asyncio.create_task(polling_loop())
    logger.info("Background polling task started")

    yield

    if _polling_task:
        _polling_task.cancel()
        try:
            await _polling_task
        except asyncio.CancelledError:
            pass
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
    market = _supabase.get_market(req.task_id)
    if not market:
        raise HTTPException(status_code=404, detail="市场不存在")

    pred_count = _supabase.get_prediction_count(req.task_id)
    if pred_count < MIN_SIGNALS_FOR_ANALYSIS:
        raise HTTPException(
            status_code=400,
            detail=f"线索不足（当前 {pred_count} 条，需要至少 {MIN_SIGNALS_FOR_ANALYSIS} 条）",
        )

    background_tasks.add_task(
        run_analysis_for_market,
        task_id=req.task_id,
        triggered_by="manual",
        force_final=req.force_final,
    )

    return {
        "message": "分析任务已提交",
        "task_id": req.task_id,
        "prediction_count": pred_count,
        "force_final": req.force_final,
    }


# ── 获取分析结果 ──────────────────────────────────────────────────────
@app.get("/api/causal-analysis/{task_id}")
async def get_analysis(task_id: str):
    result = _supabase.get_latest_analysis(task_id)
    if not result:
        raise HTTPException(status_code=404, detail="该市场暂无因果分析结果")
    return result


@app.get("/api/causal-analysis/{task_id}/graph")
async def get_graph(task_id: str):
    result = _supabase.get_latest_analysis(task_id)
    if not result or not result.get("graph_data"):
        raise HTTPException(status_code=404, detail="该市场暂无因果图谱")
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
        raise HTTPException(status_code=404, detail="该市场暂无未来报纸")
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
