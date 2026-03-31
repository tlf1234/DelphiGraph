"""
线索数据模型

定义 Agent 提交的原始线索经预处理后的结构化数据类型。
端侧 Agent 是传感器（Sensor），不做预测。
InferenceDirection 仅在平台宏观大脑层面使用。
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


class EvidenceType(Enum):
    """证据类型"""
    HARD_FACT = "hard_fact"                # 端侧采集到的真实数据
    PERSONA_INFERENCE = "persona_inference"  # 端侧基于用户画像推演的数据


class InferenceDirection(Enum):
    """推演方向 — 仅平台宏观大脑使用，不来自端侧 Agent"""
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


@dataclass
class EntityTag:
    """Agent端提取的关键实体标注（传感器增强，非预测）"""
    text: str       # 实体文本，如"裁员""特斯拉"
    type: str       # brand/person/event/trend/behavior/sentiment/metric/location/policy/technology
    role: str       # target/cause/indicator/context/negative_intent/positive_intent

    def to_dict(self) -> Dict:
        return {"text": self.text, "type": self.type, "role": self.role}

    @classmethod
    def from_dict(cls, data: Dict) -> "EntityTag":
        return cls(
            text=data.get("text", ""),
            type=data.get("type", ""),
            role=data.get("role", ""),
        )


@dataclass
class ProcessedSignal:
    """预处理后的结构化线索"""
    signal_id: str
    task_id: str
    agent_id: str
    evidence_type: EvidenceType
    evidence_text: str                                    # 证据文本（端侧已脱敏）
    source_description: str = ""
    relevance_score: float = 0.5                          # Agent自评相关度(0-1)
    entity_tags: List[EntityTag] = field(default_factory=list)
    weight: float = 0.0                                   # hard_fact=1.0, persona=0.1
    quality_score: float = 0.0                            # 边际贡献评分 Qi
    sentiment_tag: Optional[str] = None                   # 平台LLM标注的情感倾向
    cluster_id: Optional[str] = None
    agent_reputation: float = 100.0
    is_minority: bool = False
    user_persona: Optional[Dict] = None                   # UAP v2.0: 端侧脱敏后的用户画像

    def to_dict(self) -> Dict:
        return {
            "signal_id": self.signal_id,
            "task_id": self.task_id,
            "agent_id": self.agent_id,
            "evidence_type": self.evidence_type.value,
            "evidence_text": self.evidence_text,
            "source_description": self.source_description,
            "relevance_score": self.relevance_score,
            "entity_tags": [t.to_dict() for t in self.entity_tags],
            "weight": self.weight,
            "quality_score": self.quality_score,
            "sentiment_tag": self.sentiment_tag,
            "cluster_id": self.cluster_id,
            "agent_reputation": self.agent_reputation,
            "is_minority": self.is_minority,
            "user_persona": self.user_persona,
        }


@dataclass
class SignalCluster:
    """语义聚类后的线索簇"""
    cluster_id: str
    theme: str                                            # LLM生成的主题标签
    sentiment: Optional[str] = None                       # 平台LLM判断的簇情感倾向
    anchor_entities: List[str] = field(default_factory=list)  # 聚类锚点实体
    signals: List[ProcessedSignal] = field(default_factory=list)
    hard_fact_count: int = 0
    persona_count: int = 0
    persona_distribution: Dict = field(default_factory=dict)  # UAP v2.0: 画像维度分布

    def to_dict(self) -> Dict:
        return {
            "cluster_id": self.cluster_id,
            "theme": self.theme,
            "sentiment": self.sentiment,
            "anchor_entities": self.anchor_entities,
            "signal_count": len(self.signals),
            "hard_fact_count": self.hard_fact_count,
            "persona_count": self.persona_count,
            "persona_distribution": self.persona_distribution,
        }


@dataclass
class ClusterRelation:
    """两个语义簇之间的显式逻辑关系（Alphapoly Implications步骤）"""
    source_cluster_id: str
    target_cluster_id: str
    source_theme: str
    target_theme: str
    relation_type: str    # causes / supports / contradicts / conditional
    direction: str        # A->B / B->A / bidirectional
    confidence: float     # 0-1
    explanation: str      # 一句话解释

    def to_dict(self) -> Dict:
        return {
            "source_cluster_id": self.source_cluster_id,
            "target_cluster_id": self.target_cluster_id,
            "source_theme": self.source_theme,
            "target_theme": self.target_theme,
            "relation_type": self.relation_type,
            "direction": self.direction,
            "confidence": self.confidence,
            "explanation": self.explanation,
        }


@dataclass
class PreprocessResult:
    """预处理管线输出"""
    task_id: str
    total_signals: int
    valid_signals: int
    clusters: List[SignalCluster] = field(default_factory=list)
    minority_clusters: List[SignalCluster] = field(default_factory=list)
    entity_index: Dict = field(default_factory=dict)      # 全局实体索引
    hard_fact_count: int = 0
    persona_count: int = 0
    persona_summary: Dict = field(default_factory=dict)      # UAP v2.0: 全局画像统计摘要
    cluster_relations: List["ClusterRelation"] = field(default_factory=list)  # 簇间逻辑关系

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "total_signals": self.total_signals,
            "valid_signals": self.valid_signals,
            "clusters": [c.to_dict() for c in self.clusters],
            "minority_clusters": [c.to_dict() for c in self.minority_clusters],
            "entity_index_size": len(self.entity_index),
            "hard_fact_count": self.hard_fact_count,
            "persona_count": self.persona_count,
            "persona_summary": self.persona_summary,
            "cluster_relations": [r.to_dict() for r in self.cluster_relations],
        }
