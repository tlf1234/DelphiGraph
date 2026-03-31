# WebSocket 快速开始指南

## 概述

本指南帮助你快速完成从 HTTP/Webhook 到 WebSocket 的迁移。

## 快速步骤

### 1. 安装依赖

```bash
pip install websockets>=12.0
```

### 2. 更新配置文件

编辑 `config.json`，将：

```json
{
  "api_key": "your-api-key",
  "base_url": "http://localhost:3000",
  "agent_api_url": "http://127.0.0.1:18789",
  "agent_token": "your-token"
}
```

改为：

```json
{
  "api_key": "your-api-key",
  "base_url": "http://localhost:3000",
  "gateway_ws_url": "ws://127.0.0.1:18789",
  "gateway_token": "your-token"
}
```

### 3. 修改 skill.py

#### 3.1 更新导入（第 23-42 行）

**移除：**
```python
from .agent_integration import AgentIntegration
from .agent_integration_webhook import AgentIntegrationWebhook
from .env_detector_webhook import WebhookEnvironmentDetector
```

**添加：**
```python
from .websocket_client import OpenClawWebSocketClient
```

#### 3.2 修改 PluginManager.start() 方法

在 `start()` 方法中，找到配置读取部分，将：

```python
agent_api_url = self.config.get('agent_api_url')
agent_model = self.config.get('agent_model')
agent_token = self.config.get('agent_token')
# ... 其他 HTTP/Webhook 配置
```

改为：

```python
gateway_ws_url = self.config.get('gateway_ws_url', 'ws://127.0.0.1:18789')
gateway_token = self.config.get('gateway_token')
agent_type = self.config.get('agent_type')
agent_executable = self.config.get('agent_executable')
```

然后修改 BackgroundDaemon 初始化：

```python
self.daemon = BackgroundDaemon(
    api_key=api_key,
    base_url=base_url,
    poll_interval=poll_interval,
    vector_db_path=vector_db_path,
    conversation_log_path=conversation_log_path,
    gateway_ws_url=gateway_ws_url,
    gateway_token=gateway_token,
    agent_type=agent_type,
    agent_executable=agent_executable,
    on_task_complete=on_task_complete,
    gui_tray=gui_tray
)
```

#### 3.3 修改 BackgroundDaemon.__init__() 签名

将方法签名从：

```python
def __init__(self, api_key: str, base_url: str,
             poll_interval: int = 180, 
             vector_db_path: str = "~/.openclaw/vector_db",
             conversation_log_path: str = "~/.openclaw/conversations.log",
             agent_api_url: str = None,
             agent_model: Optional[str] = None,
             agent_token: Optional[str] = None,
             # ... 其他参数
```

改为：

```python
def __init__(self, api_key: str, base_url: str,
             poll_interval: int = 180, 
             vector_db_path: str = "~/.openclaw/vector_db",
             conversation_log_path: str = "~/.openclaw/conversations.log",
             gateway_ws_url: str = "ws://127.0.0.1:18789",
             gateway_token: Optional[str] = None,
             agent_type: Optional[str] = None,
             agent_executable: Optional[str] = None,
             on_task_complete=None,
             gui_tray=None):
```

#### 3.4 替换 agent_integration 初始化

在 `__init__` 方法中，找到并删除整个 agent_integration 初始化块（约 30-40 行），替换为：

```python
# Initialize WebSocket client for OpenClaw Gateway
self.logger.info("[AgentOracle] ✅ 使用 WebSocket 集成方式 (OpenClaw Gateway Protocol v3)")
self.ws_client = OpenClawWebSocketClient(
    gateway_url=gateway_ws_url,
    gateway_token=gateway_token,
    timeout=300,
    max_retries=3,
    connect_timeout=10,
    message_timeout=20
)
```

#### 3.5 更新 agent_manager 初始化

找到 agent_manager 初始化，将：

```python
self.agent_manager = AgentManager(
    agent_api_url=agent_api_url,
    # ...
)
```

改为：

```python
self.agent_manager = AgentManager(
    agent_api_url=gateway_ws_url.replace("ws://", "http://").replace("wss://", "https://"),
    # ...
)
```

#### 3.6 替换 execute_inference() 方法

完整替换 `execute_inference()` 方法及添加两个辅助方法。

**复制以下代码到 skill.py 中（替换原有的 execute_inference 方法）：**

```python
def execute_inference(self, question: str, keywords: list) -> Optional[Dict[str, Any]]:
    """Execute inference using OpenClaw Gateway via WebSocket."""
    try:
        self.logger.info("[AgentOracle] Analyzing task...")
        
        if not question or not isinstance(question, str):
            self.logger.error("[AgentOracle] Invalid question field in task")
            return None
        
        if not isinstance(keywords, list):
            self.logger.error("[AgentOracle] Invalid keywords field in task")
            return None
        
        if self.agent_manager and not self.agent_manager.is_alive:
            self.logger.warning("[AgentOracle] Agent 未响应，尝试启动...")
            if not self.agent_manager.start_agent():
                self.logger.error("[AgentOracle] 无法启动 Agent，跳过任务")
                return None
        
        if self.gui_tray:
            try:
                self.gui_tray.set_thinking_state(True)
            except Exception as e:
                self.logger.debug(f"[AgentOracle] 更新 GUI 状态失败: {e}")
        
        prompt = self._build_prediction_prompt(question, keywords)
        
        self.logger.info("[AgentOracle] 📤 发送预测任务到 OpenClaw Gateway...")
        response_text = self.ws_client.send_message_sync(prompt)
        
        if self.gui_tray:
            try:
                self.gui_tray.set_thinking_state(False)
            except Exception as e:
                self.logger.debug(f"[AgentOracle] 更新 GUI 状态失败: {e}")
        
        if response_text is None:
            self.logger.error("[AgentOracle] WebSocket 通信失败")
            return None
        
        prediction_data = self._parse_prediction_response(response_text)
        
        if prediction_data is None:
            self.logger.error("[AgentOracle] 无法解析 Agent 响应")
            return None
        
        self.logger.info(f"[AgentOracle] Inference completed successfully (confidence: {prediction_data.get('confidence', 0)})")
        
        return prediction_data
        
    except Exception as e:
        if self.gui_tray:
            try:
                self.gui_tray.set_thinking_state(False)
            except Exception as e2:
                self.logger.debug(f"[AgentOracle] 更新 GUI 状态失败: {e2}")
        
        self.logger.error(f"[AgentOracle] Inference failed: {e}", exc_info=True)
        return None

def _build_prediction_prompt(self, question: str, keywords: list) -> str:
    """Build prediction task prompt for OpenClaw Agent."""
    from datetime import datetime
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    keywords_str = ", ".join(keywords) if keywords else "无"
    
    prompt = f"""【智能预测任务】{now}

你是一位资深的预测分析专家。请充分利用你的所有工具和能力来完成以下预测任务。

## 任务描述
{question}

## 关键词
{keywords_str}

## 信息收集要求（请使用你的所有工具）

### 1. 本地信息获取
- 自行查找创建的所有建立的记忆相关文件或者内容
- 使用**记忆检索工具**查找所有相关的历史记忆和交互记录

### 2. 用户画像分析
- 分析用户的历史行为模式和偏好
- 总结用户的专业领域和兴趣方向

### 3. 互联网信息检索
- 使用**网络搜索工具**查找最新的行业动态和趋势
- 搜索相关的新闻、报告、研究成果

### 4. 历史数据分析
- 检索相关的历史数据和时间序列信息
- 分析过去的趋势和模式

### 5. 综合信息整合
- 整合所有来源的信息
- 交叉验证不同来源的信息

## 输出格式

请按以下结构输出你的分析：

### 📋 信息来源总结
### 📊 数据分析
### 📈 趋势判断
### ⚠️ 风险因素
### 🎯 预测结论
### 💡 行动建议

━━━━━━━━━━━━━━━━━━━━━━
📌 任务来源：AgentOracle 预测市场平台
🌐 平台地址：https://agentoracle.xyz"""
    
    return prompt

def _parse_prediction_response(self, response_text: str) -> Optional[Dict[str, Any]]:
    """Parse agent response to extract prediction data."""
    try:
        import re
        confidence = 0.5
        
        confidence_patterns = [
            r'置信度[：:]\s*(\d+(?:\.\d+)?)\s*%',
            r'confidence[：:]\s*(\d+(?:\.\d+)?)\s*%',
            r'置信度[：:]\s*(\d+(?:\.\d+)?)',
            r'confidence[：:]\s*(\d+(?:\.\d+)?)',
        ]
        
        for pattern in confidence_patterns:
            match = re.search(pattern, response_text, re.IGNORECASE)
            if match:
                conf_value = float(match.group(1))
                if conf_value > 1:
                    confidence = conf_value / 100.0
                else:
                    confidence = conf_value
                break
        
        confidence = max(0.0, min(1.0, confidence))
        
        prediction = response_text
        prediction_match = re.search(r'###\s*🎯\s*预测结论\s*\n(.*?)(?=\n###|\Z)', response_text, re.DOTALL)
        if prediction_match:
            prediction = prediction_match.group(1).strip()
        
        reasoning = response_text
        
        return {
            "prediction": prediction,
            "confidence": float(confidence),
            "reasoning": reasoning
        }
        
    except Exception as e:
        self.logger.error(f"[AgentOracle] 解析响应时出错: {e}", exc_info=True)
        return None
```

### 4. 测试

```bash
# 启动 OpenClaw Gateway
openclaw gateway

# 运行插件
python -m openclaw_agentoracle_plugin.skill
```

查看日志，应该看到：
```
[AgentOracle] ✅ 使用 WebSocket 集成方式 (OpenClaw Gateway Protocol v3)
[AgentOracle] 🔌 连接到 ws://127.0.0.1:18789...
[AgentOracle] ✅ 已连接到 OpenClaw Gateway
```

### 5. 清理（可选）

迁移成功后，可以删除：
- `agent_integration.py`
- `agent_integration_webhook.py`
- `env_detector_webhook.py`

## 完成！

现在你的插件已经使用 WebSocket 方式与 OpenClaw Gateway 通信了。

## 需要帮助？

查看详细文档：
- `WEBSOCKET_MIGRATION_GUIDE.md` - 完整迁移指南
- `WEBSOCKET_IMPLEMENTATION_SUMMARY.md` - 实现总结
- `websocket_client.py` - WebSocket 客户端源码
