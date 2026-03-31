"""
Survey Engine — Supabase DB 操作层
独立于 causal_engine/supabase_client.py，只操作 survey_* 表。
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from supabase import create_client, Client

logger = logging.getLogger(__name__)


class SurveySupabaseClient:
    def __init__(self, url: str, service_role_key: str):
        self._client: Client = create_client(url, service_role_key)

    # ── surveys ───────────────────────────────────────────────────────

    def create_survey(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self._client.table("surveys").insert(data).execute()
        return res.data[0] if res.data else {}

    def get_survey(self, survey_id: str) -> Optional[Dict[str, Any]]:
        res = (
            self._client.table("surveys")
            .select("*")
            .eq("id", survey_id)
            .maybe_single()
            .execute()
        )
        return res.data

    def list_surveys(self, creator_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        q = self._client.table("surveys").select("*").order("created_at", desc=True).limit(limit)
        if creator_id:
            q = q.eq("creator_id", creator_id)
        return q.execute().data or []

    def update_survey_status(
        self,
        survey_id: str,
        status: str,
        response_count: Optional[int] = None,
    ) -> None:
        payload: Dict[str, Any] = {"status": status}
        if status == "running":
            payload["started_at"] = datetime.now(timezone.utc).isoformat()
        if status == "completed":
            payload["completed_at"] = datetime.now(timezone.utc).isoformat()
        if response_count is not None:
            payload["response_count"] = response_count
        self._client.table("surveys").update(payload).eq("id", survey_id).execute()

    # ── survey_questions ──────────────────────────────────────────────

    def create_questions(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        res = self._client.table("survey_questions").insert(questions).execute()
        return res.data or []

    def get_questions(self, survey_id: str) -> List[Dict[str, Any]]:
        res = (
            self._client.table("survey_questions")
            .select("*")
            .eq("survey_id", survey_id)
            .order("question_order")
            .execute()
        )
        return res.data or []

    # ── survey_responses ──────────────────────────────────────────────

    def insert_responses(self, responses: List[Dict[str, Any]]) -> None:
        if not responses:
            return
        CHUNK = 200
        for i in range(0, len(responses), CHUNK):
            self._client.table("survey_responses").insert(responses[i : i + CHUNK]).execute()
        logger.info("Inserted %d survey responses", len(responses))

    def get_responses(self, survey_id: str, question_id: Optional[str] = None) -> List[Dict[str, Any]]:
        q = (
            self._client.table("survey_responses")
            .select("*")
            .eq("survey_id", survey_id)
        )
        if question_id:
            q = q.eq("question_id", question_id)
        return q.execute().data or []

    def count_responses(self, survey_id: str) -> int:
        res = (
            self._client.table("survey_responses")
            .select("id", count="exact")
            .eq("survey_id", survey_id)
            .execute()
        )
        return res.count or 0

    # ── survey_analyses ───────────────────────────────────────────────

    def upsert_analysis(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = (
            self._client.table("survey_analyses")
            .upsert(data, on_conflict="survey_id,question_id")
            .execute()
        )
        return res.data[0] if res.data else {}

    def insert_analysis(self, data: Dict[str, Any]) -> Dict[str, Any]:
        res = self._client.table("survey_analyses").insert(data).execute()
        return res.data[0] if res.data else {}

    def get_analyses(self, survey_id: str) -> List[Dict[str, Any]]:
        res = (
            self._client.table("survey_analyses")
            .select("*")
            .eq("survey_id", survey_id)
            .execute()
        )
        return res.data or []

    # ── agent pool（从 profiles 表读取画像，只读，不写入）─────────────

    def get_agent_pool(self, persona_filters: Dict[str, List[str]], limit: int = 500) -> List[Dict[str, Any]]:
        """从 profiles 表获取符合画像筛选条件的 Agent 列表（只读）"""
        q = self._client.table("profiles").select(
            "id, username, persona_region, persona_gender, persona_age_range, "
            "persona_occupation, persona_interests, reputation_score"
        )
        if persona_filters.get("region"):
            q = q.in_("persona_region", persona_filters["region"])
        if persona_filters.get("occupation"):
            q = q.in_("persona_occupation", persona_filters["occupation"])
        if persona_filters.get("gender"):
            q = q.in_("persona_gender", persona_filters["gender"])
        return q.limit(limit).execute().data or []
