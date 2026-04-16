"""
Supabase 客户端封装

提供因果引擎与 Supabase 数据库的交互接口：
- 读取待分析的任务和 signal_submissions（UAP v3.0）
- 存储因果分析结果
- 更新任务分析状态
"""

import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    from supabase import create_client, Client
except ImportError:
    raise ImportError(
        "supabase-py is required. Install it with: pip install supabase"
    )

logger = logging.getLogger(__name__)


class SupabaseManager:
    """Supabase 数据库管理器
    
    设计模式:
        - 单例模式：全局共享一个数据库连接
        - 封装模式：隐藏 Supabase SDK 的复杂性
    
    连接管理:
        - 使用 Service Role Key（绕过 RLS，后端专用）
        - 支持环境变量配置
        - 自动重连机制（由 Supabase SDK 处理）
    """

    def __init__(
        self,
        url: Optional[str] = None,
        service_key: Optional[str] = None,
    ):
        """初始化 Supabase 客户端
        
        参数:
            url: Supabase 项目 URL（可选，默认从环境变量读取）
            service_key: Service Role Key（可选，默认从环境变量读取）
        
        环境变量:
            SUPABASE_URL: Supabase 项目 URL
            SUPABASE_SERVICE_ROLE_KEY: 服务端密钥（绕过 RLS）
        
        注意:
            Service Role Key 拥有完全权限，仅用于后端服务，
            切勿暴露到前端或公开代码库。
        """
        self.url = url or os.getenv("SUPABASE_URL", "")
        self.service_key = service_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

        if not self.url or not self.service_key:
            raise ValueError(
                "Supabase 配置缺失。请设置环境变量 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY"
            )

        self.client: Client = create_client(self.url, self.service_key)
        logger.info("Supabase client initialized: %s", self.url)

    # ------------------------------------------------------------------
    # 读取操作
    # ------------------------------------------------------------------

    def get_pending_tasks(self) -> List[Dict[str, Any]]:
        """获取待分析的任务列表
        
        查询条件:
            - status = 'active'（任务处于活跃状态）
            - causal_analysis_status = 'pending'（等待因果分析）
        
        用途:
            后台轮询任务调用此方法，自动发现需要分析的任务
        
        返回:
            任务列表，每个任务包含 id, title, description 等字段
        """
        response = (
            self.client.table("prediction_tasks")
            .select("id, title, question, description, status, causal_analysis_status, "
                    "last_analysis_at")
            .eq("status", "active")
            .eq("causal_analysis_status", "pending")
            .execute()
        )
        return response.data or []

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取单个任务的完整信息
        
        参数:
            task_id: 任务 ID
        
        返回:
            任务详细信息（所有字段），如果不存在则返回 None
        
        用途:
            在执行因果分析前，获取任务的标题、描述、状态等信息
        """
        response = (
            self.client.table("prediction_tasks")
            .select("*")
            .eq("id", task_id)
            .single()
            .execute()
        )
        return response.data

    def get_signal_submissions_for_task(
        self, task_id: str
    ) -> List[Dict[str, Any]]:
        """获取某任务的全量信号提交（UAP v3.0，分页）
        
        参数:
            task_id: 任务 ID
        
        返回:
            全量信号提交列表，每条包含:
                - id, task_id, user_id, status, signals (JSONB)
                - user_persona, abstain_reason
                - model_name, plugin_version, privacy_cleared
                - protocol_version, submitted_at
        
        排序:
            submitted_at 降序（最新的在前）
        
        分页:
            每页 PAGE_SIZE 条，循环直到取完所有数据。
            使用 .limit().offset() 而非 .range()，兼容性更好。
        """
        PAGE_SIZE = 200
        SELECT_FIELDS = (
            "id, task_id, user_id, status, signals, "
            "user_persona, abstain_reason, "
            "model_name, plugin_version, privacy_cleared, "
            "protocol_version, submitted_at"
        )

        # ── 诊断：先用 COUNT 查询获取实际行数 ──
        count_resp = (
            self.client.table("signal_submissions")
            .select("id", count="exact")
            .eq("task_id", task_id)
            .eq("status", "submitted")
            .execute()
        )
        expected_count = count_resp.count or 0
        logger.info(
            "get_signal_submissions_for_task: task=%s, COUNT 查询 = %d 条",
            task_id, expected_count,
        )

        # ── 分页获取全量数据（使用 .limit().offset()）──
        all_submissions: List[Dict[str, Any]] = []
        offset = 0
        page_num = 0

        while True:
            response = (
                self.client.table("signal_submissions")
                .select(SELECT_FIELDS)
                .eq("task_id", task_id)
                .eq("status", "submitted")
                .order("submitted_at", desc=True)
                .limit(PAGE_SIZE)
                .offset(offset)
                .execute()
            )
            page = response.data or []
            page_num += 1
            logger.debug(
                "  分页获取 page=%d offset=%d 返回=%d 条",
                page_num, offset, len(page),
            )
            all_submissions.extend(page)
            if len(page) < PAGE_SIZE:
                break
            offset += PAGE_SIZE

        fetched = len(all_submissions)

        # ── 校验：COUNT 与实际获取数是否一致 ──
        if fetched < expected_count:
            logger.warning(
                "⚠ 数据获取不完整: COUNT=%d 但分页仅获取 %d 条 (差 %d 条)。"
                "可能是 PostgREST max_rows 限制或响应截断。尝试用 id 游标方式补取...",
                expected_count, fetched, expected_count - fetched,
            )
            # 备用方案：按 id 排序获取剩余数据
            fetched_ids = {s["id"] for s in all_submissions}
            fallback_offset = 0
            while len(all_submissions) < expected_count:
                fb_resp = (
                    self.client.table("signal_submissions")
                    .select(SELECT_FIELDS)
                    .eq("task_id", task_id)
                    .eq("status", "submitted")
                    .order("id")
                    .limit(PAGE_SIZE)
                    .offset(fallback_offset)
                    .execute()
                )
                fb_page = fb_resp.data or []
                if not fb_page:
                    break
                for row in fb_page:
                    if row["id"] not in fetched_ids:
                        all_submissions.append(row)
                        fetched_ids.add(row["id"])
                fallback_offset += PAGE_SIZE
                if len(fb_page) < PAGE_SIZE:
                    break
            if len(all_submissions) > fetched:
                logger.info(
                    "  ✅ 备用方案补取 %d 条，总计 %d 条",
                    len(all_submissions) - fetched, len(all_submissions),
                )

        logger.info(
            "get_signal_submissions_for_task: task=%s, 共获取 %d 条提交"
            "（COUNT=%d, %d 页）",
            task_id, len(all_submissions), expected_count, page_num,
        )
        return all_submissions

    def get_signal_submission_count(self, task_id: str) -> int:
        """获取某任务的信号提交总数（v3.0）"""
        response = (
            self.client.table("signal_submissions")
            .select("id", count="exact")
            .eq("task_id", task_id)
            .eq("status", "submitted")
            .execute()
        )
        return response.count or 0

    # ------------------------------------------------------------------
    # 写入操作
    # ------------------------------------------------------------------

    def update_task_analysis_status(
        self,
        task_id: str,
        status: str,
        submission_count: Optional[int] = None,
    ):
        """更新任务的因果分析状态
        
        参数:
            task_id: 任务 ID
            status: 新状态（pending | processing | completed）
            submission_count: 信号提交数量（仅在 completed 时记录）
        
        状态流转:
            pending → processing → completed
            pending → processing → pending（分析失败，回退）
        
        副作用:
            - 更新 causal_analysis_status 字段
            - 更新 updated_at 时间戳
            - 如果状态为 completed，记录 last_analysis_at 和提交数量
        
        用途:
            - 防止重复分析（processing 状态锁）
            - 追踪分析历史
            - 前端状态显示
        """
        update_data: Dict[str, Any] = {
            "causal_analysis_status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if status == "completed":
            update_data["last_analysis_at"] = datetime.utcnow().isoformat()
            if submission_count is not None:
                update_data["submission_count_at_last_analysis"] = submission_count

        try:
            self.client.table("prediction_tasks").update(update_data).eq("id", task_id).execute()
        except Exception as _upd_err:
            # Fallback: column may not exist in older DB schemas — retry without optional field
            update_data.pop("submission_count_at_last_analysis", None)
            self.client.table("prediction_tasks").update(update_data).eq("id", task_id).execute()
        logger.info("Task %s analysis status -> %s", task_id, status)

    def save_causal_analysis(
        self,
        task_id: str,
        result: Dict[str, Any],
        is_final: bool = False,
        triggered_by: str = "auto",
    ) -> Dict[str, Any]:
        """保存因果分析结果到数据库
        
        参数:
            task_id: 任务 ID
            result: 分析结果（来自 CausalEngineOrchestrator.analyze()）
            is_final: 是否为最终分析（vs 增量分析）
            triggered_by: 触发方式（“auto” 后台轮询 | “manual” 手动触发）
        
        版本控制机制:
            1. 将旧的 is_latest 标记为 False（保留历史版本）
            2. 计算新版本号（自动递增）
            3. 插入新记录，标记为 is_latest = True
        
        保存内容:
            - graph_data: 因果图谱（5层结构：Agent→Signal→Cluster→Factor→Target）
            - conclusion: 分析结论（方向、置信度）
            - newspaper_content: 未来报纸
            - preprocess_summary: 预处理摘要（包含聚类详情）
            - ontology_data: 因果本体
            - version: 版本号
            - is_final: 是否最终版本
        
        返回:
            插入的记录
        """
        # ══════════════════════════════════════════════════════════════
        # Step 1: 将旧版本标记为非最新（带重试，防止长时运行后 SSL 连接过期）
        # ══════════════════════════════════════════════════════════════
        _last_err = None
        for _attempt in range(3):
            try:
                self.client.table("causal_analyses").update(
                    {"is_latest": False}
                ).eq("task_id", task_id).eq("is_latest", True).execute()
                break
            except Exception as _e:
                _last_err = _e
                logger.warning("save_causal_analysis Step1 retry %d/3: %s", _attempt + 1, _e)
                time.sleep(2 ** _attempt)
        else:
            raise _last_err

        # ══════════════════════════════════════════════════════════════
        # Step 2: 计算新版本号（自动递增）
        # ══════════════════════════════════════════════════════════════
        existing = (
            self.client.table("causal_analyses")
            .select("version")
            .eq("task_id", task_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        next_version = (existing.data[0]["version"] + 1) if existing.data else 1

        # ══════════════════════════════════════════════════════════════
        # Step 3: 插入新分析记录
        # ══════════════════════════════════════════════════════════════
        _graph_data = result.get("graph") or {}
        _nodes = _graph_data.get("nodes", [])
        _edges = _graph_data.get("edges", [])
        _node_by_type: dict = {}
        for _n in _nodes:
            _t = _n.get("node_type", "?")
            _node_by_type[_t] = _node_by_type.get(_t, 0) + 1
        _newspaper = result.get("newspaper") or ""
        logger.info(
            "\n── DB 保存因果分析 ──────────────────────────────────────\n"
            "  task_id    : %s\n"
            "  version    : v%d  (is_final=%s  triggered_by=%s)\n"
            "  status     : %s\n"
            "  信号数量   : %d  (hard=%d / persona=%d)\n"
            "  图谱节点   : %d 总计  %s\n"
            "  图谱边     : %d 条\n"
            "  未来报纸   : %d 字%s\n"
            "─────────────────────────────────────────────────────────",
            task_id,
            next_version, is_final, triggered_by,
            result.get("status", "?"),
            result.get("preprocess_summary", {}).get("total_signals", 0),
            result.get("preprocess_summary", {}).get("hard_fact_count", 0),
            result.get("preprocess_summary", {}).get("persona_count", 0),
            len(_nodes),
            "  ".join(f"{k}×{v}" for k, v in sorted(_node_by_type.items())),
            len(_edges),
            len(_newspaper),
            "  [已生成]" if _newspaper else "  [未生成]",
        )
        insert_data = {
            "task_id": task_id,
            "status": result.get("status", "completed"),
            "signal_count": result.get("preprocess_summary", {}).get("total_signals", 0),
            "hard_fact_count": result.get("preprocess_summary", {}).get("hard_fact_count", 0),
            "persona_count": result.get("preprocess_summary", {}).get("persona_count", 0),
            "graph_data": result.get("graph"),  # 5层图谱（Agent→Signal→Cluster→Factor→Target）
            "ontology_data": result.get("ontology"),  # 因果本体
            "conclusion": result.get("conclusion"),  # 分析结论
            "preprocess_summary": result.get("preprocess_summary"),  # 预处理摘要
            "newspaper_content": result.get("newspaper"),  # 未来报纸
            "is_final": is_final,  # 是否最终分析
            "is_latest": True,  # 标记为最新版本
            "version": next_version,  # 版本号
            "elapsed_seconds": result.get("meta", {}).get("elapsed_seconds"),  # 耗时
            "error_message": result.get("error"),  # 错误信息（如果有）
            "triggered_by": triggered_by,  # 触发方式
        }

        response = (
            self.client.table("causal_analyses")
            .insert(insert_data)
            .execute()
        )
        saved = response.data[0] if response.data else {}
        logger.info(
            "✅ DB 写入成功  task=%s  v%d  record_id=%s  is_final=%s",
            task_id, next_version,
            saved.get("id", "?"),
            is_final,
        )
        return saved

    def get_latest_analysis(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取某任务最新的因果分析结果
        
        参数:
            task_id: 任务 ID
        
        返回:
            最新的分析结果（is_latest = True），包含完整的图谱、结论、报纸等
        
        用途:
            前端展示最新分析结果
        """
        response = (
            self.client.table("causal_analyses")
            .select("*")
            .eq("task_id", task_id)
            .eq("is_latest", True)
            .single()
            .execute()
        )
        return response.data

    def get_analysis_history(
        self, task_id: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """获取分析历史记录
        
        参数:
            task_id: 任务 ID
            limit: 最大返回数量（默认 20）
        
        返回:
            历史分析列表，按版本号倒序排列（最新的在前）
            每条记录包含: version, status, signal_count, is_final, elapsed_seconds
        
        用途:
            - 前端展示分析历史时间线
            - 对比不同版本的分析结果
            - 追踪分析质量变化趋势
        """
        response = (
            self.client.table("causal_analyses")
            .select("id, version, status, signal_count, is_final, "
                    "elapsed_seconds, created_at")
            .eq("task_id", task_id)
            .order("version", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []
