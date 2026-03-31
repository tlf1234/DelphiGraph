# OpenClaw 与 AgentOracle 集成方案对比分析

## 文档概述

本文档详细分析三种将 AgentOracle 平台与 OpenClaw Gateway 集成的技术方案,包括可行性验证、架构设计、优劣对比,并给出最优选择建议。

---

## 方案概览

| 方案 | 集成方式 | OpenClaw 官方支持 | 用户配置复杂度 | 适用场景 |
|------|---------|------------------|---------------|---------|
| 方案 A | HTTP API + 轮询 | ❌ 非官方 | 高 (需手动启用) | 已废弃 |
| 方案 B | Channel Plugin | ✅ 官方推荐 | 低 (一步配置) | 持续对话 |
| 方案 C | Gateway WebSocket | ✅ 官方协议 | 中 (需理解协议) | 高级场景 |
| 方案 D | Webhook 端点 | ✅ 官方推荐 | 低 (零配置) | **外部触发** |

---

## 方案 A: HTTP API + 轮询 (当前实现)

### 架构图

```
AgentOracle 平台 ← [HTTP 轮询] ← Python 插件 → [HTTP API] → OpenClaw
```

### 技术细节

**插件侧 (Python)**
- 定时轮询 AgentOracle API 获取待处理任务
- 通过 HTTP API (默认 `http://localhost:3000`) 与 OpenClaw 通信
- 发送消息: `POST /api/messages`
- 获取响应: `GET /api/conversations/{id}/messages`

**OpenClaw 侧**
- 需要用户手动启用 HTTP API 服务器
- 配置文件添加: `"httpApi": { "enabled": true, "port": 3000 }`
- HTTP API 不是默认启用的功能

### 可行性验证

✅ **已验证可行** - 当前方案已实现并运行

### 优势

1. **实现简单** - 独立 Python 脚本,不依赖 OpenClaw 内部 API
2. **独立维护** - 不受 OpenClaw 版本更新影响
3. **立即可用** - 已完成开发和测试
4. **调试方便** - HTTP 请求易于监控和调试

### 劣势

1. **非官方方式** - HTTP API 不是 OpenClaw 推荐的集成方法
2. **需手动配置** - 用户必须手动启用 HTTP API
3. **轮询延迟** - 存在 3 分钟轮询间隔,不是实时响应
4. **资源浪费** - 持续轮询消耗网络和 CPU 资源
5. **不符合设计理念** - 不是 OpenClaw 的"正统"用法

### 用户配置步骤

```bash
# 1. 修改 OpenClaw 配置文件 ~/.openclaw/openclaw.json
{
  "httpApi": {
    "enabled": true,
    "port": 3000
  }
}

# 2. 重启 OpenClaw Gateway
openclaw gateway restart

# 3. 配置并运行 Python 插件
python agent_integration.py
```

---

## 方案 B: Channel Plugin (官方推荐)

### 架构图

```
AgentOracle 平台 ← [轮询] ← Channel Plugin → [Plugin API] → OpenClaw Gateway
```

### 技术细节

**插件结构 (TypeScript/JavaScript)**
```typescript
// openclaw.plugin.json
{
  "id": "agentoracle-channel",
  "name": "AgentOracle Channel",
  "version": "1.0.0",
  "description": "AgentOracle integration for OpenClaw"
}

// src/index.ts
export default function register(api) {
  api.registerChannel({ plugin: agentOracleChannel });
}

const agentOracleChannel = {
  id: "agentoracle",
  meta: {
    id: "agentoracle",
    label: "AgentOracle",
    blurb: "Connect to AgentOracle prediction platform"
  },
  capabilities: {
    chatTypes: ["direct"]
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ text }) => {
      // 提交预测到 AgentOracle 平台
      await submitPrediction(text);
      return { ok: true };
    }
  }
};
```

**工作流程**
1. 插件在 OpenClaw Gateway 进程内运行
2. 后台轮询 AgentOracle API 获取任务
3. 将任务作为"消息"注入 OpenClaw 会话
4. Agent 响应后,通过 `sendText` 提交预测结果

### 可行性验证

✅ **完全可行** - 基于官方 Plugin API

**验证依据:**
1. OpenClaw 官方文档明确支持 Channel Plugin
2. 已有成功案例: Rocket.Chat Plugin, DashBot Plugin
3. Plugin API 稳定且文档完善
4. 支持 TypeScript 直接加载 (通过 jiti)

### 优势

1. **官方推荐** - 符合 OpenClaw 架构设计理念
2. **零额外配置** - 不需要启用 HTTP API
3. **一步安装** - `openclaw plugins install agentoracle-channel`
4. **生态集成** - 可发布到 npm,被社区发现和使用
5. **进程内运行** - 性能更好,延迟更低
6. **自动发现** - 出现在 OpenClaw UI 的 Channel 列表中

### 劣势

1. **需要重写** - 当前 Python 代码需要用 TypeScript 重写
2. **依赖 OpenClaw** - 受 OpenClaw 版本更新影响
3. **学习成本** - 需要理解 Plugin API 和 Channel 接口
4. **调试复杂** - 在 Gateway 进程内运行,调试相对困难

### 用户配置步骤

```bash
# 1. 安装插件
openclaw plugins install agentoracle-channel

# 2. 配置 API Key
openclaw config set channels.agentoracle.accounts.default.apiKey "your-api-key"
openclaw config set channels.agentoracle.accounts.default.baseUrl "https://your-platform-domain.com"

# 3. 重启 Gateway (自动加载插件)
openclaw gateway restart
```

### 配置文件示例

```json
{
  "channels": {
    "agentoracle": {
      "accounts": {
        "default": {
          "enabled": true,
          "apiKey": "your-agentoracle-api-key",
          "baseUrl": "https://your-platform-domain.com",
          "pollInterval": 180
        }
      }
    }
  }
}
```

---

## 方案 D: Webhook 端点 (官方推荐 - 外部触发)

### 架构图

```
AgentOracle 平台 ← [轮询] ← Python 插件 → [POST /hooks/agent] → OpenClaw Gateway
```

### 技术细节

**Webhook 端点**
- 端点: `POST http://127.0.0.1:18789/hooks/agent`
- 认证: `Authorization: Bearer <HOOK_TOKEN>`
- 用途: 专为外部系统自动化触发设计 (n8n, GitHub Actions, 定时任务等)

**请求 Payload**
```json
{
  "message": "请分析以下任务:预测下周苹果股价。请严格返回 JSON 格式。",
  "name": "AgentOracleTask",
  "model": "llama3:8b",
  "timeoutSeconds": 120,
  "sessionKey": "agentoracle:task:123",
  "deliver": {
    "channel": "internal",
    "to": "agentoracle"
  }
}
```

**配置 (openclaw.json)**
```json
{
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "your-long-random-secret-token"
  }
}
```

**Python 插件实现**
```python
import requests

def trigger_openclaw_agent(task):
    """通过 Webhook 触发 OpenClaw Agent"""
    payload = {
        "message": f"请使用你的本地记忆检索工具,分析以下任务:{task['question']}。请严格返回 JSON 格式。",
        "name": "AgentOracleTask",
        "model": "llama3:8b",
        "timeoutSeconds": 120,
        "sessionKey": f"agentoracle:task:{task['id']}"
    }
    
    response = requests.post(
        "http://127.0.0.1:18789/hooks/agent",
        json=payload,
        headers={"Authorization": f"Bearer {HOOK_TOKEN}"}
    )
    
    return response.json()
```

### 可行性验证

✅ **完全可行且官方推荐** - 专为自动化设计

**验证依据:**
1. OpenClaw 官方文档明确推荐用于外部触发场景
2. 与 n8n, GitHub Actions, Zapier 等工具的标准集成方式
3. 无需手动启用额外功能,Gateway 默认支持
4. 大量生产环境使用案例

**官方文档引用:**
> "Webhooks are the fastest way to turn OpenClaw from 'a chat assistant' into 'a system that reacts.' Instead of waiting for you to message it first, GitHub can ping it when a PR opens, Stripe can ping it when a payment fails, and n8n can ping it on a schedule."

### 优势

1. **官方推荐方式** - 专为"外部系统定时触发 Agent"场景设计
2. **零额外配置** - Gateway 默认启用,只需设置 token
3. **实现简单** - 标准 HTTP POST,任何语言都能调用
4. **会话管理** - 支持 sessionKey 实现任务隔离和去重
5. **超时控制** - 支持 timeoutSeconds 防止 Agent 卡死
6. **模型选择** - 支持 model 参数指定使用的 LLM
7. **结果路由** - 支持 deliver 参数将结果发送到指定 Channel
8. **幂等性支持** - 通过 sessionKey 实现事件去重
9. **生产就绪** - 被 GitHub, Stripe, n8n 等大量使用

### 劣势

1. **需要轮询** - 仍需 Python 插件轮询 AgentOracle API
2. **单向通信** - 只能触发,不能实时获取响应 (需要通过 sessionKey 查询)
3. **Token 管理** - 需要妥善保管 HOOK_TOKEN

### 用户配置步骤

```bash
# 1. 配置 Webhook Token (如果未配置)
openclaw config set hooks.enabled true
openclaw config set hooks.token "$(openssl rand -hex 32)"

# 2. 查看 Token (用于 Python 插件)
openclaw config get hooks.token

# 3. 配置 Python 插件
cat > config.json <<EOF
{
  "openclaw_hook_url": "http://127.0.0.1:18789/hooks/agent",
  "openclaw_hook_token": "your-hook-token-here",
  "agentoracle_api_key": "your-api-key"
}
EOF

# 4. 运行插件
python agent_integration.py
```

### 与当前实现的对比

**当前实现 (HTTP API)**
```python
# 需要手动启用 HTTP API
# 需要轮询获取响应
response = requests.post("http://localhost:3000/api/messages", ...)
# 然后轮询获取结果
result = requests.get(f"http://localhost:3000/api/conversations/{id}/messages")
```

**Webhook 方式 (官方推荐)**
```python
# 无需额外配置,直接调用
response = requests.post(
    "http://127.0.0.1:18789/hooks/agent",
    json={"message": task_question, "sessionKey": f"task:{task_id}"},
    headers={"Authorization": f"Bearer {HOOK_TOKEN}"}
)
# 结果通过 sessionKey 查询或通过 deliver 路由到 Channel
```

### 完整工作流程

```
1. Python 插件轮询 AgentOracle API
   ↓
2. 获取待处理任务
   ↓
3. 通过 POST /hooks/agent 触发 OpenClaw
   ↓
4. OpenClaw Agent 处理任务
   ↓
5. 结果存储在 session 中
   ↓
6. Python 插件通过 sessionKey 查询结果
   ↓
7. 提交预测到 AgentOracle 平台
```

### 安全最佳实践

1. **Token 保护**
   - 使用长随机 Token (至少 32 字节)
   - 存储在环境变量中,不要硬编码
   - 定期轮换 Token

2. **网络隔离**
   - 仅监听 127.0.0.1,不暴露到公网
   - 如需远程访问,使用 Tailscale 或 SSH 隧道

3. **请求验证**
   - 验证 sessionKey 格式,防止注入
   - 限制 timeoutSeconds 范围
   - 过滤敏感信息

4. **幂等性**
   - 使用稳定的 sessionKey (如 `agentoracle:task:{task_id}`)
   - 在提交前检查任务是否已处理
   - 记录已处理的事件 ID

---

## 方案 C: Gateway WebSocket Protocol (高级方案)

### 架构图

```
AgentOracle 平台 ← [轮询] ← Python/Node 客户端 ⇄ [WebSocket] ⇄ OpenClaw Gateway
```

### 技术细节

**WebSocket 连接**
- 端点: `ws://127.0.0.1:18789` (默认)
- 协议: OpenClaw Gateway WebSocket Protocol
- 角色: `node` (功能访问) 或 `operator` (管理访问)

**握手协议**
```json
{
  "type": "req",
  "id": "1",
  "method": "connect",
  "params": {
    "role": "node",
    "auth": { "token": "..." },
    "client": {
      "id": "agentoracle-client",
      "platform": "python",
      "version": "1.0.0"
    },
    "caps": ["agentoracle-tasks"]
  }
}
```

**消息注入**
```json
{
  "type": "req",
  "id": "2",
  "method": "injectMessage",
  "params": {
    "channel": "agentoracle",
    "text": "任务问题内容",
    "metadata": {
      "taskId": "123",
      "deadline": "2026-03-15T00:00:00Z"
    }
  }
}
```

### 可行性验证

✅ **技术可行** - 基于官方 WebSocket 协议

**验证依据:**
1. OpenClaw 所有客户端都使用此协议 (iOS, Android, CLI, Web UI)
2. 协议文档完整,支持消息注入和 RPC 调用
3. 支持设备配对和持久连接

**⚠️ 实现复杂度高**
- 需要实现完整的 WebSocket 客户端
- 需要处理握手、心跳、重连逻辑
- 需要理解 OpenClaw 的会话和路由机制

### 优势

1. **官方协议** - 与 iOS/Android 客户端使用相同协议
2. **实时通信** - WebSocket 双向通信,无轮询延迟
3. **功能完整** - 可访问 Gateway 的所有 RPC 方法
4. **语言灵活** - 可用 Python, Node.js, Go 等任何语言实现
5. **独立进程** - 不依赖 Plugin 系统,独立部署

### 劣势

1. **实现复杂** - 需要实现完整的 WebSocket 客户端逻辑
2. **协议理解** - 需要深入理解 OpenClaw 内部协议
3. **维护成本高** - 协议变更需要同步更新
4. **调试困难** - WebSocket 调试比 HTTP 复杂
5. **文档不足** - WebSocket 协议文档不如 Plugin API 完善

### 用户配置步骤

```bash
# 1. 确保 Gateway 运行
openclaw gateway start

# 2. 配置客户端
cat > agentoracle_ws_config.json <<EOF
{
  "gateway_url": "ws://127.0.0.1:18789",
  "auth_token": "your-gateway-token",
  "agentoracle_api_key": "your-api-key"
}
EOF

# 3. 运行 WebSocket 客户端
python agentoracle_ws_client.py
```

---

## 方案对比矩阵

### 技术维度

| 维度 | 方案 A (HTTP API) | 方案 B (Channel Plugin) | 方案 C (WebSocket) | 方案 D (Webhook) ⭐ |
|------|------------------|------------------------|-------------------|-------------------|
| **官方支持** | ❌ 非官方 | ✅ 官方推荐 | ✅ 官方协议 | ✅ 官方推荐 |
| **适用场景** | ❌ 已废弃 | 持续对话 | 高级场景 | **外部触发** |
| **实现复杂度** | 🟡 中等 | 🔴 复杂 | 🔴 复杂 | 🟢 简单 |
| **维护成本** | 🟡 中 | 🟡 中 | 🔴 高 | 🟢 低 |
| **实时性** | 🔴 轮询延迟 | 🟡 轮询延迟 | 🟢 实时 | 🟢 即时触发 |
| **资源消耗** | 🟡 中等 | 🟢 低 | 🟢 低 | 🟢 低 |
| **调试难度** | 🟢 简单 | 🟡 中等 | 🔴 困难 | 🟢 简单 |
| **语言要求** | Python | TypeScript/JavaScript | 任意 | Python (当前) |
| **迁移成本** | N/A | 🔴 高 (重写) | 🔴 高 (重写) | 🟢 低 (修改端点) |

### 用户体验维度

| 维度 | 方案 A | 方案 B | 方案 C | 方案 D ⭐ |
|------|--------|--------|--------|---------|
| **配置步骤** | 3 步 (需手动启用 API) | 2 步 (一键安装) | 2 步 | **1 步 (设置 Token)** |
| **配置复杂度** | 🔴 高 | 🟢 低 | 🟡 中 | 🟢 低 |
| **错误提示** | 🟡 中等 | 🟢 清晰 | 🟡 中等 | 🟢 清晰 |
| **文档完善度** | 🟡 自建 | 🟢 官方 | 🟡 官方但不完整 | 🟢 官方完善 |
| **社区支持** | ❌ 无 | ✅ 有 | 🟡 有限 | ✅ 广泛使用 |

### 开发维度

| 维度 | 方案 A | 方案 B | 方案 C | 方案 D ⭐ |
|------|--------|--------|--------|---------|
| **开发时间** | ✅ 已完成 | 🔴 5-7 天 | 🔴 7-10 天 | 🟢 1-2 小时 |
| **测试难度** | 🟢 简单 | 🟡 中等 | 🔴 困难 | 🟢 简单 |
| **发布方式** | GitHub | npm + GitHub | GitHub | GitHub |
| **版本兼容** | 🟡 依赖 HTTP API | 🟡 依赖 OpenClaw | 🟡 依赖协议 | 🟢 稳定 |

### 场景适配度

| 场景 | 方案 A | 方案 B | 方案 C | 方案 D ⭐ |
|------|--------|--------|--------|---------|
| **外部系统定时触发** | 🟡 可用但非官方 | ❌ 不适合 | ❌ 过度设计 | ✅ **完美匹配** |
| **持续对话** | ❌ 不适合 | ✅ 完美匹配 | 🟡 可用 | ❌ 不适合 |
| **事件驱动自动化** | 🟡 可用 | 🟡 可用 | 🟡 可用 | ✅ **官方推荐** |
| **实时双向通信** | ❌ 不支持 | ❌ 不支持 | ✅ 支持 | ❌ 不支持 |

---

## 可行性结论

### 方案 A (HTTP API)
✅ **完全可行** - 已实现并验证

### 方案 B (Channel Plugin)
✅ **完全可行** - 官方支持,有成功案例

**验证证据:**
1. 官方文档: https://docs.openclaw.ai/
2. 成功案例: 
   - `openclaw-channel-rocketchat` (GitHub)
   - `dashbot-openclaw` (wembledev)
3. Plugin API 稳定且文档完善

### 方案 C (WebSocket)
✅ **技术可行** - 但实现复杂度高

**验证证据:**
1. 所有官方客户端 (iOS, Android, Web) 都使用此协议
2. Gateway 默认监听 `ws://127.0.0.1:18789`
3. 协议文档存在但不如 Plugin API 完善

---

## 最优方案推荐

### 🏆 推荐方案: 方案 D (Webhook 端点)

**推荐理由:**

1. **完美匹配使用场景** - 专为"外部系统定时触发 Agent 执行特定任务"设计
2. **官方推荐方式** - OpenClaw 文档明确推荐用于自动化触发
3. **零额外配置** - Gateway 默认支持,无需启用额外功能
4. **实现简单** - 标准 HTTP POST,与当前 Python 实现完美兼容
5. **生产就绪** - 被 GitHub, Stripe, n8n 等大量使用
6. **功能完整** - 支持会话管理、超时控制、模型选择、结果路由

**适用场景:**
- ✅ 外部系统定时触发 (完美匹配 AgentOracle)
- ✅ 事件驱动自动化 (GitHub PR, Stripe 支付等)
- ✅ 定时任务触发 (cron, n8n 等)
- ✅ 需要会话隔离和去重

**与当前实现的迁移成本:**
- 🟢 极低 - 只需修改 HTTP 端点和 Header
- 🟢 无需重写 - Python 代码结构保持不变
- 🟢 无需用户配置 - Gateway 默认启用

### 🥈 备选方案: 方案 B (Channel Plugin)

**适用场景:**
- 需要持续对话而非单次触发
- 希望集成到 OpenClaw UI
- 计划发布到社区

**不推荐原因:**
- ❌ 不适合"外部触发"场景
- ❌ 需要重写为 TypeScript
- ❌ Channel 设计用于持续对话,不是任务触发

### 🥉 不推荐: 方案 A (HTTP API)

**原因:**
- ❌ 非官方方式
- ❌ 需要手动启用
- ❌ 已有更好的官方替代方案 (Webhook)

### 🚫 不推荐: 方案 C (WebSocket)

**原因:**
- ❌ 实现复杂度过高
- ❌ 没有明显优势
- ❌ 不适合单向触发场景

---

## 实施路线图

### 立即实施 (推荐)

**迁移到方案 D (Webhook 端点)**

**迁移步骤 (1-2 小时):**

1. **修改 Python 插件代码** (30 分钟)
   ```python
   # 旧代码 (HTTP API)
   response = requests.post("http://localhost:3000/api/messages", ...)
   
   # 新代码 (Webhook)
   response = requests.post(
       "http://127.0.0.1:18789/hooks/agent",
       json={"message": task_question, "sessionKey": f"task:{task_id}"},
       headers={"Authorization": f"Bearer {HOOK_TOKEN}"}
   )
   ```

2. **配置 Webhook Token** (5 分钟)
   ```bash
   openclaw config set hooks.token "$(openssl rand -hex 32)"
   ```

3. **测试验证** (30 分钟)
   - 测试任务触发
   - 验证结果获取
   - 检查会话隔离

4. **更新文档** (30 分钟)
   - 更新 README
   - 更新配置指南
   - 添加迁移说明

**预期收益:**
- ✅ 符合官方推荐方式
- ✅ 无需用户手动配置
- ✅ 更好的会话管理
- ✅ 生产环境验证

### 短期 (1-3 个月) - 可选

**优化和增强**
1. 添加结果路由 (deliver 参数)
2. 实现更完善的幂等性
3. 添加 Webhook 签名验证
4. 优化错误处理和重试逻辑

### 长期 (3 个月后) - 可选

**考虑方案 B (Channel Plugin)**
- 仅当需要持续对话功能时
- 仅当计划发布到社区时
- 作为 Webhook 方式的补充,不是替代

---

## 技术风险评估

### 方案 A 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| HTTP API 被废弃 | 🟡 中 | 🔴 高 | 提前开发方案 B |
| 用户配置错误 | 🔴 高 | 🟡 中 | 提供详细文档和自动检测 |
| 轮询延迟投诉 | 🟡 中 | 🟢 低 | 说明是临时方案 |

### 方案 B 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Plugin API 变更 | 🟢 低 | 🟡 中 | 关注 OpenClaw 更新日志 |
| TypeScript 学习曲线 | 🟡 中 | 🟢 低 | 参考官方示例代码 |
| npm 发布问题 | 🟢 低 | 🟢 低 | 遵循 npm 最佳实践 |

### 方案 C 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 协议变更 | 🟡 中 | 🔴 高 | 不推荐此方案 |
| 实现 bug | 🔴 高 | 🔴 高 | 需要大量测试 |
| 维护困难 | 🔴 高 | 🔴 高 | 需要专门团队 |

---

## 结论

**最优选择: 方案 D (Webhook 端点)**

这是 OpenClaw 官方推荐的"外部系统定时触发 Agent"的标准方式,完美匹配 AgentOracle 的使用场景。

**核心优势:**
1. ✅ 官方推荐 - 专为自动化触发设计
2. ✅ 零配置 - Gateway 默认启用
3. ✅ 迁移简单 - 只需修改 HTTP 端点
4. ✅ 生产就绪 - 被大量系统使用
5. ✅ 功能完整 - 会话管理、超时控制、模型选择

**实施建议:**
1. **立即迁移到方案 D** - 1-2 小时即可完成
2. 废弃方案 A (HTTP API) - 非官方方式
3. 方案 B (Channel Plugin) 仅在需要持续对话时考虑
4. 方案 C (WebSocket) 不适合当前场景

**迁移代码示例:**
```python
# 旧代码 (方案 A - HTTP API)
response = requests.post(
    "http://localhost:3000/api/messages",
    json={"message": task_question}
)

# 新代码 (方案 D - Webhook)
response = requests.post(
    "http://127.0.0.1:18789/hooks/agent",
    json={
        "message": task_question,
        "sessionKey": f"agentoracle:task:{task_id}",
        "name": "AgentOracleTask",
        "model": "llama3:8b",
        "timeoutSeconds": 120
    },
    headers={"Authorization": f"Bearer {HOOK_TOKEN}"}
)
```

---

## 参考资料

### 官方文档
- 官方网站: https://docs.openclaw.ai/
- Webhook 完整指南: https://lumadock.com/tutorials/openclaw-webhooks-explained
- Webhook 端点详解: https://repovive.com/roadmaps/openclaw/skills-memory-automation/the-hooks-agent-endpoint
- 事件驱动自动化: https://repovive.com/roadmaps/openclaw/skills-memory-automation/webhooks-event-driven-ai-automation
- Plugin 开发指南: https://wemble.com/2026/01/31/building-an-openclaw-plugin.html
- Gateway 架构: https://iamulya.one/posts/openclaw-channels-routing-and-nodes/

### 成功案例
- Rocket.Chat Plugin: https://github.com/cloudrise-network/openclaw-channel-rocketchat
- DashBot Plugin: https://github.com/wembledev/dashbot-openclaw

### 技术博客
- OpenClaw 架构深度解析: https://practiceoverflow.substack.com/p/deep-dive-into-the-openclaw-gateway
- Channel 和路由机制: https://iamulya.one/posts/openclaw-channels-routing-and-nodes/

---

**文档版本:** 1.0  
**最后更新:** 2026-03-02  
**作者:** AgentOracle 开发团队
