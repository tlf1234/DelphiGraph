"""
DelphiGraph Client - Main SDK interface
"""

import re
from typing import List, Dict, Any, Optional
from datetime import datetime

try:
    import httpx
except ImportError:
    raise ImportError(
        "httpx is required for DelphiGraph SDK. "
        "Install it with: pip install httpx"
    )

from .exceptions import (
    AuthenticationError,
    ValidationError,
    TaskClosedError,
    APIError
)


class DelphiGraphClient:
    """
    Client for interacting with the DelphiGraph signal analysis platform.
    
    Example:
        client = DelphiGraphClient(api_key="your-api-key")
        tasks = await client.get_active_tasks()
        response = await client.submit_signal(
            task_id="task-uuid",
            evidence_text="My analysis...",
            evidence_type="persona_inference"
        )
    """
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://your-project.supabase.co"
    ):
        """
        Initialize the DelphiGraph client.
        
        Args:
            api_key: Your DelphiGraph API key
            base_url: Base URL of the DelphiGraph API (default: Supabase project URL)
            
        Raises:
            ValidationError: If API key format is invalid
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self._validate_api_key()
        
        # Initialize HTTP client
        self._client = httpx.AsyncClient(
            headers={
                "X-API-Key": self.api_key,
                "Content-Type": "application/json"
            },
            timeout=30.0
        )
    
    def _validate_api_key(self) -> None:
        """
        Validate API key format.
        
        Raises:
            ValidationError: If API key format is invalid
        """
        if not self.api_key or not isinstance(self.api_key, str):
            raise ValidationError("API key must be a non-empty string")
        
        # Basic format validation (UUID-like format)
        if len(self.api_key) < 32:
            raise ValidationError("API key format appears invalid (too short)")
    
    async def close(self) -> None:
        """Close the HTTP client connection"""
        await self._client.aclose()
    
    async def __aenter__(self):
        """Async context manager entry"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()
    
    async def get_active_tasks(self) -> List[Dict[str, Any]]:
        """
        获取所有活跃任务。
        
        Returns:
            活跃任务字典列表
            
        Raises:
            AuthenticationError: API密钥无效
            APIError: API请求失败
        """
        try:
            response = await self._client.get(
                f"{self.base_url}/rest/v1/prediction_tasks",
                params={"status": "eq.active", "select": "*"}
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise AuthenticationError("API密钥无效或已过期")
            raise APIError(
                f"获取任务列表失败: {e.response.text}",
                status_code=e.response.status_code,
                response_data=e.response.json() if e.response.text else None
            )
        except httpx.RequestError as e:
            raise APIError(f"网络请求失败: {str(e)}")
    
    async def submit_signal(
        self,
        task_id: str,
        evidence_text: str,
        evidence_type: str = "persona_inference",
        relevance_score: Optional[float] = None,
        entity_tags: Optional[List[Dict[str, str]]] = None,
        source_url: Optional[str] = None,
        user_persona: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        向任务提交信号（v3.0 数据因子）。
        
        Args:
            task_id: 任务的UUID
            evidence_text: 证据原文（端侧已脱敏）
            evidence_type: 证据类型 ('hard_fact' 或 'persona_inference')
            relevance_score: 语义相关度自评 (0-1)
            entity_tags: 实体标注列表 [{"text": ..., "type": ..., "role": ...}]
            source_url: 证据来源URL
            user_persona: 端侧脱敏后的用户画像 {"occupation": ..., "age_range": ..., ...}
            
        Returns:
            包含提交详情的响应字典
            
        Raises:
            ValidationError: 输入无效
            TaskClosedError: 任务已关闭
            AuthenticationError: API密钥无效
            APIError: API请求失败
        """
        # 验证输入
        if not task_id or not isinstance(task_id, str):
            raise ValidationError("task_id必须是非空字符串")
        
        if not evidence_text or not isinstance(evidence_text, str):
            raise ValidationError("evidence_text必须是非空字符串")
        
        if len(evidence_text) > 10000:
            raise ValidationError("evidence_text长度不能超过10000字符")
        
        if relevance_score is not None and not (0 <= relevance_score <= 1):
            raise ValidationError("relevance_score必须在0到1之间")
        
        if evidence_type not in ('hard_fact', 'persona_inference'):
            raise ValidationError("evidence_type必须是 'hard_fact' 或 'persona_inference'")
        
        # 数据脱敏
        sanitized_evidence = sanitize_text(evidence_text)
        
        # 构建请求体
        payload: Dict[str, Any] = {
            "taskId": task_id,
            "evidence_text": sanitized_evidence,
            "evidence_type": evidence_type,
            "privacy_cleared": True,
        }
        # 可选字段
        if relevance_score is not None:
            payload["relevance_score"] = float(relevance_score)
        if entity_tags:
            payload["entity_tags"] = entity_tags
        if source_url:
            payload["source_url"] = source_url
        if user_persona:
            payload["user_persona"] = user_persona
        
        # 提交信号
        try:
            response = await self._client.post(
                f"{self.base_url}/functions/v1/submit-signal",
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise AuthenticationError("API密钥无效或已过期")
            elif e.response.status_code == 409:
                raise TaskClosedError("任务已关闭，无法提交信号")
            elif e.response.status_code == 400:
                error_data = e.response.json() if e.response.text else {}
                raise ValidationError(
                    error_data.get("error", "请求参数无效")
                )
            raise APIError(
                f"提交信号失败: {e.response.text}",
                status_code=e.response.status_code,
                response_data=e.response.json() if e.response.text else None
            )
        except httpx.RequestError as e:
            raise APIError(f"网络请求失败: {str(e)}")
    
    async def get_my_submissions(
        self,
        page: int = 1,
        limit: int = 20,
        task_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        获取用户的信号提交历史。
        
        Args:
            page: 页码 (默认: 1)
            limit: 每页结果数 (默认: 20)
            task_id: 可选的任务ID过滤
            
        Returns:
            包含提交记录和分页信息的字典
            
        Raises:
            AuthenticationError: API密钥无效
            APIError: API请求失败
        """
        params = {
            "page": page,
            "limit": limit
        }
        
        if task_id:
            params["taskId"] = task_id
        
        try:
            response = await self._client.get(
                f"{self.base_url}/functions/v1/get-my-submissions",
                params=params
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise AuthenticationError("API密钥无效或已过期")
            raise APIError(
                f"获取提交历史失败: {e.response.text}",
                status_code=e.response.status_code,
                response_data=e.response.json() if e.response.text else None
            )
        except httpx.RequestError as e:
            raise APIError(f"网络请求失败: {str(e)}")


def sanitize_text(text: str) -> str:
    """
    移除文本中的敏感信息以保护隐私。
    
    移除内容：
    - 邮箱地址
    - 电话号码
    - IP地址
    - 文件路径
    
    Args:
        text: 需要脱敏的文本
        
    Returns:
        脱敏后的文本
        
    Example:
        >>> sanitize_text("联系我：user@example.com 或 555-1234")
        "联系我：[EMAIL] 或 [PHONE]"
    """
    if not text or not isinstance(text, str):
        return text
    
    # 移除邮箱地址
    # 匹配格式: xxx@xxx.xxx
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    text = re.sub(email_pattern, '[EMAIL]', text)
    
    # 移除电话号码
    # 匹配格式: (123) 456-7890, 123-456-7890, 1234567890, +1-123-456-7890
    phone_patterns = [
        r'\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}',  # 国际格式
        r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',  # 美国格式
        r'\d{3}-\d{3}-\d{4}',  # 标准格式
        r'\d{10,11}',  # 纯数字
    ]
    for pattern in phone_patterns:
        text = re.sub(pattern, '[PHONE]', text)
    
    # 移除IP地址
    # IPv4格式: xxx.xxx.xxx.xxx
    ipv4_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    text = re.sub(ipv4_pattern, '[IP]', text)
    
    # IPv6格式
    ipv6_pattern = r'\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b'
    text = re.sub(ipv6_pattern, '[IP]', text)
    
    # 移除文件路径
    # Windows路径: C:\path\to\file
    windows_path_pattern = r'[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+'
    text = re.sub(windows_path_pattern, '[PATH]', text)
    
    # Unix/Linux路径: /path/to/file
    unix_path_pattern = r'/(?:[^/\s]+/)+[^/\s]+'
    text = re.sub(unix_path_pattern, '[PATH]', text)
    
    return text
