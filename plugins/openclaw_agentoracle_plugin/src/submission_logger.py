"""
Submission Logger Module - 提交记录管理

本地保存所有上传到 AgentOracle 平台的数据记录，
让用户可以查看已脱敏的数据，确保没有隐私泄露。
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

# Support both module and direct execution
try:
    from .logger import setup_logger
except ImportError:
    from logger import setup_logger


class SubmissionLogger:
    """提交记录管理器
    
    功能:
    1. 本地保存所有提交记录（JSON 格式）
    2. 记录原始数据和脱敏后数据的对比
    3. 提供查询和统计功能
    4. 自动清理过期记录（可配置）
    """
    
    def __init__(self, log_file: str = "./data/submissions.json", max_records: int = 1000):
        """初始化提交记录管理器
        
        Args:
            log_file: 记录文件路径，默认 ./data/submissions.json（插件目录下）
            max_records: 最大记录数，超过后自动清理旧记录，默认 1000
        """
        self.log_file = Path(log_file).expanduser()
        self.max_records = max_records
        self.logger = setup_logger()
        
        # 确保目录存在
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # 初始化记录文件
        if not self.log_file.exists():
            self._init_log_file()
    
    def _init_log_file(self):
        """初始化记录文件"""
        try:
            initial_data = {
                "version": "2.0.0",  # UAP v3.0 格式
                "created_at": datetime.now().isoformat(),
                "submissions": []
            }
            
            with open(self.log_file, 'w', encoding='utf-8') as f:
                json.dump(initial_data, f, indent=2, ensure_ascii=False)
            
            # 设置文件权限为 0600（仅所有者可读写）
            os.chmod(self.log_file, 0o600)
            
            self.logger.info(f"[SubmissionLogger] 初始化记录文件: {self.log_file}")
            
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 初始化记录文件失败: {e}", exc_info=True)
    
    def log_submission(self, 
                      task_id: str,
                      task_title: str,
                      question: str,
                      original_submission: Dict[str, Any],
                      sanitized_submission: Dict[str, Any],
                      telemetry_data: Dict[str, Any],
                      success: bool) -> None:
        """记录一次提交（UAP v3.0 格式）
        
        Args:
            task_id: 任务 ID
            task_title: 任务标题
            question: 任务问题
            original_submission: 未脱敏的完整 UAP v3.0 payload
                （含 task_id/status/signals/protocol_version 等）
            sanitized_submission: 实际提交的脱敏后完整 UAP v3.0 payload
            telemetry_data: 遥测数据
            success: 提交是否成功
        """
        try:
            # 读取现有记录
            data = self._read_log_file()
            
            # 创建新记录 —— 完整保存 UAP v3.0 提交 payload（不做任何截断/抽字段）
            record = {
                "id": len(data["submissions"]) + 1,
                "timestamp": datetime.now().isoformat(),
                "task_id": task_id,
                "task_title": task_title,
                "question": question,
                "protocol_version": sanitized_submission.get("protocol_version", "3.0"),
                "submission_status": sanitized_submission.get("status", "submitted"),
                "signal_count": len(sanitized_submission.get("signals", [])),
                # 完整的 UAP v3.0 payload（脱敏前 / 脱敏后）
                "original_submission": original_submission,
                "sanitized_submission": sanitized_submission,
                "data_sanitized": self._check_if_sanitized(original_submission, sanitized_submission),
                "telemetry": {
                    "inference_latency_ms": telemetry_data.get("inference_latency_ms", 0),
                    "memory_entropy": telemetry_data.get("memory_entropy", {}),
                    "interaction_heartbeat": telemetry_data.get("interaction_heartbeat", 0)
                },
                "success": success
            }
            
            # 添加记录
            data["submissions"].append(record)
            
            # 清理旧记录（如果超过最大数量）
            if len(data["submissions"]) > self.max_records:
                data["submissions"] = data["submissions"][-self.max_records:]
                self.logger.info(f"[SubmissionLogger] 清理旧记录，保留最近 {self.max_records} 条")
            
            # 写入文件
            self._write_log_file(data)
            
            self.logger.info(f"[SubmissionLogger] 记录提交: {task_id} (成功: {success})")
            
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 记录提交失败: {e}", exc_info=True)
    
    def _check_if_sanitized(self, original: Dict[str, Any], sanitized: Dict[str, Any]) -> bool:
        """检查 UAP v3.0 payload 是否被脱敏
        
        Args:
            original: 未脱敏的 UAP v3.0 payload
            sanitized: 脱敏后的 UAP v3.0 payload
            
        Returns:
            True if data was sanitized, False otherwise
        """
        try:
            def _collect_texts(payload: Dict[str, Any]) -> str:
                """提取 UAP v3.0 payload 中可能含 PII 的文本字段拼接"""
                parts = []
                for sig in (payload.get("signals") or []):
                    parts.append(str(sig.get("evidence_text", "")))
                    parts.append(str(sig.get("relevance_reasoning", "")))
                    parts.append(str(sig.get("source_description", "")))
                persona = payload.get("user_persona") or {}
                if isinstance(persona, dict):
                    for v in persona.values():
                        parts.append(str(v))
                return "\n".join(parts)
            
            return _collect_texts(original) != _collect_texts(sanitized)
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 检查脱敏状态失败: {e}")
            return False
    
    def _read_log_file(self) -> Dict[str, Any]:
        """读取记录文件
        
        Returns:
            记录数据字典
        """
        try:
            with open(self.log_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 读取记录文件失败: {e}", exc_info=True)
            # 返回空数据结构
            return {
                "version": "2.0.0",  # UAP v3.0 格式
                "created_at": datetime.now().isoformat(),
                "submissions": []
            }
    
    def _write_log_file(self, data: Dict[str, Any]) -> None:
        """写入记录文件
        
        Args:
            data: 记录数据字典
        """
        try:
            with open(self.log_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # 确保文件权限为 0600
            os.chmod(self.log_file, 0o600)
            
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 写入记录文件失败: {e}", exc_info=True)
    
    def get_all_submissions(self) -> List[Dict[str, Any]]:
        """获取所有提交记录
        
        Returns:
            提交记录列表
        """
        try:
            data = self._read_log_file()
            return data.get("submissions", [])
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 获取提交记录失败: {e}", exc_info=True)
            return []
    
    def get_recent_submissions(self, count: int = 10) -> List[Dict[str, Any]]:
        """获取最近的提交记录
        
        Args:
            count: 记录数量，默认 10
            
        Returns:
            提交记录列表（最新的在前）
        """
        try:
            submissions = self.get_all_submissions()
            return submissions[-count:][::-1]  # 反转顺序，最新的在前
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 获取最近提交记录失败: {e}", exc_info=True)
            return []
    
    def get_submission_by_id(self, submission_id: int) -> Optional[Dict[str, Any]]:
        """根据 ID 获取提交记录
        
        Args:
            submission_id: 提交记录 ID
            
        Returns:
            提交记录字典，如果不存在返回 None
        """
        try:
            submissions = self.get_all_submissions()
            for submission in submissions:
                if submission.get("id") == submission_id:
                    return submission
            return None
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 获取提交记录失败: {e}", exc_info=True)
            return None
    
    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息
        
        Returns:
            统计信息字典
        """
        try:
            submissions = self.get_all_submissions()
            
            total = len(submissions)
            successful = sum(1 for s in submissions if s.get("success", False))
            failed = total - successful
            sanitized = sum(1 for s in submissions if s.get("data_sanitized", False))
            
            # 统计证据类型分布 —— 遍历 UAP v3.0 signals 数组
            hard_facts = 0
            total_signals = 0
            for s in submissions:
                for sig in (s.get("sanitized_submission", {}).get("signals", []) or []):
                    total_signals += 1
                    if sig.get("evidence_type") == "hard_fact":
                        hard_facts += 1
            
            # 计算平均推理延迟
            latencies = [s.get("telemetry", {}).get("inference_latency_ms", 0) for s in submissions]
            avg_latency = sum(latencies) / len(latencies) if latencies else 0
            
            return {
                "total_submissions": total,
                "successful_submissions": successful,
                "failed_submissions": failed,
                "sanitized_submissions": sanitized,
                "sanitization_rate": (sanitized / total * 100) if total > 0 else 0,
                "success_rate": (successful / total * 100) if total > 0 else 0,
                "hard_fact_count": hard_facts,
                "total_signals": total_signals,
                "average_latency_ms": avg_latency
            }
            
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 获取统计信息失败: {e}", exc_info=True)
            return {
                "total_submissions": 0,
                "successful_submissions": 0,
                "failed_submissions": 0,
                "sanitized_submissions": 0,
                "sanitization_rate": 0,
                "success_rate": 0,
                "hard_fact_count": 0,
                "average_latency_ms": 0
            }
    
    def clear_all_submissions(self) -> bool:
        """清空所有提交记录
        
        Returns:
            True if successful, False otherwise
        """
        try:
            data = {
                "version": "1.0.0",
                "created_at": datetime.now().isoformat(),
                "submissions": []
            }
            
            self._write_log_file(data)
            self.logger.info("[SubmissionLogger] 已清空所有提交记录")
            return True
            
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 清空提交记录失败: {e}", exc_info=True)
            return False
    
    def export_to_file(self, export_path: str) -> bool:
        """导出记录到文件
        
        Args:
            export_path: 导出文件路径
            
        Returns:
            True if successful, False otherwise
        """
        try:
            data = self._read_log_file()
            
            export_file = Path(export_path).expanduser()
            export_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(export_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"[SubmissionLogger] 导出记录到: {export_file}")
            return True
            
        except Exception as e:
            self.logger.error(f"[SubmissionLogger] 导出记录失败: {e}", exc_info=True)
            return False
