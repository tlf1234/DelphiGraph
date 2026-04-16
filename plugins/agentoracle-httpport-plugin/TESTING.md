# AgentOracle HTTP Port Plugin — 验证测试指南

本文档说明如何使用验证脚本测试 HTTP Port 通道是否正常工作。

---

## 前置条件

在运行测试前，请确认以下配置已完成：

### 1. OpenClaw 中已安装并启用 openclaw-httpport

```bash
openclaw plugins install openclaw-httpport
openclaw plugins enable openclaw-httpport
openclaw gateway restart
```

### 2. openclaw-httpport 频道已配置 token

在 OpenClaw 配置文件（`~/.openclaw/config.json`）中添加：

```json
{
  "channels": {
    "httpport": {
      "enabled": true,
      "token": "my-secret-token",
      "callbackDefault": "http://127.0.0.1:18789/agentoracle/callback"
    }
  }
}
```

> ⚠️ `token` 的值就是测试脚本中需要传入的 `HTTPPORT_TOKEN`。

---

## 使用 Python 脚本（推荐，零依赖）

**适用系统**：macOS / Linux / Windows（需 Python 3.6+）

```bash
# 基本验证（默认发送一条测试消息）
HTTPPORT_TOKEN=my-secret-token python3 scripts/test-httpport.py

# 自定义测试消息
HTTPPORT_TOKEN=my-secret-token python3 scripts/test-httpport.py "预测2025年AI市场增长率"

# 完整参数示例
OPENCLAW_BASE_URL=http://127.0.0.1:18789 \
HTTPPORT_TOKEN=my-secret-token \
TIMEOUT_SECONDS=180 \
python3 scripts/test-httpport.py "你好，请简单介绍一下自己"
```

**Windows PowerShell**：

```powershell
$env:HTTPPORT_TOKEN="my-secret-token"
python scripts/test-httpport.py
```

---

## 使用 TypeScript 脚本（需 npm install）

```bash
# 先安装依赖
npm install

# 基本验证
HTTPPORT_TOKEN=my-secret-token npm run test:httpport

# 自定义测试消息
HTTPPORT_TOKEN=my-secret-token npm run test:httpport "预测2025年AI市场增长率"
```

---

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `HTTPPORT_TOKEN` | ✅ | — | openclaw-httpport 频道的 `token` 值 |
| `OPENCLAW_BASE_URL` | | `http://127.0.0.1:18789` | OpenClaw HTTP 服务地址 |
| `TIMEOUT_SECONDS` | | `120` | 等待 Agent 响应的最长时间（秒） |

---

## 测试流程说明

脚本执行以下 3 个步骤：

```
Step 1 — 启动临时回调服务器
         在随机空闲端口启动本地 HTTP 服务，脚本结束后自动关闭

Step 2 — 发送测试消息到 /httpport/inbound
         POST { conversationId, text, callbackUrl } 到 OpenClaw

Step 3 — 等待回调
         OpenClaw Agent 推理完成后 POST 到本地服务器，脚本收到后结束
```

---

## 预期输出（成功）

```
============================================================
AgentOracle HTTP Port Plugin — Validation Script (Python)
============================================================
OpenClaw URL:     http://127.0.0.1:18789
Inbound Endpoint: http://127.0.0.1:18789/httpport/inbound
Token:            my-sec...
Conversation ID:  test-httpport-1743523200000
Timeout:          120s
Test Message:     这是一个端到端验证测试。请简单回复验证成功。
============================================================

Step 1 — 启动临时回调服务器...
✅  回调服务器已启动: http://127.0.0.1:49823/test-callback

Step 2 — 发送测试消息到 /httpport/inbound...
✅  inbound 已接受 (HTTP 202)，等待 Agent 推理并回调...

Step 3 — 等待回调（超时: 120s）...

============================================================
✅  验证成功！回调已收到。
============================================================

📨 回调 Payload:
{
  "conversationId": "test-httpport-1743523200000",
  "messageId": "httpport-xxxxxxxx",
  "text": "验证成功，我已收到你的消息...",
  "sessionKey": "httpport:test-httpport-1743523200000",
  "agentId": "main",
  "timestamp": 1743523245123
}

============================================================
🤖 Agent 响应:
============================================================
验证成功，我已收到你的消息...
============================================================

所有验证步骤通过：
✅  HTTP Port 频道连通 (/httpport/inbound 接受请求)
✅  OpenClaw Agent 成功推理
✅  回调服务器成功接收响应

插件已准备好处理 AgentOracle 预测任务。
```

---

## 常见错误排查

### ❌ `HTTPPORT_TOKEN 环境变量未设置`

```
HTTPPORT_TOKEN=your-token python3 scripts/test-httpport.py
```

### ❌ `/httpport/inbound 请求失败 (HTTP 401)`

token 与 OpenClaw 配置不一致，检查 `channels.httpport.token`。

### ❌ `/httpport/inbound 请求失败 (HTTP 404)`

openclaw-httpport 插件未安装或未启用：

```bash
openclaw plugins list          # 检查是否已安装
openclaw plugins enable openclaw-httpport
openclaw gateway restart
```

### ❌ `无法连接到 OpenClaw`

OpenClaw Gateway 未运行，或监听地址不是 `127.0.0.1:18789`：

```bash
openclaw gateway start
# 或指定地址
OPENCLAW_BASE_URL=http://127.0.0.1:18789 python3 scripts/test-httpport.py
```

### ❌ `超时（120s）— 未收到回调`

可能原因及解决方案：

1. **callbackUrl 不可达** — 脚本使用随机端口，确认没有防火墙阻止 127.0.0.1 本地回环
2. **allowCallbackHosts 白名单** — 检查 `channels.httpport.allowCallbackHosts` 是否包含 `127.0.0.1`
3. **Agent 推理耗时过长** — 增大超时时间：`TIMEOUT_SECONDS=300 python3 ...`
4. **Agent 忙碌** — 等待当前对话完成后再测试

---

## 测试后续步骤

验证通过后，可以安装完整插件：

```bash
# 安装插件
openclaw plugins install /path/to/agentoracle-httpport-plugin
openclaw plugins enable agentoracle-httpport

# 在插件配置中填入 api_key 和 httpport_token
# 重启 Gateway
openclaw gateway restart

# 查看插件日志
openclaw gateway logs | grep agentoracle
```
