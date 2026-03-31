"""
Survey Engine — Aggregator
聚合 Agent 回答，计算分布、分群、分歧率，并调用 LLM 生成调查报告。
"""
from __future__ import annotations
import logging
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

from .survey_models import (
    AgentPersona,
    PersonaBreakdown,
    QuestionAnalysis,
    QuestionResponses,
    QuestionType,
    SurveyAnalysisResult,
)

logger = logging.getLogger(__name__)

PERSONA_DIMENSIONS = ["region", "occupation", "gender", "age_range"]


class SurveyAggregator:
    def __init__(self, llm_client: Any):
        self._llm = llm_client

    async def analyze(
        self,
        survey_id: str,
        survey_title: str,
        survey_description: str,
        question_responses: List[QuestionResponses],
    ) -> SurveyAnalysisResult:
        """对所有题目汇总分析，生成完整调查结果"""
        question_analyses: List[QuestionAnalysis] = []

        for qr in question_responses:
            qa = self._analyze_question(qr)
            question_analyses.append(qa)
            logger.info(
                "Survey %s: question %s analyzed, %d responses, dissent=%.2f",
                survey_id, qr.question_id, qa.analyzed_response_count, qa.dissent_rate,
            )

        total_responses = sum(qa.analyzed_response_count for qa in question_analyses)

        # LLM 生成完整报告
        full_report = await self._generate_report(
            survey_title, survey_description, question_analyses
        )

        return SurveyAnalysisResult(
            survey_id=survey_id,
            question_analyses=question_analyses,
            full_report=full_report,
            total_responses=total_responses,
        )

    # ── Per-question analysis ─────────────────────────────────────────

    def _analyze_question(self, qr: QuestionResponses) -> QuestionAnalysis:
        responses = qr.responses
        if not responses:
            return QuestionAnalysis(
                question_id=qr.question_id,
                question_text=qr.question_text,
                result_distribution={},
                persona_breakdown=[],
                consensus_answer=None,
                dissent_rate=0.0,
                key_insights=[],
                analyzed_response_count=0,
            )

        # ── 总体分布 ──────────────────────────────────────────────────
        answers = [r.answer for r in responses]
        if qr.question_type == QuestionType.multi_choice:
            # 多选：拆开计数
            flat: List[str] = []
            for a in answers:
                flat.extend([x.strip() for x in a.split(",") if x.strip()])
            counter = Counter(flat)
            total = len(answers)
        else:
            counter = Counter(answers)
            total = len(answers)

        distribution = {k: round(v / total, 4) for k, v in counter.most_common()}

        # ── 主流答案 & 分歧率 ─────────────────────────────────────────
        consensus_answer = counter.most_common(1)[0][0] if counter else None
        dissent_rate = self._compute_dissent(distribution)

        # ── 按画像分群 ────────────────────────────────────────────────
        persona_breakdown = self._compute_persona_breakdown(qr, total)

        # ── 关键洞察（规则生成）──────────────────────────────────────
        key_insights = self._extract_insights(
            qr.question_text, distribution, persona_breakdown, dissent_rate, qr.options
        )

        return QuestionAnalysis(
            question_id=qr.question_id,
            question_text=qr.question_text,
            result_distribution=distribution,
            persona_breakdown=persona_breakdown,
            consensus_answer=consensus_answer,
            dissent_rate=dissent_rate,
            key_insights=key_insights,
            analyzed_response_count=total,
        )

    def _compute_dissent(self, distribution: Dict[str, float]) -> float:
        """分歧率：1 - 最高选项占比（越高越分散）"""
        if not distribution:
            return 0.0
        top = max(distribution.values())
        return round(1.0 - top, 4)

    def _compute_persona_breakdown(
        self, qr: QuestionResponses, total: int
    ) -> List[PersonaBreakdown]:
        breakdowns = []
        for dim in PERSONA_DIMENSIONS:
            groups: Dict[str, Counter] = defaultdict(Counter)
            for r in qr.responses:
                val = getattr(r.agent_persona, dim, None)
                if not val:
                    continue
                if qr.question_type == QuestionType.multi_choice:
                    for ans in r.answer.split(","):
                        groups[val][ans.strip()] += 1
                else:
                    groups[val][r.answer] += 1

            if not groups:
                continue

            groups_pct: Dict[str, Dict[str, float]] = {}
            for gval, cnt in groups.items():
                g_total = sum(cnt.values())
                groups_pct[gval] = {k: round(v / g_total, 4) for k, v in cnt.most_common(3)}

            breakdowns.append(PersonaBreakdown(dimension=dim, groups=groups_pct))

        return breakdowns

    def _extract_insights(
        self,
        question_text: str,
        distribution: Dict[str, float],
        breakdowns: List[PersonaBreakdown],
        dissent_rate: float,
        options: List[Any],
    ) -> List[str]:
        insights: List[str] = []
        if not distribution:
            return insights

        option_map = {o.id: o.text for o in options} if options else {}
        top_items = list(distribution.items())[:2]

        if top_items:
            top_id, top_pct = top_items[0]
            top_label = option_map.get(top_id, top_id)
            insights.append(f"主流选择为「{top_label}」，占比 {top_pct:.0%}")

        if dissent_rate > 0.6:
            insights.append(f"观点分歧明显（分歧率 {dissent_rate:.0%}），群体内部存在显著分歧")
        elif dissent_rate < 0.25:
            insights.append(f"群体高度共识（分歧率仅 {dissent_rate:.0%}）")

        for bd in breakdowns:
            group_tops = {
                gval: max(ans_dist.items(), key=lambda x: x[1])
                for gval, ans_dist in bd.groups.items()
                if ans_dist
            }
            # 找出与主流答案不同的分群
            if top_items:
                minority_groups = [
                    gval for gval, (ans, _) in group_tops.items()
                    if ans != top_items[0][0]
                ]
                if minority_groups:
                    labels = "、".join(minority_groups[:2])
                    minority_label = option_map.get(
                        group_tops[minority_groups[0]][0], group_tops[minority_groups[0]][0]
                    )
                    insights.append(
                        f"{bd.dimension} 维度中「{labels}」群体偏向「{minority_label}」，与主流相反"
                    )

        return insights[:5]

    # ── Report generation ─────────────────────────────────────────────

    async def _generate_report(
        self,
        title: str,
        description: str,
        analyses: List[QuestionAnalysis],
    ) -> str:
        qa_summary = ""
        for qa in analyses:
            # 完整答案分布
            dist_str = " | ".join(f"{k}: {v:.0%}" for k, v in qa.result_distribution.items())
            insights_str = "\n".join(f"  - {i}" for i in qa.key_insights)

            # 人群分布摘要
            persona_lines = []
            for pb in qa.persona_breakdown:
                for gval, ans_dist in pb.groups.items():
                    if not ans_dist:
                        continue
                    top_ans, top_pct = max(ans_dist.items(), key=lambda x: x[1])
                    persona_lines.append(
                        f"  [{pb.dimension}={gval}] 首选「{top_ans}」({top_pct:.0%})"
                    )
            persona_str = "\n".join(persona_lines) if persona_lines else "  无分群数据"

            qa_summary += (
                f"\n### 题目：{qa.question_text}\n"
                f"- 完整分布：{dist_str}\n"
                f"- 主流答案：{qa.consensus_answer or '无共识'}，分歧率 {qa.dissent_rate:.0%}\n"
                f"- 关键洞察：\n{insights_str or '  无'}\n"
                f"- 人群分布：\n{persona_str}\n"
            )

        prompt = f"""## 调查背景
调查标题：{title}
调查说明：{description or '无'}

## 各题详细数据
{qa_summary}

---

## 写作任务

你是 DelphiGraph 平台的首席分析师，正在为刚完成的 AI 智能体集体意见调查撰写一篇深度调查报告。
这份报告将以「未来报纸」的形式呈现，面向关注社会与市场走向的读者。

**调查背景说明**：
- 回答者是具有真实人口画像（地区、职业、性别、年龄段）的 AI 智能体，模拟真实社会群体
- 数据反映的是群体倾向，而非个人意见
- 请结合人群分布数据，分析哪些群体意见一致、哪些群体产生分歧

**写作要求**：
- 语言：报纸社论风格，简洁有力，有观点，有温度，不用学术腔
- 数字必须内嵌于叙述中（如「超过七成受访者…」）
- 每节要有独立论点，不只是数字描述
- 字数：1500–2200 字

**报告结构**（用 § 标记每节，§ 后紧跟节标题，换行写正文）**：

§ 导语
用 2–3 句话点出本次调查最核心、最出人意料的发现。像报纸头条一样引人入胜。

§ 核心发现
逐题呈现主要结论，将百分比自然融入叙述，形成有观点的陈述而非数字罗列。

§ 群体图谱
深入分析人群差异——哪些群体意见高度一致，哪些群体内部分化，职业/地区/年龄如何左右答案。

§ 异见声音
聚焦持少数立场的群体，还原他们的逻辑与背景，探讨这一异见的社会意义。

§ 信号与洞察
从数据中提炼隐藏的深层趋势或反直觉信号，给出分析师视角的解读。

§ 预测与建议
基于本次调查结果，对相关领域的未来走向作出判断，并给出行动层面的建议。

请直接撰写正文，从 § 导语 开始，不要有前言或额外说明："""

        try:
            report = await self._llm.chat(
                user_prompt=prompt,
                system_prompt=(
                    "你是 DelphiGraph 平台的首席分析师，擅长将 AI 群体调研数据转化为"
                    "深刻、可读的新闻社评。行文有判断力、有温度、有前瞻性。"
                ),
                temperature=0.78,
                max_tokens=4000,
            )
            return report
        except Exception as e:
            logger.error("Survey report generation failed: %s", e)
            return f"[报告生成失败: {e}]"
