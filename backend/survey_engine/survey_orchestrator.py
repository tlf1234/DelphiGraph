"""
Survey Engine — Orchestrator
驱动 Agent 基于自身画像对调查题目进行回答，生成带理由的回答列表。
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from .survey_models import (
    AgentPersona,
    QuestionOption,
    QuestionType,
    SurveyResponseItem,
    QuestionResponses,
)

logger = logging.getLogger(__name__)

# 每批并发生成回答的 Agent 数量（避免 LLM 限流）
BATCH_SIZE = 10
# 每道题最多处理 Agent 数（控制成本）
MAX_AGENTS_PER_QUESTION = 200


class SurveyOrchestrator:
    """
    对每个 Agent，根据其画像调用 LLM 生成调查回答（answer + rationale + confidence）。
    """

    def __init__(self, llm_client: Any):
        self._llm = llm_client

    async def run(
        self,
        survey_id: str,
        questions: List[Dict[str, Any]],
        agents: List[Dict[str, Any]],
    ) -> List[QuestionResponses]:
        """
        对所有题目 × 所有 Agent 生成回答。
        返回每道题的 QuestionResponses 列表。
        """
        if not agents:
            logger.warning("No agents available for survey %s", survey_id)
            return []

        personas = [self._to_persona(a) for a in agents]
        results: List[QuestionResponses] = []

        for q in questions:
            logger.info(
                "Survey %s: generating responses for question %d/%d",
                survey_id, q.get("question_order", 1), len(questions),
            )
            q_responses = await self._process_question(q, personas)
            results.append(q_responses)

        return results

    # ── Private helpers ───────────────────────────────────────────────

    async def _process_question(
        self,
        question: Dict[str, Any],
        personas: List[AgentPersona],
    ) -> QuestionResponses:
        options = [
            QuestionOption(**o) if isinstance(o, dict) else o
            for o in (question.get("options") or [])
        ]
        q_type = QuestionType(question.get("question_type", "single_choice"))

        # 限制 Agent 数量
        active_personas = personas[:MAX_AGENTS_PER_QUESTION]

        # 并发批次生成
        all_responses: List[SurveyResponseItem] = []
        for i in range(0, len(active_personas), BATCH_SIZE):
            batch = active_personas[i : i + BATCH_SIZE]
            tasks = [
                self._generate_response(question, q_type, options, p)
                for p in batch
            ]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in batch_results:
                if isinstance(r, SurveyResponseItem):
                    all_responses.append(r)
                elif isinstance(r, Exception):
                    logger.warning("Agent response generation failed: %s", r)

        return QuestionResponses(
            question_id=question["id"],
            question_text=question["question_text"],
            question_type=q_type,
            options=options,
            responses=all_responses,
        )

    async def _generate_response(
        self,
        question: Dict[str, Any],
        q_type: QuestionType,
        options: List[QuestionOption],
        persona: AgentPersona,
    ) -> SurveyResponseItem:
        prompt = self._build_prompt(question, q_type, options, persona)
        raw = await self._llm.chat(
            user_prompt=prompt,
            system_prompt=(
                "你是一个真实的人，你的个人背景如下。你在回答一份调查问卷。"
                "请严格按照你的背景和认知来回答，不要给出你不真实持有的观点。"
                "只输出 JSON，不要任何前言或解释。"
            ),
            temperature=0.8,
            max_tokens=300,
        )
        return self._parse_response(raw, persona, q_type, options)

    def _build_prompt(
        self,
        question: Dict[str, Any],
        q_type: QuestionType,
        options: List[QuestionOption],
        persona: AgentPersona,
    ) -> str:
        persona_desc = (
            f"姓名：{persona.username}\n"
            f"地域：{persona.region or '未知'}\n"
            f"性别：{persona.gender or '未知'}\n"
            f"年龄段：{persona.age_range or '未知'}\n"
            f"职业：{persona.occupation or '未知'}\n"
            f"兴趣：{', '.join(persona.interests) if persona.interests else '未知'}"
        )

        if q_type == QuestionType.single_choice:
            options_str = "\n".join(f"  {o.id}. {o.text}" for o in options)
            format_hint = (
                f'输出格式（JSON）：{{"answer": "<选项id>", "rationale": "<50字以内说明>", "confidence": <0.5-1.0>}}\n'
                f"answer 必须是以下之一：{', '.join(o.id for o in options)}"
            )
        elif q_type == QuestionType.multi_choice:
            options_str = "\n".join(f"  {o.id}. {o.text}" for o in options)
            format_hint = (
                '输出格式（JSON）：{"answer": "<用逗号分隔的选项id列表>", "rationale": "<50字以内说明>", "confidence": <0.5-1.0>}'
            )
        elif q_type == QuestionType.rating:
            min_v = question.get("rating_min", 1)
            max_v = question.get("rating_max", 10)
            options_str = f"评分范围：{min_v}–{max_v}（{min_v}=最低，{max_v}=最高）"
            format_hint = (
                f'输出格式（JSON）：{{"answer": "<{min_v}到{max_v}的整数>", "rationale": "<50字以内说明>", "confidence": <0.5-1.0>}}'
            )
        elif q_type == QuestionType.comparison:
            options_str = "\n".join(f"  {o.id}. {o.text}" for o in options[:2])
            format_hint = (
                '输出格式（JSON）：{"answer": "<选项id>", "rationale": "<50字以内说明>", "confidence": <0.5-1.0>}'
            )
        else:  # open_ended
            options_str = ""
            format_hint = (
                '输出格式（JSON）：{"answer": "<你的回答，100字以内>", "rationale": "<你为何这样回答，30字以内>", "confidence": <0.5-1.0>}'
            )

        return (
            f"## 你的个人背景\n{persona_desc}\n\n"
            f"## 调查问题\n{question['question_text']}\n\n"
            f"{options_str}\n\n"
            f"## 输出要求\n{format_hint}"
        )

    def _parse_response(
        self,
        raw: str,
        persona: AgentPersona,
        q_type: QuestionType,
        options: List[QuestionOption],
    ) -> SurveyResponseItem:
        try:
            # 提取 JSON（LLM 可能包含 markdown code block）
            text = raw.strip()
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            data = json.loads(text)
            answer = str(data.get("answer", "")).strip()
            rationale = str(data.get("rationale", "")).strip()
            confidence = float(data.get("confidence", 0.7))
            confidence = max(0.0, min(1.0, confidence))

            # 校验单选/对比答案合法性
            if q_type in (QuestionType.single_choice, QuestionType.comparison) and options:
                valid_ids = {o.id for o in options}
                if answer not in valid_ids:
                    answer = options[0].id  # fallback 到第一个选项

        except Exception:
            answer = options[0].id if options else "N/A"
            rationale = ""
            confidence = 0.5

        return SurveyResponseItem(
            agent_persona=persona,
            answer=answer,
            rationale=rationale,
            confidence=confidence,
        )

    @staticmethod
    def _to_persona(agent: Dict[str, Any]) -> AgentPersona:
        return AgentPersona(
            agent_id=str(agent.get("id", "")),
            username=agent.get("username") or f"Agent-{str(agent.get('id', ''))[:6]}",
            region=agent.get("persona_region"),
            gender=agent.get("persona_gender"),
            age_range=agent.get("persona_age_range"),
            occupation=agent.get("persona_occupation"),
            interests=agent.get("persona_interests") or [],
            reputation_score=float(agent.get("reputation_score") or 100),
        )
