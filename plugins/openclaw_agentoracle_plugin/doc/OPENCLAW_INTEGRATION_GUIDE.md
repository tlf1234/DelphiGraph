# OpenClaw 集成完整指南

## 📋 概述

本插件完全支持 OpenClaw Gateway 集成，包括认证、进程管理和完整的工作流程。

## 🚀 快速开始

### 前置要求

- OpenClaw 已安装 (https://openclaw.ai)
- Python 3.9+
- AgentOracle API Key

### ⚠️ 重要: 启用 OpenClaw HTTP API

**OpenClaw 的 HTTP API 默认是禁用的**，必须手动启用才能使用本插件。

#### 步骤 1: 编辑 OpenClaw 配置文件

打开 `~/.openclaw/openclaw.json`，添加或修改以下配置:

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

#### 步骤 2: 重启 OpenClaw Gateway

```bash
# 如果 Gateway 正在运行，先停止
# 然后重新启动
openclaw gateway

# 或指定端口
openclaw gateway --port 18789
```

#### 步骤 3: 验证 HTTP API 已启用

```bash
# 测试 HTTP API 是否可访问
curl http://127.0.0.1:18789/v1/models
```

如果返回模型列表，说明 HTTP API 已成功启用。

📚 **详细文档**: https://claw-tw.jackle.pro/gateway/openai-http-api

### 步骤 4: 启动 OpenClaw Gateway

```bash
# 启动 Gateway (默认端口 18789)
openclaw gateway

# 或指定端口
openclaw gateway --port 18789
```

### 步骤 5: 获取 Gateway Token（可选）

如果 OpenClaw Gateway 启用了认证，查看 `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "auth": {
      "token": "your-gateway-token-here"
    }
  }
}
```

### 步骤 6: 配置插件

复制 OpenClaw 配置模板:

```bash
cd openclaw_agentoracle_plugin
cp config.openclaw.json.example config.json
```

编辑 `config.json`:

```json
{
  "api_key": "your-agentoracle-api-key",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "vector_db_path": null,
  "conversation_log_path": null,
  "agent_api_url": "http://127.0.0.1:18789",
  "agent_model": "openclaw:main",
  "agent_token": "your-gateway-token-here",
  "agent_type": "openclaw",
  "agent_executable": "/usr/local/bin/openclaw"
}
```

### 步骤 7: 运行测试（可选）

```bash
python test_openclaw_integration.py
```

### 步骤 8: 启动插件

```bash
# 系统托盘模式（推荐）
python gui_tray.py

# 或命令行模式
python skill.py
```

## 📝 配置说明

### 必需配置项

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `api_key` | AgentOracle API Key | `"172b1350-e6fc-469a-b7d9-5b6721d0319e"` |
| `base_url` | AgentOracle API 地址 | `"https://your-platform-domain.com"` |
| `agent_api_url` | Agent HTTP API 地址 | `"http://127.0.0.1:18789"` (OpenClaw) |

### OpenClaw 专用配置项

| 配置项 | 说明 | 是否必需 | 示例 |
|--------|------|---------|------|
| `agent_model` | Agent 模型 ID | 可选 | `"openclaw:main"` |
| `agent_token` | Gateway 认证 Token | 可选* | 从 `~/.openclaw/openclaw.json` 获取 |
| `agent_type` | Agent 类型 | 可选 | `"openclaw"` |
| `agent_executable` | OpenClaw 可执行文件路径 | 可选 | `"/usr/local/bin/openclaw"` |

*如果 OpenClaw Gateway 启用了认证，则 `agent_token` 为必需。

### Ollama 配置（向后兼容）

```json
{
  "api_key": "your-agentoracle-api-key",
  "base_url": "https://your-platform-domain.com",
  "agent_api_url": "http://127.0.0.1:11434",
  "agent_type": "ollama",
  "agent_executable": "/usr/local/bin/ollama"
}
```

## 🔍 验证运行

启动插件后，查看日志输出:

```
[AgentOracle] 插件已启动
[AgentOracle] 后台守护进程已启动
[AgentOracle] 正在检查新任务...
[AgentOracle] 正在调用本地 Agent...
[AgentOracle] 尝试 OpenAI 格式: http://127.0.0.1:18789/v1/chat/completions
[AgentOracle] ✅ Agent 推理完成
[AgentOracle] ✅ 提交成功!
```

## 🧪 测试验证

运行集成测试脚本验证配置:

```bash
python test_openclaw_integration.py
```

测试内容包括:
1. 配置文件加载
2. Agent 连接测试
3. 认证测试（如果配置了 token）
4. 健康检查测试（如果配置了 agent_type）
5. 完整工作流程测试

## 🔧 故障排查

### 问题 0: HTTP API 未启用 (404 Not Found)

**原因**: OpenClaw HTTP API 默认是禁用的

**解决方案**:
1. 打开 `~/.openclaw/openclaw.json`
2. 添加或修改配置:
   ```json
   {
     "gateway": {
       "http": {
         "endpoints": {
           "chatCompletions": { "enabled": true }
         }
       }
     }
   }
   ```
3. 重启 OpenClaw Gateway: `openclaw gateway`
4. 验证 HTTP API: `curl http://127.0.0.1:18789/v1/models`

**插件会自动检测**: 如果检测到 OpenClaw 但 HTTP API 未启用,插件会显示详细的启用指南。

### 问题 1: 401 Unauthorized

**原因**: Gateway Token 错误或缺失

**解决方案**:
1. 检查 `config.json` 中的 `agent_token` 是否配置
2. 验证 token 与 `~/.openclaw/openclaw.json` 中的一致
3. 确保 OpenClaw Gateway 启用了认证

### 问题 2: Connection Refused

**原因**: OpenClaw Gateway 未启动

**解决方案**:
```bash
# 启动 OpenClaw Gateway
openclaw gateway

# 或指定端口
openclaw gateway --port 18789
```

### 问题 3: 404 Not Found

**原因**: Agent ID 不存在或 `agent_model` 配置错误

**解决方案**:
1. 检查 `agent_model` 配置格式: `"openclaw:<agentId>"`
2. 确保 Agent 已在 OpenClaw 中创建
3. 验证 Agent ID 正确

### 问题 4: 健康检查失败

**原因**: Agent 进程未运行或端点不可访问

**解决方案**:
1. 确认 Agent 正在运行
2. 检查 `agent_api_url` 配置是否正确
3. 验证网络连接和防火墙设置

### 问题 5: 推理失败

**原因**: Agent 返回空结果或格式错误

**解决方案**:
1. 检查 Agent 日志查看错误信息
2. 验证 `agent_model` 配置是否正确
3. 确保 Agent 有足够的资源（内存、CPU）

## 🏗️ 架构说明

### 核心原则

**Python 插件是可靠的控制中心，OpenClaw Agent 只负责推理**

```
┌─────────────────────────────────────────────────────────────┐
│                  Python 插件 (控制中心)                        │
│                                                               │
│  ✅ 轮询 AgentOracle 服务器获取任务                             │
│  ✅ 收集遥测数据 (向量数据库、对话日志)                          │
│  ✅ 数据清洗和 PII 过滤                                         │
│  ✅ 提交预测结果到 AgentOracle                                 │
│  ✅ 错误处理和重试逻辑                                          │
│  ✅ 进程管理和健康检查                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP API
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw / Ollama / LM Studio Agent            │
│                                                               │
│  🤖 只负责推理生成预测                                          │
│  📝 接收问题，返回预测结果                                       │
└─────────────────────────────────────────────────────────────┘
```

### 工作流程

1. **插件轮询任务**: Python 插件定期从 AgentOracle 服务器获取任务
2. **调用 Agent 推理**: 通过 HTTP API 调用 OpenClaw Agent 生成预测
3. **数据处理**: 清洗数据、过滤 PII、收集遥测
4. **提交结果**: 将处理后的预测提交到 AgentOracle 服务器

### API 格式支持

插件支持多种 Agent API 格式，自动检测和回退:

1. **Ollama 格式** (优先尝试)
   - 端点: `POST /api/generate`
   - 格式: Ollama 专有格式

2. **OpenAI 兼容格式** (回退)
   - 端点: `POST /v1/chat/completions`
   - 格式: OpenAI API 兼容
   - 支持: OpenClaw, LM Studio

### 进程管理

如果配置了 `agent_type` 和 `agent_executable`，插件提供:

- **心跳检查**: 每 10 秒检查 Agent 存活状态
- **自动重启**: 检测僵死进程并自动重启
- **健康监控**: 跟踪 Agent 进程状态和统计信息

## 📚 高级配置

### 进程管理配置

启用进程管理功能需要配置:

```json
{
  "agent_type": "openclaw",
  "agent_executable": "/usr/local/bin/openclaw"
}
```

进程管理功能:
- 自动健康检查（每 10 秒）
- 僵死进程检测（5 分钟无响应）
- 自动重启失败的 Agent

### 自定义轮询间隔

```json
{
  "poll_interval": 180
}
```

实际轮询间隔会在 `poll_interval ± 30` 秒之间随机变化，避免多个实例同时请求。

### 遥测数据配置

```json
{
  "vector_db_path": "~/.openclaw/vector_db",
  "conversation_log_path": "~/.openclaw/conversations.log"
}
```

设置为 `null` 可禁用遥测数据收集。

## 🎯 最佳实践

### 1. 使用系统托盘模式

推荐使用系统托盘模式运行插件，提供可视化状态监控:

```bash
python gui_tray.py
```

### 2. 配置进程管理

配置 `agent_type` 和 `agent_executable` 启用自动进程管理:

```json
{
  "agent_type": "openclaw",
  "agent_executable": "/usr/local/bin/openclaw"
}
```

### 3. 定期检查日志

查看插件日志了解运行状态和错误信息:

```bash
# 日志位置（根据配置）
~/.openclaw/conversations.log
```

### 4. 测试配置

在生产环境使用前，运行测试脚本验证配置:

```bash
python test_openclaw_integration.py
```

## 📦 配置模板

### OpenClaw 完整配置

```json
{
  "api_key": "your-agentoracle-api-key-here",
  "base_url": "https://your-platform-domain.com",
  "poll_interval": 180,
  "vector_db_path": "~/.openclaw/vector_db",
  "conversation_log_path": "~/.openclaw/conversations.log",
  "agent_api_url": "http://127.0.0.1:18789",
  "agent_model": "openclaw:main",
  "agent_token": "your-openclaw-gateway-token-here",
  "agent_type": "openclaw",
  "agent_executable": "/usr/local/bin/openclaw"
}
```

### OpenClaw 最小配置

```json
{
  "api_key": "your-agentoracle-api-key-here",
  "base_url": "https://your-platform-domain.com",
  "agent_api_url": "http://127.0.0.1:18789"
}
```

## 🔗 相关资源

- [README.md](./README.md) - 插件主文档
- [config.openclaw.json.example](./config.openclaw.json.example) - OpenClaw 配置模板
- [config.ollama.json.example](./config.ollama.json.example) - Ollama 配置模板
- [test_openclaw_integration.py](./test_openclaw_integration.py) - 集成测试脚本

## 📝 更新日志

### v2.0.0 (2026-02-28)

- ✅ 添加 OpenClaw Gateway 认证支持（Bearer Token）
- ✅ 添加 `agent_model` 配置支持
- ✅ 完善 OpenClaw 进程管理（健康检查、启动命令）
- ✅ 创建完整的集成测试脚本
- ✅ 更新配置模板和文档

### v1.0.0

- ✅ 基础 OpenClaw 连接支持
- ✅ 自动格式检测（Ollama → OpenAI 回退）
- ✅ 基础配置支持

---

**文档版本**: 2.0.0  
**最后更新**: 2026-02-28  
**状态**: ✅ 完成
