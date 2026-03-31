# AgentOracle Native Plugin — OpenClaw Plugin SDK 迁移文档

## 概述

本文档记录 `agentoracle-native-plugin` 从自定义接口迁移到 **OpenClaw Plugin SDK 标准** 的完整改造过程。

### 迁移目标

将插件从非标准的自定义接口模式，改造为遵循 `openclaw/plugin-sdk` 标准的官方插件模块模式，与 `openclaw-channel-dingtalk` 等官方社区插件保持一致的架构规范。

### 迁移范围

**仅修改原生插件（`plugins/agentoracle-native-plugin/`）**，项目其它部分不做任何改动。

---

## 改造前后对比

### 架构对比

| 维度 | 改造前（自定义） | 改造后（SDK 标准） |
|------|----------------|------------------|
| **入口模式** | `export function register(context)` | `export default { register(api) }` |
| **类型来源** | 自定义 `PluginContext`、`OpenClawLogger`、`OpenClawConfigSystem` | `openclaw/plugin-sdk` 的 `OpenClawPluginApi` |
| **Logger 类型** | 自定义 `OpenClawLogger` 接口 | `PluginLogger`（从 SDK 派生） |
| **工具注册** | `registerTool(...)` 自定义方法 | `api.registerGatewayMethod(...)` SDK 标准 |
| **配置读取** | 手动解析 `config.plugins.entries` | `api.config` SDK 标准配置 |
| **依赖声明** | 无 `openclaw` 依赖 | `peerDependencies: { "openclaw": ">=2026.2.13" }` |
| **导出方式** | `export function register` | `export default plugin` |

### 保持不变的部分

| 组件 | 说明 |
|------|------|
| **WebSocket 通信** | 通过 Gateway Protocol v3 调用 Agent 全能力，这是**必须保留**的机制 |
| **Daemon 守护进程** | 轮询任务、处理流水线逻辑不变 |
| **DailyReporter** | 每日报告功能不变 |
| **APIClient** | AgentOracle API 通信不变 |
| **Sanitizer** | 数据脱敏逻辑不变 |
| **AuditLogger** | 审计日志逻辑不变 |
| **PromptBuilder** | 提示词构建不变 |
| **ChatTools** | 收益查询逻辑不变 |

---

## 修改的文件清单

### 1. `src/types.ts` — 类型定义

**变更内容：**

- **新增** `import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'`
- **新增** `PluginLogger` 类型（从 SDK 的 `api.logger` 派生）
- **新增** `AgentOraclePluginModule` 接口（标准插件模块定义）
- **移除** `OpenClawLogger` 自定义接口（改为 `PluginLogger` 的别名，标记 `@deprecated`）
- **移除** `OpenClawConfigSystem` 自定义接口
- **移除** `ToolRegistry` 和 `ToolDefinition` 废弃接口
- **保留** 所有业务类型（`Task`、`Stats`、`PluginConfig`、WebSocket 协议类型等）

```typescript
// 改造前
export interface OpenClawLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
}

// 改造后
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export type PluginLogger = OpenClawPluginApi['logger'];

// 向后兼容
/** @deprecated 使用 PluginLogger 替代 */
export type OpenClawLogger = PluginLogger;
```

### 2. `index.ts` — 插件入口

**变更内容：**

- **新增** `import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'`
- **新增** `import * as pluginSdk from 'openclaw/plugin-sdk'`
- **改造** 入口从 `export function register(context: PluginContext)` 改为标准插件模块 `export default plugin`
- **改造** 工具注册从 `registerTool(...)` 改为 `api.registerGatewayMethod('agentoracle.status', ...)`
- **改造** 配置读取从自定义 `context.config` 改为 `api.config`
- **改造** 日志使用从 `context.logger` 改为 `api.logger`
- **移除** 自定义 `PluginContext`、`PluginInstance` 接口
- **移除** `unload()` 返回值（改用 OpenClaw 标准生命周期管理）

```typescript
// 改造前
interface PluginContext {
  config: any;
  registerTool?: (tool: any) => void;
  logger: OpenClawLogger;
}
export function register(context: PluginContext): PluginInstance { ... }

// 改造后
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
const plugin: AgentOraclePluginModule = {
  id: 'agentoracle-native',
  name: 'AgentOracle Native',
  register(api: OpenClawPluginApi): void { ... },
};
export default plugin;
```

### 3. `package.json` — 依赖和元数据

**变更内容：**

- **新增** `peerDependencies: { "openclaw": ">=2026.2.13" }`
- **新增** `openclaw.installDependencies: true`
- **更新** `main: "index.ts"`（OpenClaw 直接加载 TS 源码）
- **更新** `files` 字段新增 `index.ts` 和 `src/**/*.ts`

```json
// 改造前
{
  "main": "dist/index.js"
}

// 改造后
{
  "main": "index.ts",
  "peerDependencies": {
    "openclaw": ">=2026.2.13"
  },
  "openclaw": {
    "extensions": ["./index.ts"],
    "installDependencies": true
  }
}
```

### 4. `src/websocket_client.ts`

**变更内容：**

- **更新** import：`OpenClawLogger` → `PluginLogger`
- **更新** 构造函数参数类型：`logger: OpenClawLogger` → `logger: PluginLogger`

### 5. `src/daemon.ts`

**变更内容：**

- **更新** import：`OpenClawLogger` → `PluginLogger`
- **更新** 构造函数参数类型：`logger: OpenClawLogger` → `logger: PluginLogger`

### 6. `src/daily_reporter.ts`

**变更内容：**

- **更新** import：`OpenClawLogger` → `PluginLogger`
- **更新** 构造函数参数类型：`logger: OpenClawLogger` → `logger: PluginLogger`

### 7. `src/config.ts`

**变更内容：**

- **移除** `OpenClawConfigSystem` import
- **改造** `ConfigManager` 构造函数：从接受 `OpenClawConfigSystem` 改为接受 `Record<string, unknown>`
- **更新** 使用说明注释

### 8. `scripts/test-websocket.ts`

**变更内容：**

- **更新** import：`OpenClawLogger` → `PluginLogger`
- **更新** consoleLogger 类型标注

### 9. `openclaw.plugin.json`

**变更内容：**

- **新增** `channels: []` 字段（声明不是 Channel 插件）

---

## 未修改的文件

| 文件 | 原因 |
|------|------|
| `src/api_client.ts` | 仅使用业务类型（Task、Stats 等），无 OpenClaw 接口依赖 |
| `src/sanitizer.ts` | 仅使用 `SanitizationResult`，无 OpenClaw 接口依赖 |
| `src/audit_logger.ts` | 仅使用 `LogEntry`，无 OpenClaw 接口依赖 |
| `src/prompt_builder.ts` | 无 OpenClaw 导入 |
| `src/chat_tools.ts` | 仅使用业务类型，无 OpenClaw 接口依赖 |
| `test-prompt.ts` | 无 OpenClaw 导入 |
| `src/__tests__/*` | 测试文件仅使用业务类型 |

---

## 为什么保留 WebSocket 通信

### 核心需求

插件需要**主动发起对话**，让 Agent 使用其**全部能力**（LLM 推理、联网搜索、记忆检索、工具调用）来处理预测任务。

### SDK 限制

OpenClaw Plugin SDK 目前不提供类似 `api.chat()` 或 `api.invokeAgent()` 的进程内 API。通过 Gateway WebSocket Protocol v3 发送 `chat.send` 请求，是目前**唯一能让 Agent 用全部能力处理请求的方式**。

### 数据流

```
                    ┌─────────────────────────────────────────────┐
                    │         OpenClaw Gateway (ws://18789)       │
                    │                                             │
  AgentOracle API   │   ┌───────────┐        ┌───────────────┐   │
  ┌──────────┐      │   │ WebSocket │ chat   │    Agent      │   │
  │ get-tasks├──────┼──►│ Protocol  ├───────►│ (Full Power)  │   │
  │          │      │   │   v3      │ .send  │ - LLM         │   │
  │ submit-  │◄─────┼───│           │◄───────┤ - Web Search  │   │
  │ predict  │      │   └───────────┘        │ - Memory      │   │
  └──────────┘      │                        │ - Tools       │   │
                    │                        └───────────────┘   │
                    └─────────────────────────────────────────────┘
```

### 为什么不用 Channel 模式

Channel 插件是**被动响应型**的消息通道，设计目的是桥接外部聊天平台（钉钉、微信）与 OpenClaw。我们的插件是**主动任务处理型**的后台服务，语义上不匹配。详细对比见上一次分析讨论。

---

## 安装和验证

### 1. 安装依赖

```bash
cd plugins/agentoracle-native-plugin
npm install
```

> 注意：`openclaw` 作为 `peerDependency`，将在 OpenClaw 运行环境中自动提供。
> 开发环境中如需类型检查，可手动安装：`npm install openclaw --save-dev`

### 2. 构建（可选）

```bash
npm run build
```

### 3. 安装到 OpenClaw

```bash
# 打包
npm run package

# 安装
openclaw plugins install /path/to/agentoracle-native-plugin-v1.0.0.tar.gz

# 配置
openclaw config set plugins.entries.agentoracle-native.config.api_key "your-api-key"
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "$(openclaw config get hooks.token)"
openclaw config set plugins.entries.agentoracle-native.enabled true

# 重启
openclaw gateway restart
```

### 4. 验证

```bash
# 检查插件列表
openclaw plugins list | grep agentoracle

# 查看插件信息
openclaw plugins info agentoracle-native

# 查看日志
openclaw gateway logs | grep agentoracle-native
```

---

## 向后兼容性

### 类型兼容

`OpenClawLogger` 保留为 `PluginLogger` 的 `@deprecated` 别名，确保外部使用者的代码不会立即破坏。

### 配置兼容

配置路径 `plugins.entries.agentoracle-native.config.*` 保持不变，用户无需修改任何配置。

### 功能兼容

所有业务功能（任务处理、每日报告、收益查询）保持完全不变。

---

## 与 openclaw-channel-dingtalk 的对比

迁移后，两个插件的 SDK 集成方式已**基本一致**：

| 对比项 | agentoracle-native (改造后) | openclaw-channel-dingtalk |
|--------|---------------------------|--------------------------|
| **SDK 使用** | `openclaw/plugin-sdk` | `openclaw/plugin-sdk` |
| **入口模式** | `export default { register(api) }` | `export default { register(api) }` |
| **配置读取** | `api.config` | `api.config` |
| **日志系统** | `api.logger` | `api.logger` |
| **方法注册** | `api.registerGatewayMethod()` | `api.registerGatewayMethod()` |
| **peerDeps** | `openclaw: ">=2026.2.13"` | `openclaw: ">=2026.2.13"` |
| **插件类型** | 通用功能插件（无 Channel） | Channel 插件（`api.registerChannel()`） |
| **Agent 通信** | WebSocket Protocol v3（主动发起） | Channel 框架（被动响应） |

唯一的区别是**插件类型**：dingtalk 注册为 Channel，我们不需要（也不应该）注册 Channel。

---

## 迁移时间线

- **迁移日期**: 2026-03-20
- **迁移版本**: v1.0.0 → v1.1.0（建议）
- **影响范围**: 仅 `plugins/agentoracle-native-plugin/` 目录
- **破坏性变更**: 无（向后兼容）
