"""
Survey Engine — APIRouter
挂载到 backend/api_service.py 的 FastAPI 实例，共用同一进程和端口。
"""
from __future__ import annotations
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from .survey_models import SurveyCreate
from .survey_supabase import SurveySupabaseClient
from .survey_orchestrator import SurveyOrchestrator
from .survey_aggregator import SurveyAggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/surveys", tags=["surveys"])

# ── 依赖注入（由 api_service.py 在 startup 时注入）────────────────────
_db:  Optional[SurveySupabaseClient] = None
_llm: Optional[Any] = None


def init(db: SurveySupabaseClient, llm_client: Any) -> None:
    """由 backend/api_service.py 在应用启动时调用，注入共享客户端"""
    global _db, _llm
    _db  = db
    _llm = llm_client
    logger.info("Survey router initialized")


def _get_db() -> SurveySupabaseClient:
    if _db is None:
        raise RuntimeError("Survey router not initialized — call survey_router.init() first")
    return _db


def _get_llm() -> Any:
    if _llm is None:
        raise RuntimeError("Survey router not initialized — call survey_router.init() first")
    return _llm


# ══════════════════════════════════════════════════════════════
# GET /api/surveys
# ══════════════════════════════════════════════════════════════
@router.get("")
async def list_surveys(creator_id: Optional[str] = None):
    return {"surveys": _get_db().list_surveys(creator_id=creator_id)}


# ══════════════════════════════════════════════════════════════
# POST /api/surveys
# ══════════════════════════════════════════════════════════════
@router.post("", status_code=201)
async def create_survey(body: SurveyCreate, creator_id: Optional[str] = None):
    db = _get_db()

    survey = db.create_survey({
        "title":                  body.title,
        "description":            body.description,
        "survey_type":            body.survey_type.value,
        "target_persona_filters": body.target_persona_filters,
        "target_agent_count":     body.target_agent_count,
        "status":                 "draft",
        "creator_id":             creator_id,
    })

    questions_data = [
        {
            "survey_id":      survey["id"],
            "question_order": q.question_order,
            "question_text":  q.question_text,
            "question_type":  q.question_type.value,
            "options":        [o.model_dump() for o in q.options],
            "rating_min":     q.rating_min,
            "rating_max":     q.rating_max,
            "is_required":    q.is_required,
        }
        for q in body.questions
    ]
    created_questions = db.create_questions(questions_data)
    return {"survey": survey, "questions": created_questions}


# ══════════════════════════════════════════════════════════════
# GET /api/surveys/{survey_id}
# ══════════════════════════════════════════════════════════════
@router.get("/{survey_id}")
async def get_survey(survey_id: str):
    db = _get_db()
    survey = db.get_survey(survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return {
        "survey":    survey,
        "questions": db.get_questions(survey_id),
        "analyses":  db.get_analyses(survey_id),
    }


# ══════════════════════════════════════════════════════════════
# POST /api/surveys/{survey_id}/run — 触发 Agent 作答 + 聚合分析
# ══════════════════════════════════════════════════════════════
@router.post("/{survey_id}/run")
async def run_survey(survey_id: str):
    db  = _get_db()
    llm = _get_llm()

    survey = db.get_survey(survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if survey["status"] == "running":
        raise HTTPException(status_code=409, detail="Survey is already running")

    questions = db.get_questions(survey_id)
    if not questions:
        raise HTTPException(status_code=400, detail="Survey has no questions")

    db.update_survey_status(survey_id, "running")

    try:
        # Step 1: 获取 Agent 池
        persona_filters = survey.get("target_persona_filters") or {}
        target_count    = survey.get("target_agent_count") or 0
        agents = db.get_agent_pool(
            persona_filters=persona_filters,
            limit=target_count if target_count > 0 else 500,
        )
        if not agents:
            logger.warning("No agents matched persona filters, falling back to all profiles")
            agents = db.get_agent_pool(persona_filters={}, limit=500)
        if not agents:
            raise HTTPException(status_code=400, detail="No agents found in profiles table")
        logger.info("Survey %s: %d agents selected", survey_id, len(agents))

        # Step 2: 驱动 Agent 作答
        orchestrator = SurveyOrchestrator(llm_client=llm)
        question_responses = await orchestrator.run(
            survey_id=survey_id,
            questions=questions,
            agents=agents,
        )

        # Step 3: 持久化回答
        all_response_rows: List[Dict[str, Any]] = []
        for qr in question_responses:
            for r in qr.responses:
                all_response_rows.append({
                    "survey_id":     survey_id,
                    "question_id":   qr.question_id,
                    "agent_persona": r.agent_persona.model_dump(),
                    "answer":        r.answer,
                    "rationale":     r.rationale,
                    "confidence":    r.confidence,
                })
        db.insert_responses(all_response_rows)

        # Step 4: 聚合分析 + 生成报告
        aggregator = SurveyAggregator(llm_client=llm)
        analysis_result = await aggregator.analyze(
            survey_id=survey_id,
            survey_title=survey["title"],
            survey_description=survey.get("description") or "",
            question_responses=question_responses,
        )

        # Step 5: 持久化分析结果
        for i, qa in enumerate(analysis_result.question_analyses):
            db.insert_analysis({
                "survey_id":                survey_id,
                "question_id":              qa.question_id,
                "result_distribution":      qa.result_distribution,
                "persona_breakdown":        [pb.model_dump() for pb in qa.persona_breakdown],
                "consensus_answer":         qa.consensus_answer,
                "dissent_rate":             qa.dissent_rate,
                "key_insights":             qa.key_insights,
                "full_report":              analysis_result.full_report if i == 0 else None,
                "analyzed_response_count":  qa.analyzed_response_count,
            })

        total = len(all_response_rows)
        db.update_survey_status(survey_id, "completed", response_count=total)
        logger.info("Survey %s completed: %d responses", survey_id, total)

        return {"survey_id": survey_id, "status": "completed", "total_responses": total}

    except HTTPException:
        db.update_survey_status(survey_id, "draft")
        raise
    except Exception as e:
        logger.error("Survey %s run failed: %s", survey_id, e, exc_info=True)
        db.update_survey_status(survey_id, "draft")
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# GET /api/surveys/{survey_id}/responses
# ══════════════════════════════════════════════════════════════
@router.get("/{survey_id}/responses")
async def get_responses(survey_id: str, question_id: Optional[str] = None):
    responses = _get_db().get_responses(survey_id, question_id=question_id)
    return {"responses": responses, "count": len(responses)}
