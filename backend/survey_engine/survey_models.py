"""
Survey Engine — 数据模型
Pydantic models for Survey module, completely independent from causal_engine models.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from enum import Enum


class SurveyType(str, Enum):
    opinion         = "opinion"
    market_research = "market_research"
    product_feedback = "product_feedback"
    social          = "social"


class SurveyStatus(str, Enum):
    draft     = "draft"
    running   = "running"
    completed = "completed"
    archived  = "archived"


class QuestionType(str, Enum):
    single_choice = "single_choice"
    multi_choice  = "multi_choice"
    rating        = "rating"
    open_ended    = "open_ended"
    comparison    = "comparison"


class QuestionOption(BaseModel):
    id:   str
    text: str


# ── Request / Input models ────────────────────────────────────────────

class SurveyQuestionCreate(BaseModel):
    question_order: int = 1
    question_text:  str
    question_type:  QuestionType = QuestionType.single_choice
    options:        List[QuestionOption] = Field(default_factory=list)
    rating_min:     int = 1
    rating_max:     int = 10
    is_required:    bool = True


class SurveyCreate(BaseModel):
    title:                  str
    description:            Optional[str] = None
    survey_type:            SurveyType = SurveyType.opinion
    target_persona_filters: Dict[str, List[str]] = Field(default_factory=dict)
    target_agent_count:     int = 0
    questions:              List[SurveyQuestionCreate]


# ── Internal processing models ────────────────────────────────────────

class AgentPersona(BaseModel):
    """Agent 画像快照（调查回答时生成，独立存储）"""
    agent_id:           str
    username:           str
    region:             Optional[str] = None
    gender:             Optional[str] = None
    age_range:          Optional[str] = None
    occupation:         Optional[str] = None
    interests:          List[str] = Field(default_factory=list)
    education:          Optional[str] = None
    income_level:       Optional[str] = None
    investment_experience: Optional[str] = None
    reputation_score:   float = 100.0


class SurveyResponseItem(BaseModel):
    """单条 Agent 回答（内部处理用）"""
    agent_persona:  AgentPersona
    answer:         str
    rationale:      str
    confidence:     float = 0.7


class QuestionResponses(BaseModel):
    """一道题的所有 Agent 回答"""
    question_id:    str
    question_text:  str
    question_type:  QuestionType
    options:        List[QuestionOption]
    responses:      List[SurveyResponseItem] = Field(default_factory=list)


# ── Analysis / Output models ──────────────────────────────────────────

class PersonaBreakdown(BaseModel):
    """按画像维度分组的答案分布"""
    dimension:  str                          # e.g. "region", "occupation"
    groups:     Dict[str, Dict[str, float]]  # {group_value: {answer: pct}}


class QuestionAnalysis(BaseModel):
    """单道题的分析结果"""
    question_id:            str
    question_text:          str
    result_distribution:    Dict[str, float]   # {answer: pct}
    persona_breakdown:      List[PersonaBreakdown]
    consensus_answer:       Optional[str]
    dissent_rate:           float
    key_insights:           List[str]
    analyzed_response_count: int


class SurveyAnalysisResult(BaseModel):
    """整份调查的完整分析结果"""
    survey_id:          str
    question_analyses:  List[QuestionAnalysis]
    full_report:        str
    total_responses:    int
