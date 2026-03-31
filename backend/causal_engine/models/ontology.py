"""
因果本体数据模型

定义因果因子类型、因果关系类型、以及完整的因果本体结构。
由 CausalOntologyGenerator 通过 LLM 自动生成。
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional


# 预定义因果关系类型（始终可用，LLM 可在此基础上扩展）
PREDEFINED_RELATION_TYPES = {
    "DRIVES": {"description": "A增加→B增加", "direction": "positive"},
    "INHIBITS": {"description": "A增加→B减少", "direction": "negative"},
    "AMPLIFIES": {"description": "A增强B的变化幅度", "direction": "positive"},
    "TRIGGERS": {"description": "A发生→触发B出现", "direction": "positive"},
    "CORRELATES_WITH": {"description": "A和B相关但因果方向不明确", "direction": "neutral"},
    "MITIGATES": {"description": "A的存在降低B的影响", "direction": "negative"},
}


@dataclass
class CausalFactorType:
    """因果因子类型"""
    name: str                         # 如 "裁员潮冲击"
    description: str
    category: str                     # macro_economic / sentiment / behavior / policy / event / other
    measurability: str = "qualitative"  # quantitative / qualitative / mixed
    examples: List[str] = field(default_factory=list)
    source_clusters: List[str] = field(default_factory=list)  # LLM声明的来源聚类主题

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "measurability": self.measurability,
            "examples": self.examples,
            "source_clusters": self.source_clusters,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "CausalFactorType":
        return cls(
            name=data.get("name", ""),
            description=data.get("description", ""),
            category=data.get("category", "other"),
            measurability=data.get("measurability", "qualitative"),
            examples=data.get("examples", []),
            source_clusters=data.get("source_clusters", []),
        )


@dataclass
class CausalRelationType:
    """因果关系类型"""
    name: str                         # DRIVES / INHIBITS / ...
    description: str
    direction: str                    # positive / negative / neutral
    typical_strength: str = "moderate"  # strong / moderate / weak

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "description": self.description,
            "direction": self.direction,
            "typical_strength": self.typical_strength,
        }


@dataclass
class CausalOntology:
    """因果本体定义"""
    task_id: str
    market_query: str
    factor_types: List[CausalFactorType]
    relation_types: List[CausalRelationType]
    raw_causal_relations: List[Dict] = field(default_factory=list)
    prediction_target: str = ""       # 预测目标因子名称
    generated_at: str = ""

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "market_query": self.market_query,
            "factor_types": [f.to_dict() for f in self.factor_types],
            "relation_types": [r.to_dict() for r in self.relation_types],
            "raw_causal_relations": self.raw_causal_relations,
            "prediction_target": self.prediction_target,
            "generated_at": self.generated_at,
        }

    def validate(self) -> List[str]:
        """验证本体完整性，返回错误列表"""
        errors = []
        if not 3 <= len(self.factor_types) <= 12:
            errors.append(
                f"因子数量 {len(self.factor_types)} 不在 3-12 范围内"
            )
        if not self.prediction_target:
            errors.append("缺少预测目标因子")
        else:
            factor_names = {f.name for f in self.factor_types}
            if self.prediction_target not in factor_names:
                errors.append(
                    f"预测目标因子 '{self.prediction_target}' 不在因子列表中"
                )
        return errors
