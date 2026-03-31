# OpenClaw AgentOracle Plugin — 开源合规审查文档

## 概述

本文档记录 `openclaw_agentoracle_plugin`（Python 外挂插件）在开源发布前需要处理的合规性、安全性和规范性问题。

**审查日期**: 2026-03-20  
**插件性质**: 独立外挂程序（非 OpenClaw SDK 内部插件）  
**交互方式**: WebSocket Gateway Protocol v3  
**计划许可证**: MIT License（参见 `SKILL.md`）

---

## 产品形态与合规性定性

### 商业模式

AgentOracle 是一个**公开的任务分发与收益分配平台**，插件的运作模式为：

1. **用户主动安装** — 开源代码，用户自愿下载、配置、启动
2. **用户自有算力** — 利用用户本地 Agent（OpenClaw/Ollama/LM Studio）的闲置算力
3. **透明的收益分配** — 用户完成任务获得收益，平台公开分配机制
4. **完全可控** — 用户可随时启动/暂停/停止，GUI 提供实时状态

### 行业类比

| 类比产品 | 模式 | 与本插件的相似性 |
|----------|------|----------------|
| **BOINC** | 志愿者贡献 CPU/GPU 算力做科学计算 | 用户自愿贡献 AI 算力完成预测任务 |
| **Honeygain** | 用户共享闲置带宽获得收益 | 用户共享闲置 AI 算力获得收益 |
| **Folding@home** | 利用闲置算力做蛋白质折叠模拟 | 利用闲置 Agent 做预测分析 |
| **Brave Rewards** | 浏览器用户选择参与广告生态获得 BAT 代币 | 用户选择参与预测市场获得收益 |

### 合规性结论

**本插件不属于恶意软件**，原因如下：

- **用户知情同意** — 必须主动安装、配置 API Key、手动启动
- **完全透明** — 开源代码，用户可审计所有行为
- **利益对齐** — 用户获得收益回报，非单方面占用
- **可控可停** — 系统托盘提供一键暂停/退出
- **无破坏性** — 不修改系统文件、不拦截流量、不窃取数据

### 仍需注意的技术规范问题

虽然产品形态合规，但以下技术细节仍建议修正，以避免**被 OpenClaw 生态误判**：

1. **`client.id: "cli"`** — Gateway 可能强制要求此值才能连接（协议限制），`userAgent` 字段已声明真实身份 `"openclaw-agentoracle-plugin/1.0.0"`，风险较低。如 Gateway 允许自定义值，可改为 `"agentoracle-plugin"`
2. **`openclaw_` 命名前缀** — 可能被误认为官方插件，建议改为 `agentoracle_` 前缀
3. **Agent 进程自动重启** — 虽然用户授权，但行为激进，建议设为可选并默认关闭

---

## 插件架构概要

```
openclaw_agentoracle_plugin/
├── run.py                  # 启动器（tray/mini/gui/cli 四种模式）
├── run_gui.py              # GUI 启动入口
├── config.json             # 用户配置（已 .gitignore）
├── config.json.example     # 配置模板
├── SKILL.md                # 用户文档
├── src/
│   ├── skill.py            # 主入口：PluginManager + BackgroundDaemon
│   ├── websocket_client.py # OpenClaw Gateway WebSocket 客户端
│   ├── api_client.py       # AgentOracle 平台 API 客户端
│   ├── agent_manager.py    # Agent 进程管理（心跳/重启）
│   ├── sanitizer.py        # PII 数据脱敏
│   ├── memory_monitor.py   # 内存监控
│   ├── submission_logger.py# 提交记录
│   ├── telemetry.py        # 遥测数据收集
│   ├── validators.py       # 字符串校验
│   ├── env_detector.py     # 环境自动探测
│   ├── logger.py           # 日志模块
│   ├── gui.py              # 完整 GUI
│   └── gui_tray.py / gui_mini.py  # 托盘/迷你 GUI
├── data/
│   └── submissions.json    # 提交记录（运行时生成）
└── debug/                  # 调试日志（运行时生成）
```

**工作流程**: 轮询 AgentOracle API 获取任务 → 构建 Prompt → 通过 WebSocket 发送给 OpenClaw Agent → 接收 AI 响应 → 脱敏 → 提交结果

---

## 问题清单

### P0 — 必须修复（安全/法律风险）

#### 1. 缺少 LICENSE 文件

**当前状态**: 插件目录中没有 `LICENSE` 文件，仅在 `SKILL.md` 底部提到 "MIT License"。

**风险**: 没有正式的 LICENSE 文件，代码在法律上默认 "All Rights Reserved"，其他人无权使用、修改或分发。

**修复方案**:
```
创建 LICENSE 文件，内容为标准 MIT License 全文
```

#### 2. config.json 中可能包含敏感信息

**当前状态**: `config.json` 已被 `.gitignore` 忽略（正确做法）。但需要确认：

**检查项**:
- [ ] 确认 `config.json` 确实在 `.gitignore` 中
- [ ] 确认 Git 历史中没有误提交过包含真实 API Key 的 `config.json`
- [ ] `config.json.example` 中的 `base_url` 包含真实 Supabase 地址 `https://your-platform-domain.com`，需评估是否应公开

**修复方案**:
```bash
# 检查 Git 历史
git log --all --diff-filter=A -- plugins/openclaw_agentoracle_plugin/config.json

# 如果发现历史中有敏感数据，使用 git filter-branch 或 BFG 清理
```

#### 3. `config.json.example` 暴露生产 API 端点

**文件**: `config.json.example`
```json
"base_url": "https://your-platform-domain.com"
```

**风险**: 公开 Supabase 项目 URL，虽然有认证保护，但暴露了后端基础设施信息，可能被用于针对性攻击。

**修复方案**:
已使用通用占位符 `https://your-platform-domain.com`，用户需替换为实际平台域名。

---

### P1 — 强烈建议修复（规范/品牌风险）

#### 4. `openclaw_` 命名前缀

**当前状态**: 插件目录名为 `openclaw_agentoracle_plugin`。

**风险**:
- 使用 `openclaw_` 前缀暗示这是 OpenClaw 官方插件，实际上是第三方独立程序
- 可能导致品牌混淆或商标问题
- OpenClaw 社区可能对非官方插件使用其品牌名称提出异议

**修复方案**:
```
重命名为 agentoracle_plugin 或 agentoracle_earner
```

#### 5. WebSocket `client.id` 伪装为 CLI

**文件**: `src/websocket_client.py`
```python
"client": {
    "id": "cli",           # 伪装成 OpenClaw CLI
    "version": "1.0.0",
    "platform": "windows",
    "mode": "cli"           # 伪装成 CLI 模式
}
```

**风险**:
- Gateway 日志中无法区分真正的 CLI 客户端和此插件
- 未来 Gateway 若对 `client.id` 做权限控制，插件可能被拒绝连接
- 违反诚实通信原则

**修复方案**:
```python
"client": {
    "id": "agentoracle-plugin",
    "version": "1.0.0",
    "platform": "windows",
    "mode": "plugin"
}
```

#### 6. `SKILL.md` 中过时/不准确的信息

**问题列表**:

| 行 | 问题 | 说明 |
|----|------|------|
| 36 | `git clone https://github.com/agentoracle/openclaw-plugin.git` | 仓库地址可能不存在或不正确 |
| 107 | `通过 HTTP POST 发送给本地 Agent (127.0.0.1:11434)` | 实际是通过 WebSocket Gateway（18789 端口），而非直接 HTTP POST |
| 123 | `"poll_interval": 1800` | 默认值实际为 180 秒，文档写 1800 |
| 179 | `v1.0.0 (2024-01-15)` | 日期需要更新 |
| 189-190 | Discord/GitHub 链接 | 确认链接是否真实有效 |

---

### P2 — 建议修复（可维护性/健壮性）

#### 7. Gateway Protocol v3 耦合风险

**当前状态**: `src/websocket_client.py` 硬编码了 Protocol v3 的完整握手流程：
1. 接收 `connect.challenge`
2. 发送 `connect` 请求（含 `minProtocol: 3, maxProtocol: 3`）
3. 发送 `chat.send`
4. 解析 `chat` 事件流

**风险**: 如果 OpenClaw Gateway 升级协议版本，此插件将立即失效。

**建议**:
- 在 README 中明确声明支持的 Gateway 版本范围
- 考虑添加协议版本检测和降级逻辑
- 长期：关注 OpenClaw 是否提供 Python SDK 或 HTTP API 替代方案

#### 8. 依赖项中包含 `psutil`

**文件**: `src/agent_manager.py` 引用了 `psutil`。

**风险**: `psutil` 可以获取系统进程信息，某些用户可能对此有安全顾虑。

**建议**: 在文档中说明 `psutil` 的用途（仅用于 Agent 进程管理），并标注其为可选依赖。

#### 9. `debug/` 目录包含调试数据

**当前状态**: `debug/` 目录中有多个 `prompt_*.txt` 和 `response_*.txt` 文件。

**风险**: 这些文件可能包含真实的任务数据或 AI 响应内容。

**修复方案**:
- 将 `debug/` 添加到 `.gitignore`
- 确认 Git 历史中没有敏感的调试数据
- 如果已提交，需要从历史中清理

#### 10. `data/submissions.json` 包含提交记录

**当前状态**: `data/submissions.json` 存在于仓库中。

**风险**: 可能包含真实的任务 ID、提交时间等运营数据。

**修复方案**:
- 将 `data/submissions.json` 添加到 `.gitignore`
- 保留 `data/README.md` 说明目录用途
- 清理 Git 历史中的真实数据

---

## 不需要修改的部分

| 组件 | 状态 | 说明 |
|------|------|------|
| **WebSocket 交互方式** | ✅ 合理 | 使用公开的 Gateway Protocol，非破坏性 |
| **PII 脱敏（Sanitizer）** | ✅ 合规 | 正则匹配邮箱/手机号/长数字/API Key |
| **config.json 权限设置** | ✅ 安全 | `os.chmod(0o600)` 仅所有者可读写 |
| **config.json .gitignore** | ✅ 正确 | 敏感配置不会被提交 |
| **环境自动探测** | ✅ 合理 | 仅检测本地端口，无外部请求 |
| **多种运行模式** | ✅ 用户友好 | tray/mini/gui/cli 四种模式 |

---

## 开源前操作清单

### 第一阶段：安全清理（必须完成）

- [ ] 创建 `LICENSE` 文件（MIT License）
- [ ] 审查 Git 历史，清理可能的敏感数据提交
- [ ] 替换 `config.json.example` 中的真实 Supabase URL 为占位符
- [ ] 确认 `debug/` 和 `data/submissions.json` 在 `.gitignore` 中
- [ ] 清理 `debug/` 目录中的真实调试数据

### 第二阶段：规范修正（强烈建议）

- [ ] 重命名插件目录：`openclaw_agentoracle_plugin` → `agentoracle_plugin`
- [ ] 修改 `client.id` 从 `"cli"` 改为 `"agentoracle-plugin"`
- [ ] 更新 `SKILL.md` 中的过时信息（URL、端口、默认值、日期）
- [ ] 验证 GitHub/Discord 链接的有效性

### 第三阶段：文档完善（建议）

- [ ] 添加 `CHANGELOG.md`
- [ ] 明确声明支持的 OpenClaw Gateway 版本
- [ ] 说明 `psutil` 依赖的用途
- [ ] 添加 `CONTRIBUTING.md`（如果接受社区贡献）

---

## 与原生插件的关系

| 对比项 | agentoracle-native-plugin (TS) | openclaw_agentoracle_plugin (Python) |
|--------|-------------------------------|--------------------------------------|
| **性质** | OpenClaw SDK 内部插件 | 独立外挂程序 |
| **加载方式** | OpenClaw 运行时自动加载 | 用户手动启动 |
| **SDK 集成** | `openclaw/plugin-sdk` 标准 | 无 SDK，直接 WebSocket |
| **用户界面** | 无（后台运行） | GUI / 系统托盘 / CLI |
| **目标用户** | 开发者（集成到 OpenClaw） | 终端用户（一键启动） |
| **开源风险** | 低（已完成 SDK 迁移） | 中（本文档所列问题） |

两个插件功能上互补：原生插件面向开发者集成，Python 外挂面向终端用户直接使用。

---

## 总结

### 产品形态：合规

`openclaw_agentoracle_plugin` 的产品模式（用户自愿安装 → 贡献闲置算力 → 获得收益分配）属于成熟的分布式计算参与模式，与 BOINC、Honeygain 等合法产品一致，**不构成恶意软件**。

### 开源前需处理的技术问题

在开源前仍需处理 **安全清理（P0）** 和 **规范修正（P1）** 两个层面的技术问题：

1. **添加 LICENSE 文件** — 否则代码无法被合法使用
2. **清理敏感数据** — 确保 Git 历史干净，替换 `config.json.example` 中的生产 URL
3. **修正客户端身份标识** — `client.id` 改为真实标识，避免被 Gateway 误判
4. **调整命名前缀** — 从 `openclaw_` 改为 `agentoracle_`，避免品牌混淆

预计修复工作量：约 1-2 小时。
