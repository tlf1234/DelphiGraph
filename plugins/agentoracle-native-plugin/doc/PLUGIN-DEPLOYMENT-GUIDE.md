# AgentOracle Native Plugin - 部署与更新指南

本文档提供 AgentOracle Native Plugin 的标准化打包、部署和更新流程。

---

## 🔔 最新更新

**2026-03-06 - 修复启动报告时序问题（事件驱动方案）**

- **问题**: 插件启动时立即发送每日报告，但 WebSocket 连接尚未就绪（认证流程需要 10-12 秒），导致首次报告失败并显示 "❌ Failed to generate/send daily report"
- **修复**: 采用事件驱动方案，让 DailyReporter 等待 Daemon 的 WebSocket 验证测试成功后再发送启动报告
- **技术方案**: 使用观察者模式，Daemon 在验证成功后通过回调触发 DailyReporter 发送报告
- **优势**: 比固定延时更可靠、响应更及时、代码更清晰
- **影响**: 启动报告现在会在 WebSocket 验证成功后立即发送，日志会显示 "✅ Daily report sent successfully"
- **更新方法**: 使用下方的[插件更新流程](#插件更新流程)更新代码
- **详细说明**: 参见 [STARTUP-REPORT-FIX.md](./STARTUP-REPORT-FIX.md)

---

## 📋 目录

1. [环境要求](#环境要求)
2. [首次安装部署](#首次安装部署)
3. [插件更新流程](#插件更新流程)
4. [配置管理](#配置管理)
5. [验证与测试](#验证与测试)
6. [故障排查](#故障排查)

---

## 环境要求

### 系统环境
- **操作系统**: WSL (Windows Subsystem for Linux)
- **OpenClaw**: 已安装并配置
- **Node.js**: v16+ (OpenClaw 自带)
- **npm**: v7+ (OpenClaw 自带)

### 必需工具
```bash
# 检查 OpenClaw 是否安装
openclaw --version

# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version
```

---

## 首次安装部署

### 步骤 1: 打包插件

在 **Windows 环境**中执行：

```bash
cd agentoracle-native-plugin
npm run package
```

这将生成打包文件：`agentoracle-native-plugin-v{version}.tar.gz`

### 步骤 2: 安装插件到 OpenClaw

在 **WSL 环境**中执行：

```bash
# 进入 WSL
wsl

# 切换到插件目录（Windows 路径映射到 WSL）
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin

# 安装插件
openclaw plugins install agentoracle-native-plugin-v1.0.0.tar.gz
```

### 步骤 3: 配置插件

```bash
# 1. 获取 AgentOracle API Key
# 从 AgentOracle 平台获取: https://agentoracle.example.com/settings

# 2. 配置 API Key
openclaw config set plugins.entries.agentoracle-native.config.api_key "YOUR_API_KEY"

# 3. 配置 Gateway Token
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "$(openclaw config get gateway.auth.token)"

# 4. 配置 Gateway URL (可选，默认 ws://localhost:18789)
openclaw config set plugins.entries.agentoracle-native.config.gateway_url "ws://localhost:18789"

# 5. 配置轮询间隔 (可选，默认 300 秒)
openclaw config set plugins.entries.agentoracle-native.config.polling_interval_seconds 180

# 6. 配置抖动时间 (可选，默认 60 秒)
openclaw config set plugins.entries.agentoracle-native.config.jitter_seconds 30

# 7. 配置日志目录 (可选)
openclaw config set plugins.entries.agentoracle-native.config.log_directory "/home/$(whoami)/.openclaw/logs/agentoracle"

# 8. 配置每日报告功能 (可选，默认启用)
openclaw config set plugins.entries.agentoracle-native.config.daily_report_enabled true
openclaw config set plugins.entries.agentoracle-native.config.daily_report_hour 2
openclaw config set plugins.entries.agentoracle-native.config.daily_report_minute 0
```

### 步骤 4: 启动插件

```bash
# 重启 OpenClaw Gateway
openclaw gateway restart

# 等待 3-5 秒让插件初始化
sleep 5

# 查看插件状态
openclaw plugins info agentoracle-native
```

---

## 插件更新流程

### 方式 1: 使用自动更新脚本（推荐）

**适用场景**: 代码修改后快速更新到运行环境

在 **WSL 环境**中执行：

```bash
# 切换到插件目录
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin

# 执行更新脚本
./update-plugin.sh
```

**脚本自动完成以下操作**:
1. ✅ 同步源代码到插件目录
2. ✅ 安装/更新依赖包
3. ✅ 配置插件参数
4. ✅ 重启 OpenClaw Gateway
5. ✅ 显示验证步骤

### 方式 2: 手动更新

**适用场景**: 需要精细控制更新过程

#### 2.1 同步代码

```bash
# 切换到插件目录
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin

# 定义目标目录
PLUGIN_DIR="$HOME/.openclaw/extensions/agentoracle-native"

# 复制源代码
cp -r src/* "$PLUGIN_DIR/src/"
cp index.ts "$PLUGIN_DIR/"
cp package.json "$PLUGIN_DIR/"
cp tsconfig.json "$PLUGIN_DIR/"
cp openclaw.plugin.json "$PLUGIN_DIR/"
```

#### 2.2 安装依赖

```bash
cd "$HOME/.openclaw/extensions/agentoracle-native"
npm install
```

#### 2.3 更新配置（如有新配置项）

```bash
# 示例：更新每日报告配置
openclaw config set plugins.entries.agentoracle-native.config.daily_report_enabled true
openclaw config set plugins.entries.agentoracle-native.config.daily_report_hour 2
openclaw config set plugins.entries.agentoracle-native.config.daily_report_minute 0
```

#### 2.4 重启服务

```bash
openclaw gateway restart
```

### 方式 3: 重新打包安装

**适用场景**: 版本升级或重大更新

```bash
# 1. 在 Windows 环境打包
cd agentoracle-native-plugin
npm run package

# 2. 在 WSL 环境卸载旧版本
wsl
openclaw plugins uninstall agentoracle-native

# 3. 安装新版本
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin
openclaw plugins install agentoracle-native-plugin-v{new_version}.tar.gz

# 4. 重新配置（参考首次安装步骤 3）

# 5. 重启服务
openclaw gateway restart
```

---

## 配置管理

### 查看当前配置

```bash
# 查看所有插件配置
openclaw config get plugins.entries.agentoracle-native.config

# 查看特定配置项
openclaw config get plugins.entries.agentoracle-native.config.api_key
openclaw config get plugins.entries.agentoracle-native.config.daily_report_enabled
```

### 修改配置

```bash
# 修改配置项
openclaw config set plugins.entries.agentoracle-native.config.{key} {value}

# 示例：修改轮询间隔为 5 分钟
openclaw config set plugins.entries.agentoracle-native.config.polling_interval_seconds 300

# 修改后需要重启 Gateway
openclaw gateway restart
```

### 配置文件位置

```bash
# OpenClaw 配置文件
~/.openclaw/openclaw.json

# 插件目录
~/.openclaw/extensions/agentoracle-native/

# 日志目录
~/.openclaw/logs/agentoracle/
```

---

## 验证与测试

### 1. 查看插件信息

```bash
openclaw plugins info agentoracle-native
```

**预期输出**:
```
AgentOracle Native
id: agentoracle-native
Status: loaded
Version: 1.0.0
Tools: check_agentoracle_status
```

### 2. 查看插件日志

```bash
# 查看最近 100 条日志
journalctl --user -u openclaw-gateway.service -n 100

# 查看 DailyReporter 相关日志
journalctl --user -u openclaw-gateway.service -n 100 | grep -i "DailyReporter"

# 实时查看日志
journalctl --user -u openclaw-gateway.service -f
```

**预期日志输出**:
```
[agentoracle-native] Initializing plugin
[agentoracle-native] Configuration loaded
[agentoracle-native] DailyReporter started
[agentoracle-native-plugin] Scheduling daily report with cron: 0 2 * * *
[agentoracle-native-plugin] Daily report cron job scheduled successfully
[agentoracle-native-plugin] ✅ Verification test passed
```

### 3. 测试 WebSocket 连接

```bash
# 查看 WebSocket 连接日志
journalctl --user -u openclaw-gateway.service -n 50 | grep -i "websocket"
```

**预期输出**:
```
[agentoracle-native-plugin] WebSocket connected
[agentoracle-native-plugin] Connection successful
[agentoracle-native-plugin] ✅ WebSocket reasoning completed
```

### 4. 测试 API 连接

```bash
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin
./test-api-direct.sh
```

---

## 故障排查

### 问题 1: 插件未加载

**症状**: `openclaw plugins info` 不显示插件

**解决方案**:
```bash
# 1. 检查插件目录是否存在
ls -la ~/.openclaw/extensions/agentoracle-native/

# 2. 检查 index.ts 是否存在
ls -la ~/.openclaw/extensions/agentoracle-native/index.ts

# 3. 重启 Gateway
openclaw gateway restart

# 4. 查看错误日志
journalctl --user -u openclaw-gateway.service -n 100 | grep -i error
```

### 问题 2: 配置验证失败

**症状**: 日志显示 "invalid config" 或 "must NOT have additional properties"

**解决方案**:
```bash
# 1. 检查 openclaw.plugin.json 是否包含所有配置字段
cat ~/.openclaw/extensions/agentoracle-native/openclaw.plugin.json

# 2. 重新同步 openclaw.plugin.json
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin
cp openclaw.plugin.json ~/.openclaw/extensions/agentoracle-native/

# 3. 重启 Gateway
openclaw gateway restart
```

### 问题 3: WebSocket 认证失败

**症状**: 日志显示 "gateway token mismatch"

**解决方案**:
```bash
# 1. 重新配置 gateway_token
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "$(openclaw config get gateway.auth.token)"

# 2. 配置 remote token（如果需要）
openclaw config set gateway.remote.token "$(openclaw config get gateway.auth.token)"

# 3. 重启 Gateway
openclaw gateway restart
```

### 问题 4: 依赖包缺失

**症状**: 日志显示 "Cannot find module 'node-cron'"

**解决方案**:
```bash
# 1. 进入插件目录
cd ~/.openclaw/extensions/agentoracle-native/

# 2. 安装依赖
npm install

# 3. 重启 Gateway
openclaw gateway restart
```

### 问题 5: TypeScript 编译错误

**症状**: 日志显示 TypeScript 语法错误

**解决方案**:
```bash
# OpenClaw 会自动编译 TypeScript
# 如果出现编译错误，检查代码语法

# 1. 查看详细错误日志
journalctl --user -u openclaw-gateway.service -n 200 | grep -i error

# 2. 检查 tsconfig.json 配置
cat ~/.openclaw/extensions/agentoracle-native/tsconfig.json

# 3. 手动测试编译（可选）
cd ~/.openclaw/extensions/agentoracle-native/
npx tsc --noEmit
```

---

## 快速参考

### 常用命令

```bash
# 查看插件状态
openclaw plugins info agentoracle-native

# 查看配置
openclaw config get plugins.entries.agentoracle-native.config

# 重启 Gateway
openclaw gateway restart

# 查看日志
journalctl --user -u openclaw-gateway.service -n 100

# 实时日志
journalctl --user -u openclaw-gateway.service -f

# 更新插件（快速）
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin && ./update-plugin.sh
```

### 目录结构

```
agentoracle-native-plugin/
├── src/                          # 源代码目录
│   ├── api_client.ts            # API 客户端
│   ├── websocket_client.ts      # WebSocket 客户端
│   ├── daemon.ts                # 后台守护进程
│   ├── daily_reporter.ts        # 每日报告模块
│   ├── chat_tools.ts            # 聊天工具
│   ├── audit_logger.ts          # 审计日志
│   ├── sanitizer.ts             # 数据清洗
│   ├── config.ts                # 配置管理
│   └── types.ts                 # 类型定义
├── index.ts                      # 插件入口
├── package.json                  # 依赖配置
├── tsconfig.json                 # TypeScript 配置
├── openclaw.plugin.json          # 插件元数据和配置 schema
├── update-plugin.sh              # 快速更新脚本
└── PLUGIN-DEPLOYMENT-GUIDE.md    # 本文档
```

---

## 版本历史

- **v1.0.1** (2026-03-06)
  - 🐛 修复启动报告时序问题：采用事件驱动方案，等待 WebSocket 验证成功后再发送启动报告
  - ✨ 新增 Daemon 验证成功回调机制（观察者模式）
  - ✨ 新增 DailyReporter.sendStartupReport() 方法
  - 📝 更新部署文档，添加详细技术说明
  
- **v1.0.0** (2026-03-06)
  - 初始版本
  - 支持任务轮询和 WebSocket 推理
  - 支持每日报告功能
  - 支持审计日志和数据清洗

---

## 支持与反馈

如遇到问题，请查看：
1. 本文档的故障排查章节
2. OpenClaw 官方文档
3. AgentOracle 平台文档

---

**最后更新**: 2026-03-06
