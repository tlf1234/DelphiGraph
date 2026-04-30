# AgentOracle Native Plugin for OpenClaw

OpenClaw 原生插件，用于自动化处理 AgentOracle 预测任务，集成隐私保护、审计日志和 WebSocket Protocol v3 通信。

## 功能概述

- **后台守护进程**：轮询 AgentOracle API 获取预测任务，调用 Agent 全能力处理并提交
- **每日报告**：定时发送收益统计报告给 Agent（由 Agent 推送到微信/飞书等客户端）
- **收益查询工具**：在 OpenClaw 对话中随时查询收益、任务数和信誉分
- **隐私保护**：自动脱敏 + 完整审计日志
- **设备身份认证**：WebSocket Protocol v3 + Ed25519 签名，兼容 OpenClaw Gateway 4.x

---

## 安装

### 步骤 1：将插件目录复制到 OpenClaw 扩展目录

```bash
# Linux / macOS / WSL
cp -r /path/to/agentoracle-native-plugin ~/.openclaw/extensions/agentoracle-native

# 或直接在目标目录克隆/解压
```

目标路径必须是 `~/.openclaw/extensions/agentoracle-native/`，目录名即插件 ID。

```bash

openclaw gateway restart
openclaw gateway stop
pkill -9 -f openclaw
# 检查插件列表
openclaw plugins list | grep -i agentoracle

# 查看插件详细信息
openclaw plugins info agentoracle-native

# 检查 Gateway 日志
journalctl -u openclaw-gateway.service -f | grep -i agentoracle

# 卸载插件（通过插件 ID）没什么用
openclaw plugins uninstall agentoracle-native

# 直接删除扩展目录
rm -rf ~/.openclaw/extensions/agentoracle-native

rm -rf ~/.openclaw/extensions/agentoracle-httpport
rm -rf ~/.openclaw/plugins/agentoracle-httpport-plugin
#//关闭插件
openclaw plugins disable agentoracle-native
openclaw plugins disable agentoracle-httpport

#打开插件
openclaw plugins enable agentoracle-native
openclaw plugins enable agentoracle-httpport

openclaw logs

bash ~/monitor-all.sh

监控脚本
bash ~/monitor.sh


# 停止插件
openclaw gateway call delphigraph.stop

# 启动插件
openclaw gateway call delphigraph.start

# 重启插件
openclaw gateway call delphigraph.restart
``````bash
# 停止插件
openclaw gateway call delphigraph.stop

# 启动插件
openclaw gateway call delphigraph.start

# 重启插件
openclaw gateway call delphigraph.restart
```

```


## 安装

```bash
# 本地路径安装
openclaw plugins install ./.openclaw/plugins/agentoracle-httpport-plugin
openclaw plugins enable agentoracle-httpport
```

### 步骤 2：安装 Node.js 依赖

```bash
cd ~/.openclaw/extensions/agentoracle-native
npm install --production
```

Node.js 版本要求 **>= 16**。

### 步骤 3：配置插件

编辑 OpenClaw 配置文件 `~/.openclaw/openclaw.json`，在 `plugins.entries` 下添加：

```json
{
  "plugins": {
    "entries": {
      "qwen-portal-auth": {
        "enabled": false
      },
      "agentoracle-native": {
        "enabled": true,
        "config": {
          "api_key": "",
          "api_base_url": "",   //域名地址
          "gateway_token": "",
          "gateway_url": "ws://localhost:18789",
          "polling_interval_seconds": 60,
          "jitter_seconds": 30,
          "log_directory": "/home/tlf123/.openclaw/logs/agentoracle",
          "daily_report_enabled": true,
          "daily_report_hour": 2,
          "daily_report_minute": 0
        }
      }
    }
  }
}
```

各必填字段说明：
- **`api_key`**：AgentOracle 平台 API Key，从平台设置页获取
- **`api_base_url`**：AgentOracle 平台 API 地址，与 Python 外挂插件 `config.json` 中的 `base_url` 值相同
- **`gateway_token`**：OpenClaw Gateway 认证 Token，通过 `openclaw config get hooks.token` 查看

或使用 CLI 命令逐项设置：

```bash
# 查看当前 Gateway Token
openclaw config get hooks.token

# 设置必填项
openclaw config set plugins.entries.agentoracle-native.config.api_key "your-agentoracle-api-key"
openclaw config set plugins.entries.agentoracle-native.config.api_base_url "https://your-platform-domain.com"
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "your-gateway-token"

# 启用插件
openclaw config set plugins.entries.agentoracle-native.enabled true
```

### 步骤 4：重启 Gateway

```bash
openclaw gateway restart
```

插件启动时会**自动生成**设备身份（`device_identity.json`），Gateway 对本地连接自动信任，无需手动配对。

> **注意**：`device_identity.json` 包含私钥，请勿提交到版本控制。插件 `.gitignore` 已默认排除此文件。

## 卸载

```bash
# 直接删除扩展目录
rm -rf ~/.openclaw/extensions/agentoracle-native

# 从配置中移除插件条目（可选）
openclaw config delete plugins.entries.agentoracle-native

# 重启 Gateway 使卸载生效
openclaw gateway restart
```

---

## 配置参数说明

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `api_key` | ✅ | — | AgentOracle 平台 API Key |
| `api_base_url` | ✅ | — | AgentOracle 平台 API 地址，如 `https://your-platform-domain.com` |
| `gateway_token` | ✅ | — | OpenClaw Gateway WebSocket Token（与 `hooks.token` 相同） |
| `gateway_url` | ❌ | `ws://localhost:18789` | Gateway WebSocket 地址 |
| `polling_interval_seconds` | ❌ | `180` | 任务轮询间隔（秒），有效范围 60–3600 |
| `jitter_seconds` | ❌ | `30` | 轮询随机抖动（秒），有效范围 0–60，防止并发踩踏 |
| `log_directory` | ❌ | `~/.openclaw/logs/agentoracle` | 审计日志目录 |
| `daily_report_enabled` | ❌ | `true` | 是否启用每日报告 |
| `daily_report_hour` | ❌ | `2` | 每日报告发送时间（小时，0–23） |
| `daily_report_minute` | ❌ | `0` | 每日报告发送时间（分钟，0–59） |

**完整配置示例**（`~/.openclaw/openclaw.json`）：

```json
{
  "plugins": {
    "entries": {
      "agentoracle-native": {
        "enabled": true,
        "config": {
          "api_key": "ao_xxxxxxxxxxxxxxxxxxxxxxxx",
          "api_base_url": "https://your-platform-domain.com",
          "gateway_token": "74c143f4fe51a9e4caa2f4325d8fe1a8",
          "gateway_url": "ws://127.0.0.1:18789",
          "polling_interval_seconds": 180,
          "jitter_seconds": 30,
          "daily_report_enabled": true,
          "daily_report_hour": 8,
          "daily_report_minute": 30
        }
      }
    }
  }
}
```

---

## 在对话中查询收益

插件注册了网关方法 `delphigraph.status`，OpenClaw Agent 可通过对话调用。

在 OpenClaw 对话中输入：

```
我的 Delphigraph 收益怎么样？
```
```
查看我的打工进度
```
```
显示我的预测任务统计
```

Agent 会调用 `delphigraph.status` 工具并返回：
```
🤖 Delphigraph 收益面板 🤖

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 总收益: 1284.65
✅ 完成任务: 42 个
⭐ 信誉分: 850 / 1000
🏆 排名: #127

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

你的 Agent 正在努力打工中... 💪
```

---
## 插件生命周期控制（启动 / 停止 / 重启）

插件注册了三个网关方法，可通过 OpenClaw 对话或 API 调用来控制插件的后台运行状态，**无需重启整个 Gateway**。

### 可用命令

| 网关方法 | 功能 | 说明 |
|----------|------|------|
| `delphigraph.stop` | 停止插件 | 停止后台任务轮询和每日报告，插件进入待机状态 |
| `delphigraph.start` | 启动插件 | 恢复后台任务轮询和每日报告 |
| `delphigraph.restart` | 重启插件 | 先停止再启动（间隔 1 秒），用于清理状态 |

### 在对话中使用

直接在 OpenClaw 对话中告诉 Agent：

```
停止 Delphigraph 插件
```
```
启动 Delphigraph 插件
```
```
重启 Delphigraph 打工插件
```

Agent 会调用对应的网关方法并返回执行结果，例如：

```
✅ Delphigraph 插件已停止。

- 🛑 后台任务轮询已停止
- 🛑 每日报告已停止

使用 `delphigraph.start` 可重新启动。
```

### 通过 Gateway API 调用

如需脚本化控制，可直接调用 Gateway WebSocket 方法：

```bash
# 停止插件
openclaw gateway call delphigraph.stop

# 启动插件
openclaw gateway call delphigraph.start

# 重启插件
openclaw gateway call delphigraph.restart
```

> **注意**：`delphigraph.stop` 仅停止后台轮询和定时任务，不会卸载插件。`delphigraph.status` 查询收益等命令在停止状态下仍可使用。

---

## 每日报告

插件使用 **node-cron** 定时发送每日报告，Agent 收到后推送给微信/飞书等已连接客户端。

- 默认时间：每天凌晨 **2:00**（Asia/Shanghai）
- 插件启动时额外发送一次启动报告
- 报告内容：总收益、完成任务数、信誉分、排名

**修改报告时间**（以每天 8:30 为例）：

```bash
openclaw config set plugins.entries.agentoracle-native.config.daily_report_hour 8
openclaw config set plugins.entries.agentoracle-native.config.daily_report_minute 30
openclaw gateway restart
```

**关闭每日报告**：

```bash
openclaw config set plugins.entries.agentoracle-native.config.daily_report_enabled false
openclaw gateway restart
```

---

## 隐私保护与审计日志

所有提交到 AgentOracle 平台的数据会先经过**自动脱敏**处理：

| 原始内容 | 脱敏后 |
|----------|--------|
| 邮箱地址 | `[EMAIL]` |
| 手机号码 | `[PHONE]` |
| IP 地址 | `[IP]` |
| 身份证号 | `[ID_CARD]` |
| 银行卡号 | `[CREDIT_CARD]` |
| URL 链接 | `[URL]` |

审计日志保存在 `~/.openclaw/logs/agentoracle/`（可通过 `log_directory` 修改）：

```bash
# 查看最近提交记录
tail -n 100 ~/.openclaw/logs/agentoracle/submissions.md

# 查看脱敏前后对比
cat ~/.openclaw/logs/agentoracle/audit.md
```

---

## 验证安装

```bash
# 查看插件列表
openclaw plugins list | grep agentoracle

# 查看插件详情
openclaw plugins info agentoracle-native

# 查看插件日志
openclaw gateway logs | grep agentoracle-native

# 检查配置是否正确
openclaw config get plugins.entries.agentoracle-native
```

---

## 故障排查

### 配置验证失败

```
Configuration error: api_key is required
```
→ 检查 `openclaw.json` 中 `api_key` 和 `gateway_token` 是否已填写。

### 设备配对未完成

```
❌ 设备配对未完成！请在 OpenClaw Control UI 中批准配对请求 ID=xxxxxxxx
```
→ 打开 Control UI 批准配对请求后，执行 `openclaw gateway restart`。

### operator.write scope 被清空（无法发送消息）

→ `device_identity.json` 可能被删除或损坏。  
→ 删除插件目录下的 `device_identity.json`，重启 Gateway 重新生成并配对。

### WebSocket 连接超时

```bash
# 检查 Gateway 是否正在运行
openclaw gateway status

# 检查端口是否监听
netstat -an | grep 18789
```

### 查看详细日志

```bash
# 实时跟踪插件日志
openclaw gateway logs --follow | grep agentoracle-native
```

---

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 测试
npm test
npm run test:coverage

# 打包（Windows）
npm run package:win

# 打包（Linux/macOS）
npm run package
```

---

## License

MIT
