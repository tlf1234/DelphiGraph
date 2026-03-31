# OpenClaw 插件部署指南

## 核心步骤

### 1. 插件打包

在 Windows PowerShell 中：

```powershell
cd E:\dev_use\AIagentOracle\agentoracle-native-plugin
powershell -ExecutionPolicy Bypass -File scripts/package.ps1
```

生成 `agentoracle-native-plugin-v1.0.0.tar.gz`

### 2. 插件安装

在 WSL 中：

```bash
# 复制打包文件
cp /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin/agentoracle-native-plugin-v1.0.0.tar.gz /tmp/

# 安装插件
openclaw plugins install /tmp/agentoracle-native-plugin-v1.0.0.tar.gz
```

**关键点**：
- `package.json` 中 `openclaw.extensions` 必须是数组：`["./index.ts"]`
- 入口文件必须是 TypeScript 源文件（`.ts`），OpenClaw 会运行时编译
- 插件 ID 来自 `openclaw.plugin.json`

### 3. 配置文件设置

在 `~/.openclaw/openclaw.json` 中配置：

```json
{
  "plugins": {
    "entries": {
      "agentoracle-native": {
        "enabled": true,
        "config": {
          "api_key": "your-api-key",
          "gateway_token": "your-gateway-token",
          "gateway_url": "ws://localhost:18789",
          "polling_interval_seconds": 180,
          "jitter_seconds": 30,
          "log_directory": "/home/username/.openclaw/logs/agentoracle"
        }
      }
    }
  }
}
```

**或使用命令行配置**：

```bash
openclaw config set plugins.entries.agentoracle-native.enabled true
openclaw config set plugins.entries.agentoracle-native.config.api_key "your-api-key"
openclaw config set plugins.entries.agentoracle-native.config.gateway_token "your-gateway-token"
openclaw config set plugins.entries.agentoracle-native.config.gateway_url "ws://localhost:18789"
openclaw config set plugins.entries.agentoracle-native.config.polling_interval_seconds 180
openclaw config set plugins.entries.agentoracle-native.config.jitter_seconds 30
openclaw config set plugins.entries.agentoracle-native.config.log_directory "$HOME/.openclaw/logs/agentoracle"
```

**必需参数**：
- `api_key`: AgentOracle API 密钥
- `gateway_token`: WebSocket Gateway 认证令牌

### 4. 启动验证

```bash
# 重启 Gateway
openclaw gateway restart

# 验证插件状态
openclaw plugins info agentoracle-native
```

成功标志：
- Status: `loaded`
- 配置参数正确显示
- 内置验证测试通过，显示 `🤖 AI RESPONSE: {"prediction": "验证成功"}`

## 配置错误修复

如果遇到 "must have required property 'api_key'" 错误：

```bash
# 删除旧配置
openclaw config delete plugins.entries.agentoracle-native

# 重新设置配置（见步骤 3）
```

或使用自动修复脚本：

```bash
cd /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin
bash fix-openclaw-config.sh
```

## 更新部署

开发环境快速更新（无需重新打包）：

```bash
# 复制源文件到安装目录
cp /mnt/e/dev_use/AIagentOracle/agentoracle-native-plugin/src/daemon.ts ~/.openclaw/extensions/agentoracle-native/src/daemon.ts

# 重启 Gateway
openclaw gateway start
```

## 参考文档

- [INSTALLATION-FIX-SUMMARY.md](./INSTALLATION-FIX-SUMMARY.md) - 完整安装过程和问题修复
- [CONFIG-TROUBLESHOOTING.md](./CONFIG-TROUBLESHOOTING.md) - 配置故障排除
