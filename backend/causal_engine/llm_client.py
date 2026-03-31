"""
千问 (Qwen) LLM 客户端封装

使用 OpenAI-compatible API 接口调用通义千问大模型。
支持：
- 文本生成（chat completion）
- JSON 结构化输出
- 文本向量化（embedding）
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class QwenLLMClient:
    """千问大模型客户端，基于 OpenAI-compatible API"""

    DEFAULT_MODEL = "qwen-plus"
    DEFAULT_EMBEDDING_MODEL = "text-embedding-v3"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: Optional[str] = None,
        embedding_model: Optional[str] = None,
    ):
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY", "") or os.getenv("QWEN_API_KEY", "")
        self.base_url = base_url
        self.model = model or self.DEFAULT_MODEL
        self.embedding_model = embedding_model or self.DEFAULT_EMBEDDING_MODEL

        if not self.api_key:
            raise ValueError(
                "千问 API Key 未设置。请设置环境变量 DASHSCOPE_API_KEY "
                "或在初始化时传入 api_key 参数。"
            )

        self._client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=120.0,  # 120s 单次调用超时，防止慢请求永久挂起
        )

    async def chat(
        self,
        user_prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """普通文本生成"""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content or ""
            logger.debug("LLM response length: %d chars", len(content))
            return content
        except Exception as e:
            logger.error("LLM chat failed: %s", e)
            raise

    async def chat_json(
        self,
        user_prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4000,
    ) -> Dict[str, Any]:
        """生成结构化 JSON 输出，自动解析"""
        json_system = (system_prompt or "") + "\n\n请严格以 JSON 格式输出，不要包含 markdown 代码块标记。"

        raw = await self.chat(
            user_prompt=user_prompt,
            system_prompt=json_system,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # 剥离 <reasoning>...</reasoning> 前缀（CoT输出）
        cleaned = raw.strip()
        if "<reasoning>" in cleaned:
            end_tag = "</reasoning>"
            pos = cleaned.find(end_tag)
            if pos != -1:
                cleaned = cleaned[pos + len(end_tag):].strip()

        # 清理 markdown 代码块标记
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning("JSON parse failed, attempting recovery: %s", e)
            # 尝试找到第一个 { 和最后一个 }
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"LLM 输出无法解析为 JSON: {raw[:200]}") from e

    async def get_embeddings(
        self,
        texts: List[str],
        batch_size: int = 10,
    ) -> List[List[float]]:
        """获取文本向量化结果"""
        # DashScope 不接受空字符串，用占位符替换后还原
        placeholder = "."
        cleaned = [t.strip() if t and t.strip() else placeholder for t in texts]

        all_embeddings = []
        for i in range(0, len(cleaned), batch_size):
            batch = cleaned[i : i + batch_size]
            try:
                response = await self._client.embeddings.create(
                    model=self.embedding_model,
                    input=batch,
                )
                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)
            except Exception as e:
                logger.error("Embedding failed for batch %d: %s", i, e)
                raise
        return all_embeddings

    async def close(self):
        """关闭客户端连接"""
        await self._client.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
