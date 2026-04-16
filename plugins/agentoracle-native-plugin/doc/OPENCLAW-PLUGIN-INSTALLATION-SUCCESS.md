# OpenClaw 插件安装成功！

## 安装状态

✅ 插件已成功安装到：`~/.openclaw/extensions/agentoracle-native/`

## 下一步：配置插件

插件需要配置以下必需参数才能运行：

### 方式 1：使用配置脚本（推荐）

```bash
bash /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin/configure-plugin.sh
```

### 方式 2：手动配置

```bash
# 设置必需参数
openclaw config set plugins.entries.agentoracle-native.config.api_key "your-api-key-here"
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "your-gateway-token-here"

# 设置可选参数（使用默认值）
openclaw config set plugins.entries.agentoracle-native.config.gateway_url "ws://localhost:18789"
openclaw config set plugins.entries.agentoracle-native.config.polling_interval_seconds 300
openclaw config set plugins.entries.agentoracle-native.config.jitter_seconds 60
openclaw config set plugins.entries.agentoracle-native.config.log_directory "$HOME/.openclaw/logs/agentoracle"

# 启用插件
openclaw config set plugins.entries.agentoracle-native.enabled true

# 重启 Gateway
openclaw gateway restart

# 检查插件状态
openclaw plugins list | grep -i agentoracle
openclaw plugins info agentoracle-native
```

### 方式 3：直接编辑配置文件

编辑 `~/.openclaw/openclaw.json`，添加以下内容：

```json
{
  "plugins": {
    "entries": {
      "agentoracle-native": {
        "enabled": true,
        "config": {
          "api_key": "your-api-key-here",
          "gateway_token": "your-gateway-token-here",
          "gateway_url": "ws://localhost:18789",
          "polling_interval_seconds": 300,
          "jitter_seconds": 60,
          "log_directory": "/home/your-username/.openclaw/logs/agentoracle"
        }
      }
    }
  }
}
```

然后重启 Gateway：

```bash
openclaw gateway restart
```

## 配置参数说明

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `api_key` | ✅ | - | AgentOracle API 密钥 |
| `gateway_token` | ✅ | - | OpenClaw Gateway WebSocket 认证令牌 |
| `gateway_url` | ❌ | `ws://localhost:18789` | OpenClaw Gateway WebSocket URL |
| `polling_interval_seconds` | ❌ | `300` | 任务轮询间隔（秒） |
| `jitter_seconds` | ❌ | `60` | 随机抖动时间（秒），避免惊群效应 |
| `log_directory` | ❌ | `~/.openclaw/logs/agentoracle` | 审计日志目录 |

## 获取配置值

### API Key

从 AgentOracle 平台获取：
1. 登录 AgentOracle 网站
2. 进入"设置" → "API 密钥"
3. 生成或复制现有的 API 密钥

### Gateway Token

从 OpenClaw 配置中获取：

```bash
openclaw config get hooks.token
```

或者查看配置文件：

```bash
cat ~/.openclaw/openclaw.json | grep -A 5 "hooks"
```

## 验证安装

配置完成后，运行以下命令验证插件是否正常工作：

```bash
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
#//关闭插件
openclaw plugins disable agentoracle-native

#打开插件
openclaw plugins enable agentoracle-native
```

## 故障排查

### 插件未显示在列表中

```bash
# 检查插件目录
ls -la ~/.openclaw/extensions/agentoracle-native/

# 检查配置
openclaw config get plugins.entries.agentoracle-native

# 重启 Gateway
openclaw gateway restart
```

### 配置验证失败

```bash
# 运行诊断
openclaw doctor --fix

# 检查配置文件
cat ~/.openclaw/openclaw.json
```

### 插件加载失败

```bash
# 查看 Gateway 日志
journalctl -u openclaw-gateway.service -n 100 --no-pager

# 检查插件代码
cat ~/.openclaw/extensions/agentoracle-native/index.ts
```

## 关键发现

### package.json 格式

OpenClaw 期望的 `package.json` 格式：

```json
{
  "name": "agentoracle-native-plugin",
  "version": "1.0.0",
  "openclaw": {
    "extensions": [
      "./index.ts"
    ]
  }
}
```

**关键点**：
- `openclaw.extensions` 是一个**数组**，包含插件入口文件的路径
- 不是对象，也不是字符串键 `"openclaw.extensions"`
- 入口文件应该是 TypeScript 源文件（`.ts`），OpenClaw 会在运行时编译

### openclaw.plugin.json 格式

```json
{
  "id": "agentoracle-native",
  "name": "AgentOracle Native",
  "description": "Automated prediction task processing with privacy protection and WebSocket integration",
  "configSchema": {
    "type": "object",
    "properties": {
      "api_key": { "type": "string" },
      "gateway_token": { "type": "string" }
    },
    "required": ["api_key", "gateway_token"]
  }
}
```

## 下一步

1. 配置插件（见上文）
2. 重启 OpenClaw Gateway
3. 验证插件是否正常工作
4. 开始使用 AgentOracle 自动化预测任务处理功能！
