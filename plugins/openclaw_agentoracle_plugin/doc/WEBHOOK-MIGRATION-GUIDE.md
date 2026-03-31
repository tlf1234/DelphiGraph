# Webhook 方式迁移指南

## 迁移概述

本指南说明如何将 OpenClaw AgentOracle 插件从 HTTP API 方式迁移到官方推荐的 Webhook 方式。

## 迁移原因

根据 OpenClaw 官方文档，Webhook 端点 (`POST /hooks/agent`) 是专为"外部系统定时触发 Agent"场景设计的标准接口，相比 HTTP API 方式有以下优势：

1. ✅ **官方推荐** - 专为自动化触发设计
2. ✅ **零配置** - Gateway 默认启用，无需手动开启
3. ✅ **更简单** - 单次 POST 请求即可触发
4. ✅ **功能更强** - 支持会话管理、超时控制、模型选择
5. ✅ **生产就绪** - 被 GitHub, Stripe, n8n 等大量使用

## 迁移内容

### 1. 核心变更

**旧方式 (HTTP API)**:
- 端点: `http://127.0.0.1:3000/api/messages`
- 需要手动启用 HTTP API
- 需要轮询获取响应

**新方式 (Webhook)**:
- 端点: `http://127.0.0.1:18789/hooks/agent`
- Gateway 默认启用
- 单次请求即可触发

### 2. 配置变更

**config.json 新增字段**:
```json
{
  "openclaw_hook_url": "http://127.0.0.1:18789/hooks/agent",
  "openclaw_hook_token": "your-hook-token-here"
}
```

**移除字段**:
- `agent_api_url` (改为 `openclaw_hook_url`)
- `agent_model` (可选，不指定则使用用户配置的默认模型)
- `agent_token` (改为 `openclaw_hook_token`)

### 3. 代码变更

**agent_integration.py**:
- 移除 HTTP API 相关代码
- 添加 Webhook 触发逻辑
- 添加 sessionKey 管理
- 添加超时控制

**env_detector.py**:
- 移除 HTTP API 检测
- 添加 Webhook 配置检测
- 添加 Hook Token 验证

## 用户迁移步骤

### 步骤 1: 获取 Hook Token

```bash
# 查看 OpenClaw 配置中的 Hook Token
openclaw config get hooks.token

# 如果未设置，生成新 Token
openclaw config set hooks.token "$(openssl rand -hex 32)"

# 再次查看确认
openclaw config get hooks.token
```

### 步骤 2: 更新插件配置

编辑 `config.json`:

```json
{
  "api_key": "your-agentoracle-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  
  "_comment_openclaw_webhook": "=== OpenClaw Webhook 配置 ===",
  "openclaw_hook_url": "http://127.0.0.1:18789/hooks/agent",
  "openclaw_hook_token": "your-hook-token-from-step-1",
  
  "_comment_optional": "=== 可选配置 ===",
  "openclaw_model": null,
  "openclaw_timeout_seconds": 120
}
```

### 步骤 3: 重启插件

```bash
# 停止插件
# (在 GUI 中点击停止按钮，或关闭插件)

# 启动插件
# (在 GUI 中点击启动按钮，或重新运行插件)
```

### 步骤 4: 验证运行

查看日志，应该看到：

```
[AgentOracle] ✅ 检测到 OpenClaw Webhook 配置
[AgentOracle] 📍 Webhook URL: http://127.0.0.1:18789/hooks/agent
[AgentOracle] 🔑 Hook Token: ****...****
[AgentOracle] 正在通过 Webhook 触发 OpenClaw Agent...
[AgentOracle] ✅ Agent 推理完成
```

## 技术细节

### Webhook Payload 结构

```json
{
  "message": "请分析以下任务:预测下周苹果股价。请严格返回 JSON 格式。",
  "sessionKey": "agentoracle:task:123",
  "name": "AgentOracleTask",
  "timeoutSeconds": 120
}
```

**参数说明**:
- `message` (必需): 发送给 Agent 的消息
- `sessionKey` (可选): 会话隔离，格式 `agentoracle:task:{task_id}`
- `name` (可选): 任务来源标识
- `model` (可选): 指定模型，不指定则使用用户配置的默认模型
- `timeoutSeconds` (可选): 超时控制，默认 120 秒

### 响应处理

Webhook 方式的响应直接包含在 HTTP 响应中：

```json
{
  "success": true,
  "sessionKey": "agentoracle:task:123",
  "response": {
    "prediction": "...",
    "confidence": 0.75,
    "reasoning": "..."
  }
}
```

### 错误处理

**常见错误**:

1. **401 Unauthorized**: Hook Token 无效
   - 解决: 检查 `openclaw_hook_token` 配置

2. **404 Not Found**: Webhook 端点不存在
   - 解决: 确认 OpenClaw Gateway 版本 >= 1.0.0

3. **408 Request Timeout**: Agent 处理超时
   - 解决: 增加 `openclaw_timeout_seconds` 值

## 兼容性说明

### 最低版本要求

- OpenClaw Gateway: >= 1.0.0
- Python: >= 3.9
- 插件版本: >= 2.0.0

### 向后兼容

插件会自动检测配置：
- 如果存在 `openclaw_hook_url`，使用 Webhook 方式
- 如果存在 `agent_api_url`，使用旧的 HTTP API 方式（已废弃）

建议所有用户尽快迁移到 Webhook 方式。

## 常见问题

### Q1: 迁移后无法连接？

**A**: 检查以下几点：
1. OpenClaw Gateway 是否正在运行
2. Hook Token 是否正确配置
3. 端口 18789 是否被占用

```bash
# 检查 Gateway 状态
openclaw gateway status

# 测试 Webhook 端点
curl -X POST http://127.0.0.1:18789/hooks/agent \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```

### Q2: 如何指定使用特定模型？

**A**: 在配置中添加 `openclaw_model` 字段：

```json
{
  "openclaw_model": "llama3:8b"
}
```

但推荐不指定，让用户自己在 OpenClaw 中配置默认模型。

### Q3: 迁移后性能有提升吗？

**A**: 是的，主要体现在：
- 减少了轮询开销
- 单次请求即可完成
- 更好的会话管理
- 内置超时控制

### Q4: 可以回退到旧方式吗？

**A**: 可以，但不推荐。如需回退：
1. 恢复旧的 `config.json`
2. 重启插件
3. 手动启用 OpenClaw HTTP API

## 参考文档

- [OpenClaw Webhook 完整指南](https://lumadock.com/tutorials/openclaw-webhooks-explained)
- [Webhook 端点详解](https://repovive.com/roadmaps/openclaw/skills-memory-automation/the-hooks-agent-endpoint)
- [为什么 Webhook 更好](./WHY-WEBHOOK-IS-BETTER.md)
- [Model 参数说明](./MODEL-PARAMETER-EXPLAINED.md)

---

**文档版本**: 1.0  
**最后更新**: 2026-03-02  
**作者**: AgentOracle 开发团队
