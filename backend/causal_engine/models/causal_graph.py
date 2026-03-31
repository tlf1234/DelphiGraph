"""
因果逻辑图数据模型

定义因果图的节点（因子）、边（因果关系）和完整图结构。
预测结论（direction/confidence）由平台宏观大脑的推演引擎生成。
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass
class ClusterNode:
    """聚类节点（Layer 3）- 主题聚合层"""
    cluster_id: str = ""
    theme: str = ""                       # 主题标签
    description: str = ""                 # 主题描述
    sentiment: str = "neutral"            # positive / negative / neutral
    anchor_entities: List[str] = field(default_factory=list)
    
    # 证据统计
    signal_count: int = 0
    hard_fact_count: int = 0
    persona_count: int = 0
    
    # 质量评分
    avg_quality_score: float = 0.0        # 簇内信号平均质量
    relevance_score: float = 0.0          # 与预测问题的相关度
    
    # 特殊标记
    is_minority: bool = False             # 是否为少数派聚类
    
    # 人群画像分布（UAP v2.0）
    persona_distribution: Dict = field(default_factory=dict)
    
    # 溯源
    signal_ids: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.cluster_id:
            self.cluster_id = f"cluster_{uuid.uuid4().hex[:12]}"
    
    def to_dict(self) -> Dict:
        return {
            "id": self.cluster_id,
            "name": self.theme,
            "description": self.description,
            "sentiment": self.sentiment,
            "anchor_entities": self.anchor_entities,
            "signal_count": self.signal_count,
            "hard_fact_count": self.hard_fact_count,
            "persona_count": self.persona_count,
            "avg_quality_score": round(self.avg_quality_score, 4),
            "relevance_score": round(self.relevance_score, 4),
            "is_minority": self.is_minority,
            "persona_distribution": self.persona_distribution,
            "signal_ids": self.signal_ids,
        }


@dataclass
class CausalNode:
    """因果因子节点（Layer 4）- 因果抽象层"""
    node_id: str = ""
    name: str = ""
    description: str = ""
    category: str = ""                    # macro_economic / sentiment / behavior / policy / event / other

    # 证据统计
    hard_fact_count: int = 0
    persona_count: int = 0
    total_evidence_count: int = 0

    # 评分
    confidence: float = 0.0               # 因子置信度（证据质量加权）
    impact_score: float = 0.0             # 对预测目标的影响强度

    # 方向（由平台基于入边加权投票计算）
    evidence_direction: str = "neutral"   # bullish / bearish / neutral

    # 特殊标记
    is_prediction_target: bool = False
    is_minority_driven: bool = False

    # 溯源：来源聚类
    source_cluster_ids: List[str] = field(default_factory=list)
    
    # 证据溯源
    evidence_ids: List[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.node_id:
            self.node_id = f"node_{uuid.uuid4().hex[:12]}"

    def to_dict(self) -> Dict:
        return {
            "id": self.node_id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "hard_fact_count": self.hard_fact_count,
            "persona_count": self.persona_count,
            "total_evidence_count": self.total_evidence_count,
            "confidence": round(self.confidence, 4),
            "impact_score": round(self.impact_score, 4),
            "evidence_direction": self.evidence_direction,
            "is_target": self.is_prediction_target,
            "is_minority": self.is_minority_driven,
            "source_cluster_ids": self.source_cluster_ids,
            "evidence_ids": self.evidence_ids,
        }


@dataclass
class ClusterEdge:
    """聚类到因子的映射边（Layer 3 → Layer 4）"""
    edge_id: str = ""
    source_cluster_id: str = ""
    target_factor_id: str = ""
    
    # 映射强度
    mapping_score: float = 0.0            # 聚类主题与因子的匹配度
    signal_contribution: int = 0          # 该聚类贡献的信号数量
    
    def __post_init__(self):
        if not self.edge_id:
            self.edge_id = f"edge_cf_{uuid.uuid4().hex[:12]}"
    
    def to_dict(self) -> Dict:
        return {
            "id": self.edge_id,
            "source": self.source_cluster_id,
            "target": self.target_factor_id,
            "mapping_score": round(self.mapping_score, 4),
            "signal_contribution": self.signal_contribution,
        }


@dataclass
class CausalEdge:
    """因果关系边（Layer 4 内部 & Layer 4 → Layer 5）"""
    edge_id: str = ""
    source_node_id: str = ""
    target_node_id: str = ""
    relation_type: str = ""               # DRIVES / INHIBITS / AMPLIFIES / TRIGGERS / CORRELATES_WITH / MITIGATES

    # 权重
    weight: float = 0.0
    strength: str = "moderate"            # strong / moderate / weak
    direction: str = "positive"           # positive / negative / neutral

    # 证据溯源
    evidence_count: int = 0
    hard_fact_ratio: float = 0.0
    reasoning: str = ""
    evidence_ids: List[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.edge_id:
            self.edge_id = f"edge_{uuid.uuid4().hex[:12]}"

    def to_dict(self) -> Dict:
        return {
            "id": self.edge_id,
            "source": self.source_node_id,
            "target": self.target_node_id,
            "relation": self.relation_type,
            "weight": round(self.weight, 4),
            "strength": self.strength,
            "direction": self.direction,
            "evidence_count": self.evidence_count,
            "hard_fact_ratio": round(self.hard_fact_ratio, 4),
            "reasoning": self.reasoning,
        }


@dataclass
class CausalGraph:
    """完整的5层因果逻辑图"""
    graph_id: str = ""
    task_id: str = ""
    market_query: str = ""

    # Layer 3: 聚类层（5-15个主题聚类）
    cluster_nodes: List[ClusterNode] = field(default_factory=list)
    
    # Layer 4: 因子层（5-8个因果因子）
    nodes: List[CausalNode] = field(default_factory=list)
    
    # 边：聚类→因子映射
    cluster_edges: List[ClusterEdge] = field(default_factory=list)
    
    # 边：因子间因果关系
    edges: List[CausalEdge] = field(default_factory=list)

    # 预测结论（由推演引擎生成）
    prediction_target_node_id: str = ""
    prediction_direction: str = ""        # bullish / bearish / neutral
    prediction_confidence: float = 0.0
    confidence_interval: Dict = field(default_factory=dict)

    # 分析结果
    critical_paths: List[List[str]] = field(default_factory=list)
    minority_warning: Optional[str] = None
    minority_node_ids: List[str] = field(default_factory=list)
    raw_conclusion: Dict = field(default_factory=dict)  # LLM推演完整输出（含key_drivers等）

    # 元数据
    version: int = 1
    total_signals_used: int = 0
    hard_fact_count: int = 0
    persona_count: int = 0
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        if not self.graph_id:
            self.graph_id = f"cg_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now

    def get_node_by_id(self, node_id: str) -> Optional[CausalNode]:
        return next((n for n in self.nodes if n.node_id == node_id), None)

    def get_target_node(self) -> Optional[CausalNode]:
        return next((n for n in self.nodes if n.is_prediction_target), None)

    def to_dict(self) -> Dict:
        """序列化为前端可用的 JSON - 5层图谱结构"""
        node_name_map = {n.node_id: n.name for n in self.nodes}
        cluster_name_map = {c.cluster_id: c.theme for c in self.cluster_nodes}
        
        return {
            "graph_id": self.graph_id,
            "task_id": self.task_id,
            "market_query": self.market_query,
            
            # Layer 3: 聚类节点
            "cluster_nodes": [c.to_dict() for c in self.cluster_nodes],
            
            # Layer 4: 因子节点
            "nodes": [n.to_dict() for n in self.nodes],
            
            # 聚类→因子映射边
            "cluster_edges": [
                {**e.to_dict(),
                 "source_name": cluster_name_map.get(e.source_cluster_id, ""),
                 "target_name": node_name_map.get(e.target_factor_id, "")}
                for e in self.cluster_edges
            ],
            
            # 因子间因果关系边
            "edges": [
                {**e.to_dict(),
                 "source_name": node_name_map.get(e.source_node_id, ""),
                 "target_name": node_name_map.get(e.target_node_id, "")}
                for e in self.edges
            ],
            
            "prediction": {
                "target_node_id": self.prediction_target_node_id,
                "direction": self.prediction_direction,
                "confidence": round(self.prediction_confidence, 4),
                "confidence_interval": self.confidence_interval,
            },
            "critical_paths": self.critical_paths,
            "minority": {
                "warning": self.minority_warning,
                "node_ids": self.minority_node_ids,
                "cluster_ids": [c.cluster_id for c in self.cluster_nodes if c.is_minority],
            },
            "meta": {
                "version": self.version,
                "total_signals": self.total_signals_used,
                "hard_facts": self.hard_fact_count,
                "personas": self.persona_count,
                "cluster_count": len(self.cluster_nodes),
                "factor_count": len(self.nodes),
                "created_at": self.created_at,
                "updated_at": self.updated_at,
            },
        }
