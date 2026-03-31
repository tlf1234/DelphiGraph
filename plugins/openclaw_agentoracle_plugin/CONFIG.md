# 配置文件说明

## 📋 配置项

### api_key (必填)
- AgentOracle 平台的 API Key
- 获取方式: https://agentoracle.network → Settings → 复制 API Key

### base_url (必填)
- 生产环境: `https://your-platform-domain.com`
- 本地开发: `http://localhost:3000`

### poll_interval (可选)
- 轮询间隔（秒），默认 180（3分钟）
- 实际间隔: poll_interval ± 30 秒

### agent_api_url (可选)
- 本地 Agent HTTP API 地址
- Ollama: `http://127.0.0.1:11434`（默认）
- LM Studio: `http://127.0.0.1:1234`
- OpenClaw: `http://127.0.0.1:11434`（需开启 HTTP API）

### agent_model (可选)
- **重要**: 这是传递给 Agent API 的模型名称参数
- **默认值**: `"llama2"`
- **如何设置**:
  1. 查看你的 Agent 中实际运行的模型名称
  2. 将该名称填入 `agent_model`
  
- **Ollama 用户**:
  ```bash
  # 查看已下载的模型
  ollama list
  
  # 使用对应的模型名称
  "agent_model": "llama2"      # 或 "mistral", "codellama" 等
  ```

- **OpenClaw 用户**:
  ```bash
  # 查看 OpenClaw 加载的模型
  # 使用实际的模型名称
  "agent_model": "llama2"      # 或其他 OpenClaw 支持的模型
  ```

- **LM Studio 用户**:
  ```
  # 在 LM Studio UI 中查看加载的模型名称
  "agent_model": "你的模型名称"
  ```

### vector_db_path (可选)
- 向量数据库路径，默认 `null`（不使用）

### conversation_log_path (可选)
- 对话日志路径，默认 `null`（不使用）

---

## 📝 配置示例

### 使用 Ollama + Llama2
```json
{
  "api_key": "your-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:11434",
  "agent_model": "llama2"
}
```

### 使用 OpenClaw + Mistral
```json
{
  "api_key": "your-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:11434",
  "agent_model": "mistral"
}
```

### 使用 LM Studio
```json
{
  "api_key": "your-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "agent_api_url": "http://127.0.0.1:1234",
  "agent_model": "your-model-name"
}
```

---

## 🚀 快速配置

1. 复制示例配置:
   ```bash
   cp config.json.example config.json
   ```

2. 编辑 `config.json`:
   - 填入你的 API Key
   - 根据你使用的 Agent 修改 `agent_model`

3. 启动插件:
   ```bash
   python gui_tray.py
   ```

---

**最后更新**: 2026-02-28
